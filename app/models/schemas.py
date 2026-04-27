"""
Pydantic схемы для валидации и сериализации данных API
Включает схемы для аутентификации, авторизации, объектов и администрирования
"""

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator
import re


# ============================================================================
# СХЕМЫ АУТЕНТИФИКАЦИИ
# ============================================================================


class UserRegisterRequest(BaseModel):
    """Запрос для регистрации нового пользователя"""

    username: str = Field(
        ..., min_length=3, max_length=100, description="Уникальное имя пользователя"
    )
    email: EmailStr = Field(..., description="Email адрес")
    password: str = Field(..., min_length=8, description="Пароль (минимум 8 символов)")
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v):
        """Проверка надежности пароля"""
        if not re.search(r"[A-Z]", v):
            raise ValueError("Пароль должен содержать хотя бы одну заглавную букву")
        if not re.search(r"[a-z]", v):
            raise ValueError("Пароль должен содержать хотя бы одну строчную букву")
        if not re.search(r"[0-9]", v):
            raise ValueError("Пароль должен содержать хотя бы одну цифру")
        return v


class UserLoginRequest(BaseModel):
    """Запрос для входа пользователя"""

    email: str = Field(..., description="Email или username")
    password: str = Field(..., description="Пароль")


class TokenResponse(BaseModel):
    """Ответ с токеном доступа"""

    access_token: str = Field(..., description="JWT токен доступа")
    token_type: str = Field("bearer", description="Тип токена")
    expires_in: int = Field(..., description="Время истечения токена в секундах")
    user: Optional["UserResponse"] = Field(
        None, description="Информация о пользователе"
    )


class UserChangePasswordRequest(BaseModel):
    """Запрос для смены пароля"""

    old_password: str = Field(..., description="Текущий пароль")
    new_password: str = Field(..., min_length=8, description="Новый пароль")
    confirm_password: str = Field(..., description="Подтверждение нового пароля")

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v):
        """Проверка надежности нового пароля"""
        if not re.search(r"[A-Z]", v):
            raise ValueError("Пароль должен содержать хотя бы одну заглавную букву")
        if not re.search(r"[a-z]", v):
            raise ValueError("Пароль должен содержать хотя бы одну строчную букву")
        if not re.search(r"[0-9]", v):
            raise ValueError("Пароль должен содержать хотя бы одну цифру")
        return v


# ============================================================================
# СХЕМЫ ПОЛЬЗОВАТЕЛЕЙ
# ============================================================================


class UserResponse(BaseModel):
    """Ответ с информацией о пользователе"""

    id: int
    username: str
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    avatar_url: Optional[str] = None
    is_active: bool
    is_verified: bool
    created_at: datetime
    roles: List[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


class UserDetailResponse(UserResponse):
    """Подробная информация о пользователе (для администратора)"""

    last_login: Optional[datetime] = None
    updated_at: datetime
    permissions: List[str] = Field(default_factory=list)


class UserListRequest(BaseModel):
    """Запрос для получения списка пользователей"""

    search: Optional[str] = Field(None, description="Поиск по имени или email")
    is_active: Optional[bool] = Field(None, description="Фильтр по статусу активности")
    is_verified: Optional[bool] = Field(
        None, description="Фильтр по статусу верификации"
    )
    role: Optional[str] = Field(None, description="Фильтр по роли")
    limit: int = Field(100, ge=1, le=1000)
    offset: int = Field(0, ge=0)


class UserUpdateRequest(BaseModel):
    """Запрос для обновления профиля пользователя"""

    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    avatar_url: Optional[str] = Field(None, max_length=500)


class UserAdminUpdateRequest(UserUpdateRequest):
    """Запрос для обновления пользователя администратором"""

    is_active: Optional[bool] = None
    is_verified: Optional[bool] = None


# ============================================================================
# СХЕМЫ РОЛЕЙ И РАЗРЕШЕНИЙ
# ============================================================================


class PermissionResponse(BaseModel):
    """Информация о разрешении"""

    id: int
    name: str
    description: Optional[str] = None
    category: Optional[str] = None

    class Config:
        from_attributes = True


class RoleResponse(BaseModel):
    """Информация о роли"""

    id: int
    name: str
    description: Optional[str] = None
    is_system: bool = False
    permissions: List[str] = Field(default_factory=list)
    created_at: datetime

    class Config:
        from_attributes = True


class RoleCreateRequest(BaseModel):
    """Запрос для создания новой роли"""

    name: str = Field(..., min_length=3, max_length=100, description="Название роли")
    description: Optional[str] = Field(None, description="Описание роли")
    permission_ids: List[int] = Field(
        default_factory=list, description="IDs разрешений для роли"
    )


class RoleUpdateRequest(BaseModel):
    """Запрос для обновления роли"""

    description: Optional[str] = None
    permission_ids: Optional[List[int]] = None


class UserRoleAssignRequest(BaseModel):
    """Запрос для назначения роли пользователю"""

    role_id: int = Field(..., description="ID роли")
    user_id: int = Field(..., description="ID пользователя")


class UserRoleRevokeRequest(BaseModel):
    """Запрос для отзыва роли пользователя"""

    role_id: int = Field(..., description="ID роли")
    user_id: int = Field(..., description="ID пользователя")


# ============================================================================
# СХЕМЫ МЕТОК
# ============================================================================


class LabelResponse(BaseModel):
    """Информация о метке"""

    id: int
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True


class LabelCreateRequest(BaseModel):
    """Запрос для создания новой метки"""

    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class LabelUpdateRequest(BaseModel):
    """Запрос для обновления метки"""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


# ============================================================================
# СХЕМЫ СПРАВОЧНИКОВ
# ============================================================================


class CategoryResponse(BaseModel):
    """Информация о категории"""

    id: int
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None

    class Config:
        from_attributes = True


class CategoryCreateRequest(BaseModel):
    """Запрос для создания категории"""

    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None


class StatusResponse(BaseModel):
    """Информация о статусе (deprecated)"""
    pass


class StatusCreateRequest(BaseModel):
    """Запрос для создания статуса (deprecated)"""
    pass


class CityResponse(BaseModel):
    """Информация о городе (deprecated)"""
    pass


class CityCreateRequest(BaseModel):
    """Запрос для создания города (deprecated)"""
    pass


# ============================================================================
# СХЕМЫ ГЕОГРАФИЧЕСКИХ ОБЪЕКТОВ
# ============================================================================


class GeoObjectResponse(BaseModel):
    """Информация о географическом объекте"""

    id: int
    name: str
    address: Optional[str] = None
    description: Optional[str] = None
    latitude: float
    longitude: float
    category_id: Optional[int] = None
    is_verified: bool = False
    created_at: datetime
    labels: List[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


class GeoObjectCreateRequest(BaseModel):
    """Запрос для создания нового объекта"""

    name: str = Field(..., min_length=1, max_length=255)
    address: Optional[str] = None
    description: Optional[str] = None
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    category_id: Optional[int] = None
    label_ids: List[int] = Field(default_factory=list)


class GeoObjectUpdateRequest(BaseModel):
    """Запрос для обновления объекта"""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    address: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    category_id: Optional[int] = None
    label_ids: Optional[List[int]] = None


class GeoObjectFilterRequest(BaseModel):
    """Запрос для фильтрации объектов"""

    search: Optional[str] = None
    category_id: Optional[int] = None
    label_ids: Optional[List[int]] = None
    bbox: Optional[str] = None  # minLon,minLat,maxLon,maxLat
    is_verified: Optional[bool] = None
    limit: int = Field(100, ge=1, le=1000)
    offset: int = Field(0, ge=0)


# ============================================================================
# СХЕМЫ ЛОГИРОВАНИЯ
# ============================================================================


class AuditLogResponse(BaseModel):
    """Информация о логе действия"""

    id: int
    user_id: Optional[int] = None
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[int] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogFilterRequest(BaseModel):
    """Запрос для фильтрации логов"""

    user_id: Optional[int] = None
    action: Optional[str] = None
    resource_type: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    limit: int = Field(100, ge=1, le=1000)
    offset: int = Field(0, ge=0)


# ============================================================================
# ОБЩИЕ СХЕМЫ ОТВЕТОВ
# ============================================================================


class PaginatedResponse(BaseModel):
    """Шаблон для paginated ответов"""

    items: List = Field(...)
    total: int = Field(...)
    limit: int = Field(...)
    offset: int = Field(...)


class ErrorResponse(BaseModel):
    """Схема ошибки"""

    code: str = Field(..., description="Код ошибки")
    message: str = Field(..., description="Сообщение об ошибке")
    details: Optional[dict] = Field(None, description="Дополнительные детали")


class SuccessResponse(BaseModel):
    """Схема успешного ответа"""

    success: bool = True
    message: str = Field(..., description="Сообщение")
    data: Optional[dict] = Field(None, description="Данные ответа")


# Update forward references
TokenResponse.model_rebuild()
