import os
import socket
from functools import lru_cache


class Settings:
    def __init__(self):
        self.YANDEX_MAPS_API_KEY = os.getenv("YANDEX_MAPS_API_KEY", "")
        self.POSTGRES_DB = os.getenv("POSTGRES_DB", "geo")
        self.POSTGRES_USER = os.getenv("POSTGRES_USER", "geo_user")
        self.POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "secret")
        # "db" обычно используется как service name в docker-compose.
        # При локальном запуске (особенно на Windows) это имя не резолвится.
        self.POSTGRES_HOST = os.getenv("POSTGRES_HOST", "db")
        self.POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
        self.DATABASE_URL = os.getenv("DATABASE_URL", "")
        self.APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
        self.APP_PORT = int(os.getenv("APP_PORT", "8000"))
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
