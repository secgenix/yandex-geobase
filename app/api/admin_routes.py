"""
API endpoints админ-панели для управления пользователями, ролями, метками и логами
"""

from datetime import datetime
import csv
import io
import secrets
import string
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from app.db.pool import get_db
from app.db.models import User, Role, Permission, Label, AuditLog, CategoryReference
from app.models.schemas import (
    UserDetailResponse,
    UserAdminCreateRequest, UserAdminCreateResponse, UserBulkStatusRequest,
    RoleResponse, RoleCreateRequest, RoleUpdateRequest,
    PermissionResponse, UserRoleAssignRequest, UserRoleRevokeRequest,
    LabelResponse, LabelCreateRequest, LabelUpdateRequest,
    CategoryResponse, CategoryCreateRequest, CategoryUpdateRequest,
    OrganizationResponse, OrganizationCreateRequest, OrganizationUpdateRequest,
    AuditLogResponse,
    PaginatedResponse, SuccessResponse, UserAdminUpdateRequest
)
from app.core.dependencies import get_current_user, require_admin
from app.core.security import hash_password

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ============================================================================
# УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ
# ============================================================================


def build_user_detail_response(user: User) -> UserDetailResponse:
    return UserDetailResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        avatar_url=user.avatar_url,
        is_active=user.is_active,
        is_verified=user.is_verified,
        created_at=user.created_at,
        last_login=user.last_login,
        updated_at=user.updated_at,
        roles=[r.name for r in user.roles],
        permissions=list(set(p.name for r in user.roles for p in r.permissions))
    )


def generate_temporary_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        if any(c.islower() for c in password) and any(c.isupper() for c in password) and any(c.isdigit() for c in password):
            return password


def safe_csv_value(value) -> str:
    text = "" if value is None else str(value)
    if text.startswith(("=", "+", "-", "@")):
        return "'" + text
    return text


def get_roles_by_ids(db: Session, role_ids: List[int]) -> List[Role]:
    if not role_ids:
        return []
    roles = db.query(Role).filter(Role.id.in_(role_ids)).all()
    if len(roles) != len(set(role_ids)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Одна или несколько ролей не найдены")
    return roles

@router.get("/users", response_model=PaginatedResponse)
async def list_users(
    search: str = Query(None, description="Поиск по username или email"),
    is_active: bool = Query(None, description="Фильтр по активности"),
    role: str = Query(None, description="Фильтр по роли"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Получить список пользователей с фильтрацией
    
    Требуется роль: **admin**
    """
    
    query = db.query(User)
    
    # Применить фильры
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (User.username.ilike(search_pattern)) |
            (User.email.ilike(search_pattern))
        )
    
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    
    if role:
        query = query.join(User.roles).filter(Role.name == role)
    
    # Получить общее количество
    total = query.count()
    
    # Применить пагинацию
    users = query.order_by(desc(User.created_at)).limit(limit).offset(offset).all()
    
    items = [
        UserDetailResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            first_name=u.first_name,
            last_name=u.last_name,
            avatar_url=u.avatar_url,
            is_active=u.is_active,
            is_verified=u.is_verified,
            created_at=u.created_at,
            last_login=u.last_login,
            updated_at=u.updated_at,
            roles=[r.name for r in u.roles],
            permissions=list(set(p.name for r in u.roles for p in r.permissions))
        )
        for u in users
    ]
    
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/users/export")
async def export_users(
    search: str = Query(None),
    is_active: bool = Query(None),
    role: str = Query(None),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    query = db.query(User)
    if search:
        search_pattern = f"%{search}%"
        query = query.filter((User.username.ilike(search_pattern)) | (User.email.ilike(search_pattern)))
    if is_active is not None:
        query = query.filter(User.is_active == is_active)
    if role:
        query = query.join(User.roles).filter(Role.name == role)

    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow(["id", "username", "email", "first_name", "last_name", "is_active", "is_verified", "roles", "created_at", "last_login"])
    for user in query.order_by(desc(User.created_at)).all():
        writer.writerow([
            user.id,
            safe_csv_value(user.username),
            safe_csv_value(user.email),
            safe_csv_value(user.first_name),
            safe_csv_value(user.last_name),
            user.is_active,
            user.is_verified,
            safe_csv_value(";".join(role.name for role in user.roles)),
            user.created_at.isoformat() if user.created_at else "",
            user.last_login.isoformat() if user.last_login else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=users.csv"},
    )


@router.post("/users", response_model=UserAdminCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    request: UserAdminCreateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    existing_user = db.query(User).filter((User.email == request.email) | (User.username == request.username)).first()
    if existing_user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Пользователь с таким email или username уже существует")

    temporary_password = request.password or generate_temporary_password()
    roles = get_roles_by_ids(db, request.role_ids)
    if not roles:
        default_role = db.query(Role).filter(Role.name == "user").first()
        if default_role:
            roles = [default_role]

    user = User(
        username=request.username,
        email=request.email,
        first_name=request.first_name,
        last_name=request.last_name,
        is_active=request.is_active,
        is_verified=request.is_verified,
        password_hash=hash_password(temporary_password),
    )
    user.roles = roles
    db.add(user)
    db.commit()
    db.refresh(user)

    AuditLog.log(db=db, user_id=admin.id, action='create', resource_type='user', resource_id=user.id, status='success')

    base = build_user_detail_response(user).model_dump()
    return UserAdminCreateResponse(**base, temporary_password=None if request.password else temporary_password)


@router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user(
    user_id: int,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Получить подробную информацию о пользователе
    
    Требуется роль: **admin**
    """
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден"
        )
    
    return build_user_detail_response(user)


@router.put("/users/{user_id}", response_model=UserDetailResponse)
async def update_user(
    user_id: int,
    request: UserAdminUpdateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Обновить информацию о пользователе (администратор)
    
    Требуется роль: **admin**
    """
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден"
        )
    
    if request.email is not None and request.email != user.email:
        existing = db.query(User).filter(User.email == request.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email уже используется")
        user.email = request.email
    if request.first_name is not None:
        user.first_name = request.first_name
    if request.last_name is not None:
        user.last_name = request.last_name
    if request.avatar_url is not None:
        user.avatar_url = request.avatar_url
    if request.is_active is not None:
        user.is_active = request.is_active
    if request.is_verified is not None:
        user.is_verified = request.is_verified
    if request.password:
        user.password_hash = hash_password(request.password)
    if request.role_ids is not None:
        new_roles = get_roles_by_ids(db, request.role_ids)
        if user.id == admin.id and not any(role.name == "admin" for role in new_roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нельзя снять роль admin у самого себя")
        user.roles = new_roles
    
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    
    # Логирование действия
    AuditLog.log(
        db=db,
        user_id=admin.id,
        action='update',
        resource_type='user',
        resource_id=user.id,
        status='success'
    )
    
    return build_user_detail_response(user)


@router.post("/users/bulk-status", response_model=SuccessResponse)
async def bulk_update_user_status(
    request: UserBulkStatusRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    if admin.id in request.user_ids and request.is_active is False:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нельзя деактивировать самого себя")

    users = db.query(User).filter(User.id.in_(request.user_ids)).all()
    for user in users:
        user.is_active = request.is_active
        user.updated_at = datetime.utcnow()
    db.commit()

    AuditLog.log(db=db, user_id=admin.id, action='bulk_update_status', resource_type='user', resource_id=None, status='success')
    return SuccessResponse(message=f"Обновлено пользователей: {len(users)}")


@router.delete("/users/{user_id}", response_model=SuccessResponse)
async def delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Удалить пользователя
    
    Требуется роль: **admin**
    """
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден"
        )
    
    # Нельзя удалять администраторов без явного подтверждения
    if user.has_role("admin") and user.id != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Невозможно удалить администратора"
        )
    
    username = user.username
    db.delete(user)
    db.commit()
    
    # Логирование действия
    AuditLog.log(
        db=db,
        user_id=admin.id,
        action='delete',
        resource_type='user',
        resource_id=user_id,
        status='success'
    )
    
    return SuccessResponse(message=f"Пользователь {username} удален")


# ============================================================================
# УПРАВЛЕНИЕ РОЛЯМИ ПОЛЬЗОВАТЕЛЕЙ
# ============================================================================

@router.post("/users/{user_id}/roles/assign", response_model=SuccessResponse)
async def assign_role_to_user(
    user_id: int,
    request: UserRoleAssignRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Назначить роль пользователю
    
    Требуется роль: **admin**
    """
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден"
        )
    
    role = db.query(Role).filter(Role.id == request.role_id).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Роль не найдена"
        )
    
    # Проверить, уже ли есть эта роль
    if role in user.roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь уже имеет эту роль"
        )
    
    user.roles.append(role)
    db.commit()
    
    # Логирование действия
    AuditLog.log(
        db=db,
        user_id=admin.id,
        action='assign_role',
        resource_type='user',
        resource_id=user_id,
        status='success'
    )
    
    return SuccessResponse(message=f"Роль {role.name} назначена пользователю {user.username}")


@router.post("/users/{user_id}/roles/revoke", response_model=SuccessResponse)
async def revoke_role_from_user(
    user_id: int,
    request: UserRoleRevokeRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Отозвать роль пользователя
    
    Требуется роль: **admin**
    """
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден"
        )
    
    role = db.query(Role).filter(Role.id == request.role_id).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Роль не найдена"
        )
    
    # Проверить, есть ли эта роль
    if role not in user.roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь не имеет эту роль"
        )
    
    # Нельзя отозвать последнюю роль админа
    if role.name == "admin" and user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Невозможно отозвать роль администратора у самого себя"
        )
    
    user.roles.remove(role)
    db.commit()
    
    # Логирование действия
    AuditLog.log(
        db=db,
        user_id=admin.id,
        action='revoke_role',
        resource_type='user',
        resource_id=user_id,
        status='success'
    )
    
    return SuccessResponse(message=f"Роль {role.name} отозвана у пользователя {user.username}")


# ============================================================================
# УПРАВЛЕНИЕ РОЛЯМИ
# ============================================================================

@router.get("/roles", response_model=PaginatedResponse)
async def list_roles(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Получить список всех ролей
    
    Требуется роль: **admin**
    """
    
    query = db.query(Role)
    total = query.count()
    
    roles = query.order_by(Role.name).limit(limit).offset(offset).all()
    
    items = [
        RoleResponse(
            id=r.id,
            name=r.name,
            description=r.description,
            is_system=r.is_system,
            permissions=[p.name for p in r.permissions],
            created_at=r.created_at
        )
        for r in roles
    ]
    
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("/roles", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
async def create_role(
    request: RoleCreateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Создать новую роль
    
    Требуется роль: **admin**
    """
    
    # Проверить, не существует ли роль с таким именем
    existing_role = db.query(Role).filter(Role.name == request.name).first()
    if existing_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Роль с таким именем уже существует"
        )
    
    # Создать роль
    new_role = Role(
        name=request.name,
        description=request.description,
        is_system=False
    )
    
    # Добавить разрешения
    if request.permission_ids:
        permissions = db.query(Permission).filter(
            Permission.id.in_(request.permission_ids)
        ).all()
        new_role.permissions = permissions
    
    db.add(new_role)
    db.commit()
    db.refresh(new_role)
    
    # Логирование действия
    AuditLog.log(
        db=db,
        user_id=admin.id,
        action='create',
        resource_type='role',
        resource_id=new_role.id,
        status='success'
    )
    
    return RoleResponse(
        id=new_role.id,
        name=new_role.name,
        description=new_role.description,
        is_system=new_role.is_system,
        permissions=[p.name for p in new_role.permissions],
        created_at=new_role.created_at
    )


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: int,
    request: RoleUpdateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Обновить роль
    
    Требуется роль: **admin**
    """
    
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Роль не найдена"
        )
    
    # Нельзя редактировать системные роли
    if role.is_system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Невозможно редактировать системную роль"
        )
    
    if request.name is not None and request.name != role.name:
        existing = db.query(Role).filter(Role.name == request.name, Role.id != role_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Роль с таким именем уже существует")
        role.name = request.name

    if request.description is not None:
        role.description = request.description
    
    if request.permission_ids is not None:
        permissions = db.query(Permission).filter(
            Permission.id.in_(request.permission_ids)
        ).all()
        role.permissions = permissions
    
    role.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(role)
    
    # Логирование действия
    AuditLog.log(
        db=db,
        user_id=admin.id,
        action='update',
        resource_type='role',
        resource_id=role.id,
        status='success'
    )
    
    return RoleResponse(
        id=role.id,
        name=role.name,
        description=role.description,
        is_system=role.is_system,
        permissions=[p.name for p in role.permissions],
        created_at=role.created_at
    )


@router.delete("/roles/{role_id}", response_model=SuccessResponse)
async def delete_role(
    role_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Удалить роль
    
    Требуется роль: **admin**
    """
    
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Роль не найдена"
        )
    
    # Нельзя удалять системные роли
    if role.is_system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Невозможно удалить системную роль"
        )
    
    # Проверить, есть ли пользователи с этой ролью
    user_count = db.query(func.count(User.id)).select_from(User).join(
        User.roles
    ).filter(Role.id == role_id).scalar()
    
    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Невозможно удалить роль: её используют {user_count} пользователей"
        )
    
    role_name = role.name
    db.delete(role)
    db.commit()
    
    # Логирование действия
    AuditLog.log(
        db=db,
        user_id=admin.id,
        action='delete',
        resource_type='role',
        resource_id=role_id,
        status='success'
    )
    
    return SuccessResponse(message=f"Роль {role_name} удалена")


# ============================================================================
# УПРАВЛЕНИЕ РАЗРЕШЕНИЯМИ
# ============================================================================

@router.get("/permissions", response_model=PaginatedResponse)
async def list_permissions(
    category: str = Query(None, description="Фильтр по категории"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    _: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Получить список всех разрешений
    
    Требуется роль: **admin**
    """
    
    query = db.query(Permission)
    
    if category:
        query = query.filter(Permission.category == category)
    
    total = query.count()
    
    permissions = query.order_by(Permission.name).limit(limit).offset(offset).all()
    
    items = [
        PermissionResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            category=p.category
        )
        for p in permissions
    ]
    
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


# ============================================================================
# УПРАВЛЕНИЕ МЕТКАМИ
# ============================================================================


def build_category_response(category: CategoryReference) -> CategoryResponse:
    return CategoryResponse(
        id=category.id,
        name=category.name,
        description=category.description,
        color=category.color,
        icon=category.icon,
    )


def build_organization_response(organization: Label) -> OrganizationResponse:
    return OrganizationResponse(
        id=organization.id,
        name=organization.name,
        description=organization.description,
        color=organization.color,
        icon=organization.icon,
        created_by=organization.created_by,
        created_at=organization.created_at,
    )


@router.get("/categories", response_model=PaginatedResponse)
async def list_categories(
    search: str = Query(None, description="Поиск по названию"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(CategoryReference)
    if search:
        query = query.filter(CategoryReference.name.ilike(f"%{search}%"))

    total = query.count()
    categories = query.order_by(CategoryReference.name).limit(limit).offset(offset).all()
    return PaginatedResponse(
        items=[build_category_response(category) for category in categories],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    request: CategoryCreateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    existing = db.query(CategoryReference).filter(CategoryReference.name == request.name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Категория с таким названием уже существует")

    category = CategoryReference(
        name=request.name,
        description=request.description,
        color=request.color,
        icon=request.icon,
        created_by=admin.id,
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    AuditLog.log(db=db, user_id=admin.id, action='create', resource_type='category', resource_id=category.id, status='success')
    return build_category_response(category)


@router.put("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: int,
    request: CategoryUpdateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    category = db.query(CategoryReference).filter(CategoryReference.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Категория не найдена")

    if request.name is not None:
        existing = db.query(CategoryReference).filter(CategoryReference.name == request.name, CategoryReference.id != category_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Категория с таким названием уже существует")
        category.name = request.name
    if request.description is not None:
        category.description = request.description
    if request.color is not None:
        category.color = request.color
    if request.icon is not None:
        category.icon = request.icon

    category.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(category)
    AuditLog.log(db=db, user_id=admin.id, action='update', resource_type='category', resource_id=category.id, status='success')
    return build_category_response(category)


@router.get("/organizations", response_model=PaginatedResponse)
async def list_organizations(
    search: str = Query(None, description="Поиск по названию"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(Label)
    if search:
        query = query.filter(Label.name.ilike(f"%{search}%"))

    total = query.count()
    organizations = query.order_by(Label.name).limit(limit).offset(offset).all()
    return PaginatedResponse(
        items=[build_organization_response(organization) for organization in organizations],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/organizations", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    request: OrganizationCreateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    existing = db.query(Label).filter(Label.name == request.name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Организация с таким названием уже существует")

    organization = Label(
        name=request.name,
        description=request.description,
        color=request.color,
        icon=request.icon,
        created_by=admin.id,
    )
    db.add(organization)
    db.commit()
    db.refresh(organization)
    AuditLog.log(db=db, user_id=admin.id, action='create', resource_type='organization', resource_id=organization.id, status='success')
    return build_organization_response(organization)


@router.put("/organizations/{organization_id}", response_model=OrganizationResponse)
async def update_organization(
    organization_id: int,
    request: OrganizationUpdateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    organization = db.query(Label).filter(Label.id == organization_id).first()
    if not organization:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Организация не найдена")

    if request.name is not None:
        existing = db.query(Label).filter(Label.name == request.name, Label.id != organization_id).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Организация с таким названием уже существует")
        organization.name = request.name
    if request.description is not None:
        organization.description = request.description
    if request.color is not None:
        organization.color = request.color
    if request.icon is not None:
        organization.icon = request.icon

    organization.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(organization)
    AuditLog.log(db=db, user_id=admin.id, action='update', resource_type='organization', resource_id=organization.id, status='success')
    return build_organization_response(organization)

@router.get("/labels", response_model=PaginatedResponse)
async def list_labels(
    search: str = Query(None, description="Поиск по названию"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Получить список всех меток
    """
    
    query = db.query(Label)
    
    if search:
        query = query.filter(Label.name.ilike(f"%{search}%"))
    
    total = query.count()
    
    labels = query.order_by(Label.name).limit(limit).offset(offset).all()
    
    items = [
        LabelResponse(
            id=l.id,
            name=l.name,
            description=l.description,
            color=l.color,
            icon=l.icon,
            created_by=l.created_by,
            created_at=l.created_at
        )
        for l in labels
    ]
    
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("/labels", response_model=LabelResponse, status_code=status.HTTP_201_CREATED)
async def create_label(
    request: LabelCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Создать новую метку
    """
    
    # Проверить, не существует ли метка с таким именем
    existing_label = db.query(Label).filter(Label.name == request.name).first()
    if existing_label:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Метка с таким названием уже существует"
        )
    
    new_label = Label(
        name=request.name,
        description=request.description,
        color=request.color,
        icon=request.icon,
        created_by=current_user.id
    )
    
    db.add(new_label)
    db.commit()
    db.refresh(new_label)
    
    # Логирование действия
    AuditLog.log(
        db=db,
        user_id=current_user.id,
        action='create',
        resource_type='label',
        resource_id=new_label.id,
        status='success'
    )
    
    return LabelResponse(
        id=new_label.id,
        name=new_label.name,
        description=new_label.description,
        color=new_label.color,
        icon=new_label.icon,
        created_by=new_label.created_by,
        created_at=new_label.created_at
    )


@router.put("/labels/{label_id}", response_model=LabelResponse)
async def update_label(
    label_id: int,
    request: LabelUpdateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Обновить метку
    
    Требуется роль: **admin**
    """
    
    label = db.query(Label).filter(Label.id == label_id).first()
    if not label:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Метка не найдена"
        )
    
    if request.name is not None:
        # Проверить уникальность нового имени
        existing = db.query(Label).filter(
            Label.name == request.name,
            Label.id != label_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Метка с таким названием уже существует"
            )
        label.name = request.name
    
    if request.description is not None:
        label.description = request.description
    if request.color is not None:
        label.color = request.color
    if request.icon is not None:
        label.icon = request.icon
    
    label.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(label)
    
    # Логирование действия
    AuditLog.log(
        db=db,
        user_id=admin.id,
        action='update',
        resource_type='label',
        resource_id=label.id,
        status='success'
    )
    
    return LabelResponse(
        id=label.id,
        name=label.name,
        description=label.description,
        color=label.color,
        icon=label.icon,
        created_by=label.created_by,
        created_at=label.created_at
    )


@router.delete("/labels/{label_id}", response_model=SuccessResponse)
async def delete_label(
    label_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Удалить метку
    
    Требуется роль: **admin**
    """
    
    label = db.query(Label).filter(Label.id == label_id).first()
    if not label:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Метка не найдена"
        )
    
    label_name = label.name
    db.delete(label)
    db.commit()
    
    # Логирование действия
    AuditLog.log(
        db=db,
        user_id=admin.id,
        action='delete',
        resource_type='label',
        resource_id=label_id,
        status='success'
    )
    
    return SuccessResponse(message=f"Метка {label_name} удалена")


# ============================================================================
# ПРОСМОТР ЛОГОВ
# ============================================================================

@router.get("/logs", response_model=PaginatedResponse)
async def list_logs(
    user_id: int = Query(None),
    action: str = Query(None),
    resource_type: str = Query(None),
    status_filter: str = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Получить логи действий администраторов
    
    Требуется роль: **admin**
    """
    
    query = db.query(AuditLog)
    
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if resource_type:
        query = query.filter(AuditLog.resource_type == resource_type)
    if status_filter:
        query = query.filter(AuditLog.status == status_filter)
    
    total = query.count()
    
    logs = query.order_by(desc(AuditLog.created_at)).limit(limit).offset(offset).all()
    
    items = [
        AuditLogResponse(
            id=log.id,
            user_id=log.user_id,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            status=log.status,
            error_message=log.error_message,
            created_at=log.created_at
        )
        for log in logs
    ]
    
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)
