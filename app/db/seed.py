"""Initial database fixtures for local/dev startup."""

from app.core.config import get_settings
from app.core.security import hash_password

from sqlalchemy.orm import Session

from app.db.models import Permission, Role, User


ROLE_FIXTURES = [
    ("admin", "Администратор системы с полными правами", True),
    ("moderator", "Модератор контента, может управлять объектами и пользователями", False),
    ("user", "Обычный пользователь, может просматривать и добавлять объекты", False),
    ("viewer", "Зритель, может только просматривать объекты", True),
]

PERMISSION_FIXTURES = [
    ("users.list", "Просмотр списка пользователей", "users"),
    ("users.view", "Просмотр информации пользователя", "users"),
    ("users.create", "Создание нового пользователя", "users"),
    ("users.update", "Редактирование пользователя", "users"),
    ("users.delete", "Удаление пользователя", "users"),
    ("users.ban", "Блокирование пользователя", "users"),
    ("roles.list", "Просмотр списка ролей", "roles"),
    ("roles.view", "Просмотр информации роли", "roles"),
    ("roles.create", "Создание новой роли", "roles"),
    ("roles.update", "Редактирование роли", "roles"),
    ("roles.delete", "Удаление роли", "roles"),
    ("roles.assign", "Назначение ролей пользователям", "roles"),
    ("objects.list", "Просмотр списка объектов", "objects"),
    ("objects.view", "Просмотр объекта", "objects"),
    ("objects.create", "Создание объекта", "objects"),
    ("objects.update", "Редактирование объекта", "objects"),
    ("objects.delete", "Удаление объекта", "objects"),
    ("objects.verify", "Верификация объекта", "objects"),
    ("objects.bulk_import", "Массовая загрузка объектов", "objects"),
    ("labels.list", "Просмотр списка меток", "objects"),
    ("labels.create", "Создание метки", "objects"),
    ("labels.update", "Редактирование метки", "objects"),
    ("labels.delete", "Удаление метки", "objects"),
    ("references.manage", "Управление категориями и справочниками", "objects"),
    ("logs.view", "Просмотр логов действий", "system"),
    ("logs.export", "Экспорт логов", "system"),
    ("system.settings", "Управление настройками системы", "system"),
    ("system.maintenance", "Техническое обслуживание", "system"),
]

ROLE_PERMISSION_NAMES = {
    "admin": [name for name, _, _ in PERMISSION_FIXTURES],
    "moderator": [
        "users.list",
        "users.view",
        "users.update",
        "users.ban",
        "objects.list",
        "objects.view",
        "objects.create",
        "objects.update",
        "objects.delete",
        "objects.verify",
        "labels.list",
        "labels.create",
        "labels.update",
        "labels.delete",
        "logs.view",
    ],
    "user": ["objects.list", "objects.view", "objects.create", "labels.list"],
    "viewer": ["objects.list", "objects.view", "labels.list"],
}


def _seed_default_admin(db: Session, admin_role: Role) -> None:
    settings = get_settings()
    username = settings.DEFAULT_ADMIN_USERNAME.strip()
    email = settings.DEFAULT_ADMIN_EMAIL.strip()
    password = settings.DEFAULT_ADMIN_PASSWORD

    if not username or not email or not password:
        print("[seed] Default admin is not configured. Set DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD in .env.")
        return

    admin = db.query(User).filter(User.username == username).first()
    if admin is None:
        email_owner = db.query(User).filter(User.email == email).first()
        if email_owner is not None:
            print(f"[seed] Default admin skipped: email {email!r} is already used by another user.")
            return

        admin = User(
            username=username,
            email=email,
            password_hash=hash_password(password),
            first_name=settings.DEFAULT_ADMIN_FIRST_NAME.strip() or None,
            last_name=settings.DEFAULT_ADMIN_LAST_NAME.strip() or None,
            is_active=True,
            is_verified=True,
        )
        db.add(admin)
        db.flush()
        print(f"[seed] Default admin {username!r} created.")
    else:
        if admin.email != email:
            email_owner = db.query(User).filter(User.email == email, User.id != admin.id).first()
            if email_owner is None:
                admin.email = email

        admin.is_active = True
        admin.is_verified = True
        if settings.DEFAULT_ADMIN_FIRST_NAME.strip():
            admin.first_name = settings.DEFAULT_ADMIN_FIRST_NAME.strip()
        if settings.DEFAULT_ADMIN_LAST_NAME.strip():
            admin.last_name = settings.DEFAULT_ADMIN_LAST_NAME.strip()

    if admin_role not in admin.roles:
        admin.roles.append(admin_role)


def seed_initial_data(db: Session) -> None:
    roles_by_name = {role.name: role for role in db.query(Role).all()}
    permissions_by_name = {permission.name: permission for permission in db.query(Permission).all()}

    for name, description, is_system in ROLE_FIXTURES:
        if name not in roles_by_name:
            role = Role(name=name, description=description, is_system=is_system)
            db.add(role)
            roles_by_name[name] = role

    for name, description, category in PERMISSION_FIXTURES:
        if name not in permissions_by_name:
            permission = Permission(name=name, description=description, category=category)
            db.add(permission)
            permissions_by_name[name] = permission

    db.flush()

    for role_name, permission_names in ROLE_PERMISSION_NAMES.items():
        role = roles_by_name[role_name]
        existing_permission_names = {permission.name for permission in role.permissions}
        for permission_name in permission_names:
            if permission_name not in existing_permission_names:
                role.permissions.append(permissions_by_name[permission_name])

    user_role = roles_by_name.get("user")
    if user_role:
        users_without_roles = db.query(User).filter(~User.roles.any()).all()
        for user in users_without_roles:
            user.roles.append(user_role)

    admin_role = roles_by_name.get("admin")
    if admin_role:
        _seed_default_admin(db, admin_role)

    db.commit()
