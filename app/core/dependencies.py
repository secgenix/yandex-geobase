"""
FastAPI dependencies для проверки авторизации и разрешений
"""

from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from datetime import datetime

from app.db.pool import get_db
from app.db.models import User, Session as DBSession
from app.core.security import verify_token, hash_token


async def get_current_user(
    request: Request,
    db: Session = Depends(get_db)
) -> User:
    """
    Получить текущего пользователя из JWT токена в заголовке Authorization
    
    Raises:
        HTTPException: Если токен отсутствует, невалидный или истёк
    """
    
    # Получить токен из заголовка Authorization
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Отсутствует токен авторизации",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Разобрать заголовок (должно быть "Bearer <token>")
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невалидный формат токена авторизации",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = parts[1]
    
    # Проверить токен
    payload = verify_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невалидный или истёкший токен",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = int(payload.get("sub"))
    
    # Получить пользователя из БД
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Пользователь не найден",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Проверить активность пользователя
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Пользователь неактивен"
        )
    
    # Проверить наличие активной сессии в БД
    token_hash = hash_token(token)
    session = db.query(DBSession).filter(
        DBSession.user_id == user_id,
        DBSession.token_hash == token_hash,
        DBSession.expires_at > datetime.utcnow()
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сессия истекла или не найдена",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Обновить время последней активности
    session.last_activity = datetime.utcnow()
    db.commit()
    
    return user


async def get_optional_user(
    request: Request,
    db: Session = Depends(get_db)
) -> Optional[User]:
    """
    Получить текущего пользователя, если он авторизован (опционально)
    Возвращает None если пользователь не авторизован
    """
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None


async def require_permission(
    permission_name: str,
):
    """
    Factory для создания dependency, проверяющей разрешение
    
    Пример использования:
        @router.post("/admin/users")
        async def admin_endpoint(
            current_user: User = Depends(get_current_user),
            _: None = Depends(require_permission("users.create"))
        ):
            ...
    """
    async def check_permission(
        current_user: User = Depends(get_current_user)
    ) -> None:
        if not current_user.has_permission(permission_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Отсутствует разрешение: {permission_name}"
            )
        return None
    
    return check_permission


async def require_role(role_name: str):
    """
    Factory для создания dependency, проверяющей роль
    
    Пример использования:
        @router.post("/admin/users")
        async def admin_endpoint(
            current_user: User = Depends(get_current_user),
            _: None = Depends(require_role("admin"))
        ):
            ...
    """
    async def check_role(
        current_user: User = Depends(get_current_user)
    ) -> None:
        if not current_user.has_role(role_name):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Требуется роль: {role_name}"
            )
        return None
    
    return check_role


# Простые dependencies для часто используемых ролей
async def require_admin(
    current_user: User = Depends(get_current_user)
) -> User:
    """Требуется роль администратора"""
    if not current_user.has_role("admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Требуется роль администратора"
        )
    return current_user


async def require_moderator(
    current_user: User = Depends(get_current_user)
) -> User:
    """Требуется роль администратора или модератора"""
    if not (current_user.has_role("admin") or current_user.has_role("moderator")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Требуется роль администратора или модератора"
        )
    return current_user
