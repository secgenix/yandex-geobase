# Yandex GeoBase

Yandex GeoBase — веб-приложение на FastAPI для отображения и управления географическими метками на Яндекс.Картах. Проект включает Python backend, хранение данных в PostgreSQL, HTML-шаблоны, статические JavaScript/CSS-файлы, JWT-аутентификацию, ролевое администрирование и Docker Compose для локального развёртывания.

## Участники

- Бердюгин Евгений
- Ефим Колупаев

## Текущий статус

Проект находится в статусе активного backend/frontend-прототипа. Реализованы аутентификация, страницы профиля, административная панель, отображение меток на карте, создание меток пользователями с повышенными правами, фильтры по категориям и организациям, а также хранение данных в PostgreSQL.

Реализовано:
- точка входа FastAPI в `app/main.py`;
- ORM-модели SQLAlchemy и синхронный доступ к PostgreSQL через `psycopg2`;
- вход, выход и отслеживание сессий через JWT;
- стартовое заполнение ролей и разрешений;
- опциональное создание администратора по переменным окружения;
- раздача frontend-файлов через FastAPI из директории `frontend/`;
- Docker Compose для запуска приложения и PostgreSQL.

Пока отсутствует:
- автоматизированные тесты;
- Alembic-миграции;
- отдельная сборка frontend;
- production-конфигурация reverse proxy.

## Технологический стек

Backend:
- Python 3.11 или новее.
- FastAPI для HTTP API и HTML-маршрутов.
- Uvicorn как ASGI-сервер.
- SQLAlchemy ORM для моделей и запросов к базе данных.
- PostgreSQL как основная база данных.
- `psycopg2-binary` как активный PostgreSQL-драйвер для SQLAlchemy URL.
- Pydantic и Pydantic Settings для схем и настроек безопасности.
- PyJWT для access-токенов.
- Passlib с bcrypt для хеширования паролей.
- `uv` для управления зависимостями и запуска команд.

Frontend:
- HTML-шаблоны, отдаваемые FastAPI.
- Обычный JavaScript, CSS и браузерные API.
- Yandex Maps JavaScript API 2.1, подключаемый в `frontend/templates/index.html`.
- `localStorage` для access-токена и данных текущего пользователя.

Инфраструктура:
- Docker и Docker Compose.
- Образ PostgreSQL 16 Alpine.
- SQL-скрипт инициализации `docs/000_full_database_schema.sql`.
- Docker-образ приложения на базе `python:3.11-slim`.

## Системные требования

Для локальной разработки:
- Python 3.11+.
- Установленный `uv`, доступный в `PATH`.
- PostgreSQL 16 или совместимый сервер PostgreSQL, если база не запускается через Docker Compose.
- Docker Desktop или Docker Engine с Docker Compose для контейнерного запуска.
- API-ключ Яндекс.Карт для полноценной работы карты.

Рекомендуемые инструменты:
- Git.
- Браузер с инструментами разработчика.
- `psql` или другой клиент PostgreSQL для проверки базы данных.

## Структура директорий

```text
yandex-geobase/
├── app/
│   ├── main.py                    # FastAPI-приложение, startup DB init, HTML/static routes
│   ├── api/
│   │   ├── auth_routes.py          # регистрация, вход, выход, пароль, текущий пользователь
│   │   ├── admin_routes.py         # пользователи, роли, права, категории, организации, метки, логи
│   │   └── routes.py               # API геообъектов и меток карты
│   ├── core/
│   │   ├── config.py               # настройки окружения и database URL
│   │   ├── dependencies.py         # зависимости текущего пользователя и администратора
│   │   └── security.py             # хеширование паролей и JWT
│   ├── db/
│   │   ├── models.py               # таблицы и связи SQLAlchemy
│   │   ├── pool.py                 # SQLAlchemy engine и фабрика сессий
│   │   └── seed.py                 # стартовые роли, права и администратор
│   └── models/
│       └── schemas.py              # Pydantic-схемы запросов и ответов
├── frontend/
│   ├── templates/                  # HTML-страницы, отдаваемые FastAPI
│   └── static/                     # CSS, JavaScript и директория изображений
├── docs/
│   ├── 000_full_database_schema.sql
│   └── migrations/
├── UML/                            # PlantUML и сгенерированные диаграммы
├── docker-compose.yml
├── DockerFile
├── pyproject.toml
├── requirements.txt
├── uv.lock
├── .env.example
└── README.md
```

## Архитектура выполнения

Общий поток работы:
1. Браузер открывает HTML-маршрут FastAPI, например `/`, `/login.html`, `/profile.html` или `/admin.html`.
2. FastAPI читает шаблоны из `frontend/templates/` и отдаёт статические файлы из `/static`.
3. JavaScript вызывает backend API по путям `/api/v1`.
4. API-маршруты получают SQLAlchemy `Session` из `app/db/pool.py`.
5. SQLAlchemy работает с моделями из `app/db/models.py` и сохраняет данные в PostgreSQL.
6. Защищённые endpoints проверяют JWT-токены и активные DB-сессии через `app/core/dependencies.py`.

Основной поток данных:
- Регистрация создаёт `User` и назначает роль `user`, если такая роль уже есть в базе.
- Вход проверяет пароль, создаёт JWT, хеширует токен и сохраняет строку сессии.
- Защищённые запросы отправляют заголовок `Authorization: Bearer <token>`.
- Создание меток доступно только пользователям с ролью `admin` или `moderator`.
- Административные маршруты требуют роль `admin` через `require_admin`.

## Переменные окружения

Перед запуском создайте `.env` на основе `.env.example`.

```env
POSTGRES_DB=geo
POSTGRES_USER=geo_user
POSTGRES_PASSWORD=secret
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
DATABASE_URL=postgresql://geo_user:secret@localhost:5432/geo
YANDEX_MAPS_API_KEY=your-yandex-maps-key
APP_HOST=0.0.0.0
APP_PORT=8000
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=ChangeMe123
DEFAULT_ADMIN_FIRST_NAME=System
DEFAULT_ADMIN_LAST_NAME=Admin
SECRET_KEY=replace-with-a-long-random-secret
```

Пояснения:
- `DATABASE_URL` имеет приоритет при построении строки подключения к базе данных.
- Если `POSTGRES_HOST=db` используется вне Docker и не резолвится, `app/core/config.py` заменяет его на `localhost` для удобства локального запуска.
- `YANDEX_MAPS_API_KEY` подставляется в шаблон главной страницы.
- `DEFAULT_ADMIN_*` используются при стартовом создании или обновлении администратора.
- `SECRET_KEY` используется для подписи JWT access-токенов. Не используйте значение по умолчанию за пределами локальной разработки.

## Локальная установка через uv

1. Склонируйте репозиторий и перейдите в директорию проекта:

```powershell
git clone https://github.com/secgenix/yandex-geobase.git
cd yandex-geobase
```

2. Создайте `.env`:

```powershell
Copy-Item .env.example .env
```

3. Отредактируйте `.env` и задайте минимум:

```env
DATABASE_URL=postgresql://geo_user:secret@localhost:5432/geo
YANDEX_MAPS_API_KEY=your-yandex-maps-key
DEFAULT_ADMIN_PASSWORD=ChangeMe123
SECRET_KEY=replace-with-a-long-random-secret
```

4. Установите зависимости:

```powershell
uv sync
```

5. Запустите PostgreSQL локально или поднимите только сервис базы из Docker Compose:

```powershell
docker compose up -d db
```

6. Запустите приложение:

```powershell
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

7. Откройте приложение:

```text
http://localhost:8000/
```

8. Откройте документацию API:

```text
http://localhost:8000/docs
```

## Запуск через Docker Compose

1. Создайте `.env` из примера:

```powershell
Copy-Item .env.example .env
```

2. Для Docker Compose укажите хост базы как имя сервиса или оставьте переопределение из `docker-compose.yml`:

```env
POSTGRES_HOST=db
DATABASE_URL=postgresql://geo_user:secret@db:5432/geo
```

3. Соберите и запустите сервисы:

```powershell
docker compose up --build
```

4. Откройте приложение:

```text
http://localhost:8000/
```

5. Остановите сервисы:

```powershell
docker compose down
```

6. Остановите сервисы и удалите volume PostgreSQL:

```powershell
docker compose down -v
```

## Инициализация базы данных

В проекте используются два механизма инициализации:
- Docker PostgreSQL монтирует `docs/000_full_database_schema.sql` в `/docker-entrypoint-initdb.d/` при первом создании volume.
- FastAPI при старте вызывает `Base.metadata.create_all(bind=engine)`, затем `seed_initial_data(db)`.

Поведение seed-логики:
- создаёт роли `admin`, `moderator`, `user`, `viewer`;
- создаёт набор разрешений;
- назначает разрешения ролям;
- назначает роль `user` пользователям без ролей;
- создаёт или обновляет администратора, если заданы `DEFAULT_ADMIN_USERNAME`, `DEFAULT_ADMIN_EMAIL` и `DEFAULT_ADMIN_PASSWORD`.

При изменении схемы базы обновляйте `app/db/models.py` и поддерживайте актуальность `docs/000_full_database_schema.sql`. В текущем проекте нет workflow на Alembic.

## Основные URL

Страницы:
- `GET /` — главная страница с картой.
- `GET /index.html` — главная страница с картой.
- `GET /login.html` или `/login` — страница входа.
- `GET /register.html` или `/register` — страница регистрации.
- `GET /profile.html` или `/profile` — страница профиля.
- `GET /admin.html` или `/admin` — административная панель.

Основное API:
- `GET /api/v1/health` — проверка состояния сервиса.
- `GET /api/v1/objects` — legacy endpoint списка объектов, используемый текущим frontend.
- `GET /api/v1/filters` — категории и организации для фильтров.
- `GET /api/v1/map-markers` — метки карты.
- `POST /api/v1/map-markers` — создание метки, требуется роль `admin` или `moderator`.
- `GET /api/v1/geo-objects` — paginated API геообъектов.
- `GET /api/v1/geo-objects/{object_id}` — один геообъект.

API аутентификации:
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `POST /api/v1/auth/change-password`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/refresh`

Административное API:
- `GET /api/v1/admin/users`
- `POST /api/v1/admin/users`
- `PUT /api/v1/admin/users/{user_id}`
- `DELETE /api/v1/admin/users/{user_id}`
- `GET /api/v1/admin/roles`
- `GET /api/v1/admin/permissions`
- `GET /api/v1/admin/categories`
- `GET /api/v1/admin/organizations`
- `GET /api/v1/admin/labels`
- `GET /api/v1/admin/logs`

## Типовые сценарии использования

Регистрация и вход:
1. Откройте `/register.html`.
2. Создайте пользователя с надёжным паролем.
3. Откройте `/login.html`.
4. Войдите по email или имени пользователя.
5. Frontend сохранит `access_token` и `user` в `localStorage`.

Работа с картой:
1. Откройте `/`.
2. Дождитесь загрузки Яндекс.Карты и меток.
3. Используйте поиск и фильтры в боковой панели.
4. Нажмите на объект в списке, чтобы центрировать карту и открыть детали.
5. Нажмите на метку, чтобы посмотреть данные объекта.

Создание метки администратором или модератором:
1. Войдите пользователем с ролью `admin` или `moderator`.
2. Откройте `/`.
3. Нажмите правой кнопкой мыши по карте.
4. Выберите создание метки в контекстном меню.
5. Заполните название, категорию, организацию, описание, адрес и при необходимости изображение.
6. Отправьте форму.

Административный сценарий:
1. Войдите под администратором, заданным в `.env`.
2. Откройте `/admin.html`.
3. Управляйте пользователями, ролями, разрешениями, метками, категориями, организациями и журналом аудита.
4. Используйте страницу профиля для проверки ролей и разрешений текущей учётной записи.

API-сценарий через PowerShell:
1. Выполните вход и сохраните токен:

```powershell
$body = @{ email = "admin@example.com"; password = "ChangeMe123" } | ConvertTo-Json
$response = Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/v1/auth/login -ContentType "application/json" -Body $body
$token = $response.access_token
```

2. Вызовите защищённый endpoint:

```powershell
Invoke-RestMethod -Uri http://localhost:8000/api/v1/auth/me -Headers @{ Authorization = "Bearer $token" }
```

## Команды разработки

Проверить компиляцию Python-файлов:

```powershell
uv run python -m compileall app
```

Импортировать FastAPI-приложение и вывести количество маршрутов:

```powershell
uv run python -c "from app.main import app; print(len(app.routes))"
```

Запустить тесты, если позже будут добавлены тесты и test-зависимости:

```powershell
uv run python -m pytest
```

Текущее состояние репозитория: test-файлы отсутствуют, `pytest` не объявлен в `pyproject.toml`.

## Диагностика проблем

Ошибка подключения к базе данных:
- Проверьте, что PostgreSQL запущен.
- Проверьте `DATABASE_URL` в `.env`.
- Для локального запуска используйте `POSTGRES_HOST=localhost`.
- Для Docker Compose используйте `POSTGRES_HOST=db` и `DATABASE_URL=postgresql://geo_user:secret@db:5432/geo`.

Карта пустая:
- Проверьте, что задан `YANDEX_MAPS_API_KEY`.
- Проверьте консоль браузера и сетевые запросы.
- Убедитесь, что Yandex Maps API доступен из браузера.

Вход выполнен, но защищённые endpoints возвращают 401:
- Убедитесь, что запрос отправляет `Authorization: Bearer <token>`.
- Проверьте наличие сессии в таблице `sessions`.
- Проверьте срок действия токена.
- Выполните вход заново после смены пароля или выхода.

Администратор по умолчанию не создаётся:
- Задайте `DEFAULT_ADMIN_USERNAME`, `DEFAULT_ADMIN_EMAIL` и `DEFAULT_ADMIN_PASSWORD`.
- Перезапустите приложение.
- Проверьте startup-логи на сообщения `[seed]`.

База в Docker не сбрасывается:
- Docker хранит данные PostgreSQL в volume `pgdata`.
- Используйте `docker compose down -v`, чтобы удалить volume и повторить инициализацию.

## Безопасность

- Замените `SECRET_KEY` во всех окружениях, кроме локальной разработки.
- Используйте надёжный `DEFAULT_ADMIN_PASSWORD` и смените его после первого входа.
- Ограничьте CORS origins перед production-развёртыванием. Сейчас приложение разрешает все origins.
- Не коммитьте `.env` с реальными секретами.
- Используйте HTTPS и reverse proxy в production.
- Считайте base64-изображения, отправляемые frontend, недоверенными данными.

## Сопровождение

При добавлении backend-функциональности:
1. Добавьте или обновите SQLAlchemy-модели в `app/db/models.py`.
2. Добавляйте Pydantic-схемы в `app/models/schemas.py` только если они используются route-кодом.
3. Добавьте обработчики маршрутов в `app/api/`.
4. При необходимости зарегистрируйте новые routers в `app/main.py`.
5. Обновите seed-данные в `app/db/seed.py`, если меняются роли или разрешения.
6. Обновите этот README и `frontend/README.md`, если меняются маршруты, страницы или шаги запуска.

При добавлении frontend-функциональности:
1. Добавьте HTML в `frontend/templates/`.
2. Добавьте JavaScript в `frontend/static/js/`.
3. Добавьте CSS в `frontend/static/css/`.
4. Добавьте маршрут в `app/main.py`, если странице нужен отдельный URL.
5. Задокументируйте API-зависимости и пользовательские сценарии.
