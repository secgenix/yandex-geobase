from pathlib import Path
from fastapi import FastAPI, Request, Depends
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.db.pool import get_db
from app.db.models import User
from app.core.dependencies import get_current_user
from app.api.auth_routes import router as auth_router
from app.api.admin_routes import router as admin_router
from app.api.routes import router as api_router
from app.db.pool import engine
from app.db.models import Base

app = FastAPI(title="Геобаза API", version="2.0.0")

settings = get_settings()

# ============================================================================
# MIDDLEWARE
# ============================================================================

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: измените на конкретные домены в production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# МАРШРУТЫ
# ============================================================================

# Создание таблиц (проект без миграций)
@app.on_event("startup")
async def _create_tables():
    # В dev-режиме Postgres может быть не запущен.
    # Не валим весь сервер, если БД недоступна (API, статика и т.п. должны подняться).
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        # Логируем в stdout, чтобы было видно причину (например, connection refused).
        print(f"[startup] DB init skipped: {e!r}")

# Регистрация auth routes
app.include_router(auth_router)

# Регистрация admin routes
app.include_router(admin_router)

# Регистрация основных API routes
app.include_router(api_router)

# ============================================================================
# СТАТИЧЕСКИЕ ФАЙЛЫ
# ============================================================================

BASE_DIR = Path(__file__).parent.parent
app.mount(
    "/static", StaticFiles(directory=str(BASE_DIR / "frontend/static")), name="static"
)


# ============================================================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ============================================================================


def read_template(template_name: str) -> str:
    """Прочитать HTML шаблон"""
    template_path = BASE_DIR / "frontend" / "templates" / f"{template_name}.html"
    if not template_path.exists():
        raise FileNotFoundError(f"Template {template_name}.html not found")
    with open(template_path, "r", encoding="utf-8") as f:
        return f.read()


# ============================================================================
# FRONTEND ROUTES
# ============================================================================


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """Главная страница с картой"""
    content = read_template("index")
    content = content.replace("{{ api_key }}", settings.YANDEX_MAPS_API_KEY)
    return HTMLResponse(content)


@app.get("/index.html", response_class=HTMLResponse)
async def index(request: Request):
    """Главная страница с картой"""
    content = read_template("index")
    content = content.replace("{{ api_key }}", settings.YANDEX_MAPS_API_KEY)
    return HTMLResponse(content)


@app.get("/login.html", response_class=HTMLResponse)
async def login_page(request: Request):
    """Страница входа"""
    content = read_template("login")
    return HTMLResponse(content)


@app.get("/login", response_class=HTMLResponse)
async def login_redirect(request: Request):
    """Редирект на login.html"""
    content = read_template("login")
    return HTMLResponse(content)


@app.get("/register.html", response_class=HTMLResponse)
async def register_page(request: Request):
    """Страница регистрации"""
    content = read_template("register")
    return HTMLResponse(content)


@app.get("/register", response_class=HTMLResponse)
async def register_redirect(request: Request):
    """Редирект на register.html"""
    content = read_template("register")
    return HTMLResponse(content)


@app.get("/profile.html", response_class=HTMLResponse)
async def profile_page(request: Request):
    """Страница профиля (проверка авторизации на клиенте)"""
    content = read_template("profile")
    return HTMLResponse(content)


@app.get("/profile", response_class=HTMLResponse)
async def profile_redirect(request: Request):
    """Редирект на profile.html"""
    content = read_template("profile")
    return HTMLResponse(content)


@app.get("/admin.html", response_class=HTMLResponse)
async def admin_page(request: Request):
    """Админ панель (проверка авторизации на клиенте)"""
    content = read_template("admin")
    return HTMLResponse(content)


@app.get("/admin", response_class=HTMLResponse)
async def admin_redirect(request: Request):
    """Редирект на admin.html"""
    content = read_template("admin")
    return HTMLResponse(content)


# ============================================================================
# API ROUTES
# ============================================================================


@app.get("/api/v1/health")
async def health():
    """Проверка здоровья сервиса"""
    return {"status": "ok", "version": "2.0.0", "message": "Сервис работает корректно"}


# Тестовый endpoint для проверки авторизации
@app.get("/api/v1/test-auth")
async def test_auth(current_user=None):
    from app.core.dependencies import get_current_user
    from sqlalchemy.orm import Session
    from fastapi import Depends
    from app.db.pool import get_db

    # Этот endpoint требует авторизации
    # Используйте: curl -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/test-auth
    return {"message": "Вы авторизованы", "user": current_user}


# Старые endpoints (совместимость)
@app.get("/api/v1/objects")
async def get_objects(
    search: str | None = None,
    category: str | None = None,
    status: str | None = None,
    city: str | None = None,
    bbox: str | None = None,
    limit: int = 100,
    offset: int = 0,
):
    return {"items": [], "total": 0}


@app.get("/api/v1/objects/{obj_id}")
async def get_object(obj_id: int):
    return {}


@app.get("/api/v1/filters")
async def get_filters():
    return {
        "categories": ["office", "store"],
        "statuses": ["active", "inactive"],
        "cities": ["Москва", "Новосибирск"],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.APP_HOST, port=settings.APP_PORT)
