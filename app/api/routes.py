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
from app.core.dependencies import get_current_user, get_optional_user

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


# ============================================================================
# MAP MARKERS (храним как GeoObject)
# ============================================================================


@router.get("/map-markers")
async def list_map_markers(
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    # Маркеры — это GeoObject с минимальным наполнением.
    # Сигнализируем маркер через name='Метка' и пустые справочники.
    query = db.query(GeoObject).filter(
        GeoObject.name == "Метка",
        GeoObject.category_id.is_(None),
        GeoObject.status_id.is_(None),
        GeoObject.city_id.is_(None),
    )
    total = query.count()
    items = query.order_by(GeoObject.id.desc()).offset(offset).limit(limit).all()
    return {
        "items": [
            {
                "id": o.id,
                "latitude": o.latitude,
                "longitude": o.longitude,
                "created_by": o.created_by,
                "created_at": o.created_at,
            }
            for o in items
        ],
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.post("/map-markers", status_code=status.HTTP_201_CREATED)
async def create_map_marker(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # ожидаем { latitude, longitude }
    if "latitude" not in payload or "longitude" not in payload:
        raise HTTPException(status_code=400, detail="latitude и longitude обязательны")

    marker_obj = GeoObject(
        name="Метка",
        latitude=float(payload["latitude"]),
        longitude=float(payload["longitude"]),
        created_by=current_user.id,
    )
    db.add(marker_obj)
    db.commit()
    db.refresh(marker_obj)
    return {
        "id": marker_obj.id,
        "latitude": marker_obj.latitude,
        "longitude": marker_obj.longitude,
        "created_by": marker_obj.created_by,
        "created_at": marker_obj.created_at,
    }
