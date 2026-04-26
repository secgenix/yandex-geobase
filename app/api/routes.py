"""
API endpoints для работы с географическими объектами
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.db.pool import get_db
from app.db.models import User, GeoObject
from app.models.schemas import (
    GeoObjectResponse, PaginatedResponse, SuccessResponse
)
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/api/v1", tags=["geo"])


# ============================================================================
# ОСНОВНЫЕ API ENDPOINTS
# ============================================================================

@router.get("/", tags=["root"])
async def root():
    """Root endpoint - проверка здоровья API"""
    return {
        "status": "ok",
        "message": "Геобаза API v2.0.0 работает"
    }


@router.get("/health", tags=["health"])
async def health_check():
    """Проверка здоровья API"""
    return {
        "status": "healthy"
    }


@router.get("/geo-objects", response_model=PaginatedResponse)
async def list_geo_objects(
    search: str = Query(None, description="Поиск по названию или описанию"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Получить список географических объектов с фильтрацией
    """
    try:
        query = db.query(GeoObject)
        
        if search:
            query = query.filter(
                (GeoObject.name.ilike(f"%{search}%")) |
                (GeoObject.description.ilike(f"%{search}%"))
            )
        
        total = query.count()
        items = query.offset(offset).limit(limit).all()
        
        return {
            "items": items,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при получении объектов: {str(e)}"
        )


@router.get("/geo-objects/{object_id}", response_model=GeoObjectResponse)
async def get_geo_object(
    object_id: int,
    db: Session = Depends(get_db)
):
    """
    Получить информацию о конкретном географическом объекте
    """
    geo_object = db.query(GeoObject).filter(GeoObject.id == object_id).first()
    
    if not geo_object:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Географический объект не найден"
        )
    
    return geo_object
