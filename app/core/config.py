import os
import socket
from pathlib import Path


def _load_dotenv_values() -> dict[str, str]:
    env_path = Path(__file__).resolve().parents[2] / ".env"
    values = {}
    if not env_path.exists():
        return values

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


_ENV_FILE_VALUES = _load_dotenv_values()


def _get_env(name: str, default: str = "") -> str:
    return _ENV_FILE_VALUES.get(name, os.getenv(name, default))


class Settings:
    def __init__(self):
        self.YANDEX_MAPS_API_KEY = _get_env("YANDEX_MAPS_API_KEY", "")
        self.POSTGRES_DB = _get_env("POSTGRES_DB", "geo")
        self.POSTGRES_USER = _get_env("POSTGRES_USER", "geo_user")
        self.POSTGRES_PASSWORD = _get_env("POSTGRES_PASSWORD", "secret")
        # "db" обычно используется как service name в docker-compose.
        # При локальном запуске (особенно на Windows) это имя не резолвится.
        self.POSTGRES_HOST = _get_env("POSTGRES_HOST", "db")
        self.POSTGRES_PORT = int(_get_env("POSTGRES_PORT", "5432"))
        self.DATABASE_URL = _get_env("DATABASE_URL", "")
        self.APP_HOST = _get_env("APP_HOST", "0.0.0.0")
        self.APP_PORT = int(_get_env("APP_PORT", "8000"))
        self.DEFAULT_ADMIN_USERNAME = _get_env("DEFAULT_ADMIN_USERNAME", "")
        self.DEFAULT_ADMIN_EMAIL = _get_env("DEFAULT_ADMIN_EMAIL", "")
        self.DEFAULT_ADMIN_PASSWORD = _get_env("DEFAULT_ADMIN_PASSWORD", "")
        self.DEFAULT_ADMIN_FIRST_NAME = _get_env("DEFAULT_ADMIN_FIRST_NAME", "")
        self.DEFAULT_ADMIN_LAST_NAME = _get_env("DEFAULT_ADMIN_LAST_NAME", "")
        self._db_url = None

    @property
    def database_url(self) -> str:
        if self._db_url is None:
            host = self.POSTGRES_HOST

            # Если хост "db" не резолвится — заменяем на localhost.
            # Это позволяет запускать проект без docker-compose, не ломая docker-конфиг.
            if host == "db":
                try:
                    socket.gethostbyname(host)
                except OSError:
                    host = "localhost"

            if self.DATABASE_URL:
                url = self.DATABASE_URL
                if host == "localhost":
                    url = url.replace("@db:", "@localhost:").replace("@db/", "@localhost/")
                self._db_url = url
            else:
                self._db_url = (
                    f"postgresql://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                    f"@{host}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
                )
        return self._db_url


def get_settings() -> Settings:
    return Settings()
