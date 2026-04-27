"""
API endpoints для работы с географическими объектами
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.db.pool import get_db
from app.db.models import User, GeoObject, CategoryReference, Label
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
    category_id: int = Query(None, description="Фильтр по категории"),
    organization_id: int = Query(None, description="Фильтр по организации"),
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

        if category_id:
            query = query.filter(GeoObject.category_id == category_id)

        if organization_id:
            query = query.join(GeoObject.labels).filter(Label.id == organization_id)
        
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
    query = db.query(GeoObject).filter(GeoObject.address.is_(None))
    total = query.count()
    items = query.order_by(GeoObject.id.desc()).offset(offset).limit(limit).all()
    return {
        "items": [
            {
                "id": o.id,
                "name": o.name,
                "description": o.description,
                "category_id": o.category_id,
                "category": o.category.name if o.category else None,
                "organization_id": o.labels[0].id if o.labels else None,
                "organization": o.labels[0].name if o.labels else None,
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
    if "latitude" not in payload or "longitude" not in payload:
        raise HTTPException(status_code=400, detail="latitude и longitude обязательны")

    name = (payload.get("name") or "Метка").strip()
    description = (payload.get("description") or None)
    category_id = payload.get("category_id") or None
    organization_id = payload.get("organization_id") or None

    category = None
    if category_id:
        category = db.query(CategoryReference).filter(CategoryReference.id == int(category_id)).first()
        if not category:
            raise HTTPException(status_code=404, detail="Категория не найдена")

    organization = None
    if organization_id:
        organization = db.query(Label).filter(Label.id == int(organization_id)).first()
        if not organization:
            raise HTTPException(status_code=404, detail="Организация не найдена")

    marker_obj = GeoObject(
        name=name,
        description=description,
        category_id=category.id if category else None,
        latitude=float(payload["latitude"]),
        longitude=float(payload["longitude"]),
        created_by=current_user.id,
    )
    if organization:
        marker_obj.labels.append(organization)

    db.add(marker_obj)
    db.commit()
    db.refresh(marker_obj)
    return {
        "id": marker_obj.id,
        "name": marker_obj.name,
        "description": marker_obj.description,
        "category_id": marker_obj.category_id,
        "category": marker_obj.category.name if marker_obj.category else None,
        "organization_id": organization.id if organization else None,
        "organization": organization.name if organization else None,
        "latitude": marker_obj.latitude,
        "longitude": marker_obj.longitude,
        "created_by": marker_obj.created_by,
        "created_at": marker_obj.created_at,
    }
