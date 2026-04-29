"""
Утилиты безопасности:
- Хеширование паролей (bcrypt)
- JWT токены
- Проверка разрешений
"""

import os
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from functools import lru_cache

import jwt
from passlib.context import CryptContext
from pydantic_settings import BaseSettings
from pydantic import ConfigDict

# ============================================================================
# КОНФИГУРАЦИЯ
# ============================================================================

class SecuritySettings(BaseSettings):
    """Настройки безопасности"""
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-in-production")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    BCRYPT_ROUNDS: int = 12

    model_config = ConfigDict(env_file=".env", extra="ignore")


@lru_cache()
def get_security_settings():
    """Получить настройки безопасности"""
    settings = SecuritySettings()
    if settings.SECRET_KEY == "your-secret-key-change-in-production":
        print("[security] WARNING: SECRET_KEY uses the development default. Set SECRET_KEY in .env for non-local use.")
    if settings.ALGORITHM not in {"HS256", "HS384", "HS512"}:
        raise ValueError("Unsupported JWT algorithm")
    return settings


# ============================================================================
# КОНТЕКСТ ХЕШИРОВАНИЯ
# ============================================================================

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)


# ============================================================================
# ФУНКЦИИ ДЛЯ РАБОТЫ С ПАРОЛЯМИ
# ============================================================================

def hash_password(password: str) -> str:
    """
    Хешировать пароль используя bcrypt
    
    Args:
        password: Исходный пароль
        
    Returns:
        Хеширован пароль
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Проверить пароль против хеша
    
    Args:
        plain_password: Исходный пароль
        hashed_password: Хешированный пароль
        
    Returns:
        True если пароли совпадают
    """
    return pwd_context.verify(plain_password, hashed_password)


# ============================================================================
# ФУНКЦИИ ДЛЯ РАБОТЫ С JWT ТОКЕНАМИ
# ============================================================================

def create_access_token(
    user_id: int,
    username: str,
    roles: list[str] | None = None,
    expires_delta: Optional[timedelta] = None
) -> tuple[str, int]:
    """
    Создать JWT токен доступа
    
    Args:
        user_id: ID пользователя
        username: Имя пользователя
        roles: Список ролей пользователя
        expires_delta: Время истечения (default: 30 минут)
        
    Returns:
        Кортеж (токен, время истечения в секундах)
    """
    settings = get_security_settings()
    
    if expires_delta is None:
        expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    expire = datetime.now(timezone.utc) + expires_delta
    
    to_encode = {
        "sub": str(user_id),
        "username": username,
        "roles": roles or [],
        "exp": expire,
        "iat": datetime.now(timezone.utc)
    }
    
    encoded_jwt = jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    
    # Возвращаем токен и его срок действия в секундах
    expires_in = int(expires_delta.total_seconds())
    
    return encoded_jwt, expires_in


def decode_token(token: str) -> dict:
    """
    Декодировать и проверить JWT токен
    
    Args:
        token: JWT токен
        
    Returns:
        Словарь с данными токена
        
    Raises:
        jwt.InvalidTokenError: Если токен невалидный
    """
    settings = get_security_settings()
    
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError("Токен истёк")
    except jwt.InvalidTokenError:
        raise ValueError("Невалидный токен")


def verify_token(token: str) -> Optional[dict]:
    """
    Проверить токен и вернуть payload если токен валидный
    
    Args:
        token: JWT токен
        
    Returns:
        Payload если валидный, None если нет
    """
    try:
        return decode_token(token)
    except ValueError:
        return None


def hash_token(token: str) -> str:
    """
    Хешировать токен для хранения в БД (безопасность)
    
    Args:
        token: Сырой токен
        
    Returns:
        Хешированный токен
    """
    return hashlib.sha256(token.encode()).hexdigest()


# ============================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================================================

def is_strong_password(password: str) -> bool:
    """
    Проверить надежность пароля
    
    Args:
        password: Пароль
        
    Returns:
        True если пароль достаточно надежный
    """
    if len(password) < 8:
        return False
    if not any(c.isupper() for c in password):
        return False
    if not any(c.islower() for c in password):
        return False
    if not any(c.isdigit() for c in password):
        return False
    return True
