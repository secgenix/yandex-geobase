"""
API endpoints для аутентификации и авторизации пользователей
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.pool import get_db
from app.db.models import User, Role, Session as DBSession
from app.models.schemas import (
    UserRegisterRequest, UserLoginRequest, TokenResponse,
    UserResponse, UserChangePasswordRequest, SuccessResponse,
    UserDetailResponse
)
from app.core.security import hash_password, verify_password, create_access_token, verify_token, hash_token, is_strong_password
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else None


# ============================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================================================

def get_current_user_from_token(token: str, db: Session) -> Optional[User]:
    """Получить пользователя из токена"""
    payload = verify_token(token)
    if not payload:
        return None
    
    user_id = int(payload.get("sub"))
    user = db.query(User).filter(User.id == user_id).first()
    return user


# ============================================================================
# ENDPOINTS АУТЕНТИФИКАЦИИ
# ============================================================================

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: UserRegisterRequest,
    db: Session = Depends(get_db)
):
    """
    Регистрация нового пользователя
    
    **Требования к паролю:**
    - Минимум 8 символов
    - Хотя бы одна заглавная буква
    - Хотя бы одна строчная буква
    - Хотя бы одна цифра
    """
    
    # Проверка существования пользователя
    existing_user = db.query(User).filter(
        or_(User.email == request.email, User.username == request.username)
    ).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email или username уже существует"
        )
    
    # Проверка надежности пароля
    if not is_strong_password(request.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль должен содержать заглавные буквы, строчные буквы и цифры"
        )
    
    # Создание пользователя
    hashed_password = hash_password(request.password)
    
    new_user = User(
        username=request.username,
        email=request.email,
        password_hash=hashed_password,
        first_name=request.first_name,
        last_name=request.last_name
    )
    
    # Назначение роли 'user' по умолчанию
    user_role = db.query(Role).filter(Role.name == "user").first()
    if user_role:
        new_user.roles.append(user_role)
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return UserResponse(
        id=new_user.id,
        username=new_user.username,
        email=new_user.email,
        first_name=new_user.first_name,
        last_name=new_user.last_name,
        avatar_url=new_user.avatar_url,
        is_active=new_user.is_active,
        is_verified=new_user.is_verified,
        created_at=new_user.created_at,
        roles=[role.name for role in new_user.roles]
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: UserLoginRequest,
    http_request: Request,
    db: Session = Depends(get_db)
):
    """
    Вход пользователя в систему
    
    Возвращает JWT токен доступа
    """
    
    # Поиск пользователя по email или username
    user = db.query(User).filter(
        or_(User.email == request.email, User.username == request.email)
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email/username или пароль"
        )
    
    # Проверка пароля
    if not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email/username или пароль"
        )
    
    # Проверка активности пользователя
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователь неактивен"
        )
    
    # Обновление времени последнего входа
    now = utc_now_naive()
    user.last_login = now
    db.commit()
    
    # Создание токена
    roles = [role.name for role in user.roles]
    access_token, expires_in = create_access_token(
        user_id=user.id,
        username=user.username,
        roles=roles
    )
    
    # Сохранение сессии в БД
    token_hash = hash_token(access_token)
    expires_at = now + timedelta(seconds=expires_in)
    
    session = DBSession(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        ip_address=client_ip(http_request),
        user_agent=http_request.headers.get("user-agent"),
    )
    db.add(session)
    db.commit()
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=expires_in,
        user=UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            first_name=user.first_name,
            last_name=user.last_name,
            avatar_url=user.avatar_url,
            is_active=user.is_active,
            is_verified=user.is_verified,
            created_at=user.created_at,
            roles=roles
        )
    )


@router.post("/logout", response_model=SuccessResponse)
async def logout(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None
):
    """
    Выход пользователя из системы
    """
    
    auth_header = request.headers.get("Authorization") if request else None
    token = auth_header.split()[1] if auth_header and len(auth_header.split()) == 2 else None
    if token:
        db.query(DBSession).filter(
            DBSession.user_id == current_user.id,
            DBSession.token_hash == hash_token(token)
        ).delete()
    else:
        db.query(DBSession).filter(DBSession.user_id == current_user.id).delete()
    db.commit()
    
    return SuccessResponse(
        message="Успешный выход из системы"
    )


@router.post("/change-password", response_model=SuccessResponse)
async def change_password(
    request: UserChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Смена пароля пользователя
    """
    
    # Проверка текущего пароля
    if not verify_password(request.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный текущий пароль"
        )
    
    # Проверка совпадения новых паролей
    if request.new_password != request.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Новые пароли не совпадают"
        )
    
    # Проверка надежности нового пароля
    if not is_strong_password(request.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль должен содержать заглавные буквы, строчные буквы и цифры"
        )
    
    # Обновление пароля
    current_user.password_hash = hash_password(request.new_password)
    current_user.updated_at = utc_now_naive()
    
    # Удаление всех активных сессий (требуется повторный вход)
    db.query(DBSession).filter(DBSession.user_id == current_user.id).delete()
    
    db.commit()
    
    return SuccessResponse(
        message="Пароль успешно изменен. Требуется повторный вход."
    )


@router.get("/me", response_model=UserDetailResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Получить информацию о текущем пользователе
    """
    
    roles = [role.name for role in current_user.roles]
    
    # Получить все разрешения пользователя
    permissions = set()
    for role in current_user.roles:
        for permission in role.permissions:
            permissions.add(permission.name)
    
    return UserDetailResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        avatar_url=current_user.avatar_url,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        created_at=current_user.created_at,
        last_login=current_user.last_login,
        updated_at=current_user.updated_at,
        roles=roles,
        permissions=list(permissions)
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Обновить JWT токен доступа
    """
    
    roles = [role.name for role in current_user.roles]
    access_token, expires_in = create_access_token(
        user_id=current_user.id,
        username=current_user.username,
        roles=roles
    )
    
    auth_header = request.headers.get("Authorization")
    old_token = auth_header.split()[1] if auth_header and len(auth_header.split()) == 2 else None
    if old_token:
        db.query(DBSession).filter(
            DBSession.user_id == current_user.id,
            DBSession.token_hash == hash_token(old_token)
        ).delete()

    token_hash = hash_token(access_token)
    expires_at = utc_now_naive() + timedelta(seconds=expires_in)
    
    session = DBSession(
        user_id=current_user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    db.add(session)
    db.commit()
    
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=expires_in,
        user=UserResponse(
            id=current_user.id,
            username=current_user.username,
            email=current_user.email,
            first_name=current_user.first_name,
            last_name=current_user.last_name,
            avatar_url=current_user.avatar_url,
            is_active=current_user.is_active,
            is_verified=current_user.is_verified,
            created_at=current_user.created_at,
            roles=roles
        )
    )
