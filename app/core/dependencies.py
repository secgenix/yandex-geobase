"""
FastAPI dependencies для проверки авторизации и разрешений
"""

from fastapi import Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone

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
    
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Невалидный токен авторизации",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
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
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    session = db.query(DBSession).filter(
        DBSession.user_id == user_id,
        DBSession.token_hash == token_hash,
        DBSession.expires_at > now
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Сессия истекла или не найдена",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Обновить время последней активности
    session.last_activity = now
    db.commit()
    
    return user


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


