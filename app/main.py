from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from app.core.config import get_settings

app = FastAPI(title="Геобаза API")

settings = get_settings()

BASE_DIR = Path(__file__).parent.parent
app.mount(
    "/static", StaticFiles(directory=str(BASE_DIR / "frontend/static")), name="static"
)


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    template_path = BASE_DIR / "frontend/templates/index.html"
    with open(template_path, "r", encoding="utf-8") as f:
        content = f.read()
    content = content.replace("{{ api_key }}", settings.YANDEX_MAPS_API_KEY)
    return HTMLResponse(content)


@app.get("/api/v1/health")
async def health():
    return {"status": "ok"}


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
