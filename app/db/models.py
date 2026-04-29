"""
SQLAlchemy ORM модели для Yandex GeoBase
Включает модели для пользователей, ролей, объектов и администрирования
"""

from datetime import datetime
from typing import List, Optional
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    Boolean,
    Float,
    ForeignKey,
    Table,
    JSON,
    Index,
    func,
    UniqueConstraint,
    Numeric,
)
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()

# ============================================================================
# АССОЦИАТИВНЫЕ ТАБЛИЦЫ (Many-to-Many)
# ============================================================================

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column(
        "user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    ),
    Column(
        "role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    ),
    Column("assigned_at", DateTime, default=datetime.utcnow),
    Column("assigned_by", Integer, ForeignKey("users.id")),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column(
        "role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True
    ),
    Column(
        "permission_id",
        Integer,
        ForeignKey("permissions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("created_at", DateTime, default=datetime.utcnow),
    UniqueConstraint("role_id", "permission_id"),
)

object_labels = Table(
    "object_labels",
    Base.metadata,
    Column(
        "object_id",
        Integer,
        ForeignKey("geo_objects.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "label_id",
        Integer,
        ForeignKey("labels.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("created_at", DateTime, default=datetime.utcnow),
    UniqueConstraint("object_id", "label_id"),
)

# ============================================================================
# МОДЕЛИ ПОЛЬЗОВАТЕЛЕЙ И РОЛЕЙ
# ============================================================================


class User(Base):
    """Модель пользователя системы"""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    is_verified = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Отношения
    roles = relationship(
        "Role",
        secondary=user_roles,
        back_populates="users",
        foreign_keys=[user_roles.c.user_id, user_roles.c.role_id],
    )
    sessions = relationship(
        "Session", back_populates="user", cascade="all, delete-orphan"
    )
    geo_objects_created = relationship(
        "GeoObject", foreign_keys="GeoObject.created_by", back_populates="creator"
    )
    geo_objects_updated = relationship(
        "GeoObject", foreign_keys="GeoObject.updated_by", back_populates="updater"
    )
    audit_logs = relationship("AuditLog", back_populates="user")
    labels = relationship("Label", back_populates="created_by_user")
    comments = relationship("ObjectComment", back_populates="user")

    def has_role(self, role_name: str) -> bool:
        """Проверить наличие роли"""
        return any(role.name == role_name for role in self.roles)

    def has_permission(self, permission_name: str) -> bool:
        """Проверить наличие разрешения через роли"""
        for role in self.roles:
            if any(perm.name == permission_name for perm in role.permissions):
                return True
        return False

    def __repr__(self):
        return f"<User {self.username}>"


class Role(Base):
    """Модель роли с правами доступа"""

    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    is_system = Column(Boolean, default=False)  # системная роль
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Отношения
    users = relationship(
        "User",
        secondary=user_roles,
        back_populates="roles",
        foreign_keys=[user_roles.c.user_id, user_roles.c.role_id],
    )
    permissions = relationship("Permission", secondary=role_permissions)

    def __repr__(self):
        return f"<Role {self.name}>"


class Permission(Base):
    """Модель разрешения (дискретного права)"""

    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    category = Column(String(50), index=True)  # users, roles, objects, reports, system
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<Permission {self.name}>"


class Session(Base):
    """Модель сессии/токена пользователя"""

    __tablename__ = "sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash = Column(String(255), unique=True, nullable=False, index=True)
    ip_address = Column(INET, nullable=True)
    user_agent = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_activity = Column(DateTime, default=datetime.utcnow)

    # Отношения
    user = relationship("User", back_populates="sessions")

    def is_valid(self) -> bool:
        """Проверить валидность сессии"""
        return datetime.utcnow() < self.expires_at

    def __repr__(self):
        return f"<Session user_id={self.user_id}>"


class AuditLog(Base):
    """Модель логирования действий администратора"""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action = Column(String(100), nullable=False, index=True)
    resource_type = Column(String(50), index=True)
    resource_id = Column(Integer, nullable=True)
    changes = Column(JSON, nullable=True)  # перед и после для изменений
    ip_address = Column(INET, nullable=True)
    user_agent = Column(Text, nullable=True)
    status = Column(String(20), default="success")
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Отношения
    user = relationship("User", back_populates="audit_logs")

    def __repr__(self):
        return f"<AuditLog {self.action} by user_id={self.user_id}>"

    @staticmethod
    def log(
        db,
        user_id: int,
        action: str,
        resource_type: str = None,
        resource_id: int = None,
        changes: dict = None,
        status: str = "success",
        error_message: str = None,
    ):
        """Записать логину действия администратора"""
        audit_log = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            changes=changes,
            status=status,
            error_message=error_message,
        )
        db.add(audit_log)
        db.commit()
        return audit_log


# ============================================================================
# МОДЕЛИ СПРАВОЧНИКОВ
# ============================================================================


class CategoryReference(Base):
    """Модель справочника категорий"""

    __tablename__ = "categories_reference"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    icon = Column(String(255), nullable=True)
    color = Column(String(7), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Отношения
    geo_objects = relationship("GeoObject", back_populates="category")

    def __repr__(self):
        return f"<Category {self.name}>"


class Label(Base):
    """Модель метки для классификации объектов"""

    __tablename__ = "labels"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    color = Column(String(7), nullable=True)
    icon = Column(String(255), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Отношения
    created_by_user = relationship("User", back_populates="labels")
    geo_objects = relationship(
        "GeoObject", secondary=object_labels, back_populates="labels"
    )

    def __repr__(self):
        return f"<Label {self.name}>"


# ============================================================================
# МОДЕЛИ ГЕОГРАФИЧЕСКИХ ОБЪЕКТОВ
# ============================================================================


class GeoObject(Base):
    """Модель географического объекта"""

    __tablename__ = "geo_objects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    address = Column(Text, nullable=True)  # Текстовый адрес метки
    description = Column(Text, nullable=True)
    category_id = Column(Integer, ForeignKey("categories_reference.id"))
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    image_url = Column(Text, nullable=True)  # URL изображения метки (base64 или URL)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_verified = Column(Boolean, default=False, index=True)
    verified_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Отношения
    category = relationship("CategoryReference", back_populates="geo_objects")
    creator = relationship(
        "User", foreign_keys=[created_by], back_populates="geo_objects_created"
    )
    updater = relationship(
        "User", foreign_keys=[updated_by], back_populates="geo_objects_updated"
    )
    labels = relationship(
        "Label", secondary=object_labels, back_populates="geo_objects"
    )
    comments = relationship(
        "ObjectComment", back_populates="geo_object", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("idx_geo_objects_coords_brin", "latitude", "longitude"),)

    def __repr__(self):
        return f"<GeoObject {self.name}>"


class ObjectComment(Base):
    """Модель комментария к объекту"""

    __tablename__ = "object_comments"

    id = Column(Integer, primary_key=True, index=True)
    object_id = Column(
        Integer, ForeignKey("geo_objects.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    comment = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Отношения
    geo_object = relationship("GeoObject", back_populates="comments")
    user = relationship("User", back_populates="comments")

    def __repr__(self):
        return f"<ObjectComment on object_id={self.object_id}>"
