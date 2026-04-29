# Документация frontend

Frontend — статический интерфейс Yandex GeoBase, который отдаётся backend-приложением FastAPI. Он построен на HTML-шаблонах, обычном JavaScript, CSS, браузерном `fetch` и Yandex Maps JavaScript API 2.1. В текущем проекте нет Node.js-сборки и отдельного frontend package manager.

## Текущий статус

Реализованные страницы:
- главная страница карты с поиском, фильтрами, списком объектов, отображением меток, карточкой объекта и контекстным меню для создания меток;
- страница входа;
- страница регистрации;
- страница профиля пользователя с информацией о текущей учётной записи и сменой пароля;
- административная панель для пользователей, ролей, разрешений, категорий, организаций, меток и журнала аудита.

Реализованное поведение frontend:
- сохраняет JWT access-токен в `localStorage`;
- отправляет аутентифицированные API-запросы с `Authorization: Bearer <token>`;
- показывает навигацию с учётом роли пользователя;
- позволяет создавать метки через контекстное меню карты пользователям с ролями `admin` и `moderator`;
- загружает категории и организации из `/api/v1/filters`;
- загружает объекты карты из `/api/v1/objects`, а метки — из `/api/v1/map-markers`.

Пока отсутствует:
- компонентный framework или JavaScript bundler;
- компиляция TypeScript;
- unit-тесты frontend;
- отдельный frontend-артефакт для деплоя.

## Технологический стек

- HTML-шаблоны, отдаваемые FastAPI.
- CSS-файлы в `frontend/static/css/`.
- Обычные JavaScript-файлы в `frontend/static/js/`.
- Браузерный `localStorage` для auth-токена и пользовательских данных.
- Браузерный `fetch` для запросов к backend API.
- Yandex Maps JavaScript API 2.1, подключаемый в `frontend/templates/index.html`.
- Backend API по базовому пути `/api/v1`.

## Требования

Для локального использования frontend нужны:
- запущенный FastAPI backend из корня репозитория;
- доступная PostgreSQL-база для API-данных;
- корректный `.env` в корне проекта;
- заданный `YANDEX_MAPS_API_KEY` в `.env`;
- современный браузер с включённым JavaScript.

Отдельная установка frontend не требуется.

## Структура директорий

```text
frontend/
├── README.md
├── templates/
│   ├── index.html       # главная страница карты
│   ├── login.html       # форма входа
│   ├── register.html    # форма регистрации
│   ├── profile.html     # страница профиля пользователя
│   └── admin.html       # административная панель
└── static/
    ├── css/
    │   ├── style.css     # карта, фильтры, карточка объекта, modal метки
    │   ├── auth.css      # стили страниц входа и регистрации
    │   ├── dashboard.css # общая разметка профиля и admin-панели
    │   └── admin.css     # стили административной панели
    ├── js/
    │   ├── script.js     # карта, фильтры, создание меток, карточка объекта
    │   ├── login.js      # сценарий входа
    │   ├── register.js   # сценарий регистрации
    │   ├── profile.js    # профиль и смена пароля
    │   └── admin.js      # интеграция admin-панели с API
    └── images/
        └── temp          # placeholder-путь, присутствующий в репозитории
```

## Как FastAPI отдаёт frontend

Frontend-файлы обслуживаются из `app/main.py`:
- статические ресурсы монтируются на `/static` из директории `frontend/static`;
- HTML-страницы читаются из `frontend/templates` через `read_template()`;
- главная страница карты получает `YANDEX_MAPS_API_KEY` через замену `{{ api_key }}` в шаблоне.

Маршруты страниц:
- `/` и `/index.html` отдают `index.html`;
- `/login` и `/login.html` отдают `login.html`;
- `/register` и `/register.html` отдают `register.html`;
- `/profile` и `/profile.html` отдают `profile.html`;
- `/admin` и `/admin.html` отдают `admin.html`.

## Настройка окружения

Frontend использует общий backend-файл окружения из корня проекта.

1. Создайте `.env` в корне репозитория:

```powershell
Copy-Item .env.example .env
```

2. Задайте значения для карты и backend:

```env
YANDEX_MAPS_API_KEY=your-yandex-maps-key
APP_HOST=0.0.0.0
APP_PORT=8000
DATABASE_URL=postgresql://geo_user:secret@localhost:5432/geo
SECRET_KEY=replace-with-a-long-random-secret
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_EMAIL=admin@example.com
DEFAULT_ADMIN_PASSWORD=ChangeMe123
```

3. Запустите backend через `uv` из корня репозитория:

```powershell
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

4. Откройте frontend в браузере:

```text
http://localhost:8000/
```

## Запуск через Docker

Frontend входит в Docker-образ backend. Отдельный frontend-контейнер не используется.

1. Создайте `.env` в корне репозитория:

```powershell
Copy-Item .env.example .env
```

2. Запустите приложение и базу данных:

```powershell
docker compose up --build
```

3. Откройте:

```text
http://localhost:8000/
```

## Зависимости от backend API

Главная страница карты:
- `GET /api/v1/objects` загружает список объектов и оранжевые метки объектов;
- `GET /api/v1/map-markers` загружает красные метки карты;
- `POST /api/v1/map-markers` создаёт метку для авторизованных пользователей с ролью `admin` или `moderator`;
- `GET /api/v1/filters` загружает категории и организации.

Страницы аутентификации:
- `POST /api/v1/auth/login` выполняет вход и возвращает токен;
- `POST /api/v1/auth/register` создаёт пользователя;
- `POST /api/v1/auth/logout` удаляет текущую token-сессию, если это возможно;
- `GET /api/v1/auth/me` загружает профиль текущего пользователя;
- `POST /api/v1/auth/change-password` меняет текущий пароль;
- `POST /api/v1/auth/refresh` обновляет access-токен.

Административная панель:
- `GET /api/v1/admin/users`
- `POST /api/v1/admin/users`
- `PUT /api/v1/admin/users/{user_id}`
- `DELETE /api/v1/admin/users/{user_id}`
- `GET /api/v1/admin/roles`
- `POST /api/v1/admin/roles`
- `PUT /api/v1/admin/roles/{role_id}`
- `DELETE /api/v1/admin/roles/{role_id}`
- `GET /api/v1/admin/permissions`
- `GET /api/v1/admin/categories`
- `POST /api/v1/admin/categories`
- `PUT /api/v1/admin/categories/{category_id}`
- `GET /api/v1/admin/organizations`
- `POST /api/v1/admin/organizations`
- `PUT /api/v1/admin/organizations/{organization_id}`
- `GET /api/v1/admin/labels`
- `POST /api/v1/admin/labels`
- `PUT /api/v1/admin/labels/{label_id}`
- `DELETE /api/v1/admin/labels/{label_id}`
- `GET /api/v1/admin/logs`

## Модель аутентификации

Frontend хранит в `localStorage` следующие ключи:
- `access_token` — JWT access-токен, возвращённый `/api/v1/auth/login`;
- `token_type` — тип токена, обычно `bearer`;
- `user` — сериализованные данные пользователя, возвращённые при входе.

Аутентифицированные запросы добавляют заголовок:

```javascript
Authorization: Bearer <access_token>
```

Проверки ролей на frontend являются только вспомогательными. Backend всё равно проверяет авторизацию через JWT-сессию и роли пользователя.

## Типовые пользовательские сценарии

Регистрация нового пользователя:
1. Откройте `/register.html`.
2. Введите username, email, пароль и при необходимости имя/фамилию.
3. Отправьте форму.
4. После успешной регистрации перейдите на `/login.html`.

Вход:
1. Откройте `/login.html`.
2. Введите email или username и пароль.
3. Отправьте форму.
4. Токен и данные пользователя сохранятся в `localStorage`.
5. Пользователи с ролью `admin` перенаправляются в административную панель текущей frontend-логикой.

Просмотр объектов на карте:
1. Откройте `/`.
2. Дождитесь загрузки Yandex Maps API и данных меток с backend.
3. Используйте поиск и фильтры по категории/организации.
4. Нажмите на объект в списке, чтобы центрировать карту.
5. Нажмите на метку, чтобы открыть данные объекта.

Создание метки:
1. Войдите пользователем с ролью `admin` или `moderator`.
2. Откройте `/`.
3. Нажмите правой кнопкой мыши по карте.
4. Выберите создание метки в контекстном меню.
5. Заполните название, категорию, организацию, описание, адрес и при необходимости изображение.
6. Отправьте форму.
7. Frontend отправит `POST /api/v1/map-markers` с access-токеном.

Использование страницы профиля:
1. Войдите в систему.
2. Откройте `/profile.html`.
3. Проверьте данные пользователя, роли и разрешения.
4. При необходимости смените пароль.
5. После смены пароля войдите заново, если активная сессия была сброшена.

Использование административной панели:
1. Войдите как `admin`.
2. Откройте `/admin.html`.
3. Управляйте пользователями, ролями, категориями, организациями, метками и логами.
4. Используйте инструменты разработчика браузера для анализа неудачных API-запросов, если раздел не загрузился.

## Процесс разработки

Изменение страницы:
1. Отредактируйте соответствующий файл в `frontend/templates/`.
2. Обновите страницу в браузере.
3. Если для страницы ещё нет маршрута, добавьте его в `app/main.py`.

Изменение стилей:
1. Отредактируйте файлы в `frontend/static/css/`.
2. Обновите страницу в браузере.
3. Очистите cache браузера, если отображаются старые стили.

Изменение поведения:
1. Отредактируйте файлы в `frontend/static/js/`.
2. Сохраняйте API-пути под `/api/v1`, если backend-маршрут не менялся.
3. Проверяйте запросы на вкладке Network в браузере.
4. Сохраняйте обработку `localStorage` совместимой с auth-маршрутами.

Добавление новой frontend-страницы:
1. Создайте `frontend/templates/<page>.html`.
2. При необходимости создайте CSS/JS-файлы в `frontend/static/`.
3. Добавьте FastAPI-маршрут в `app/main.py` через `read_template()`.
4. Добавьте навигационные ссылки, если они нужны.
5. Задокументируйте страницу и необходимые API в этом README.

Добавление нового раздела admin-панели:
1. Добавьте разметку в `frontend/templates/admin.html`.
2. Добавьте или переиспользуйте стили в `dashboard.css` или `admin.css`.
3. Добавьте функции загрузки и изменения данных в `frontend/static/js/admin.js`.
4. Добавьте соответствующие backend endpoints под `/api/v1/admin`.
5. Проверьте enforcement роли администратора на backend.

## Отладка

Проверить состояние аутентификации в консоли браузера:

```javascript
localStorage.getItem('access_token');
JSON.parse(localStorage.getItem('user') || '{}');
```

Очистить состояние аутентификации:

```javascript
localStorage.removeItem('access_token');
localStorage.removeItem('token_type');
localStorage.removeItem('user');
```

Проверить ошибки API:
1. Откройте DevTools браузера.
2. Перейдите на вкладку Network.
3. Отфильтруйте запросы по `/api/v1`.
4. Проверьте status code и JSON-ответ.
5. Для защищённых endpoints проверьте наличие заголовка `Authorization`.

Типовые HTTP-коды:
- `400` — некорректные данные формы или дублирующаяся сущность;
- `401` — отсутствует, истёк или некорректен токен, либо отсутствует DB-сессия;
- `403` — пользователь аутентифицирован, но не имеет нужной роли;
- `404` — запрошенная сущность не найдена;
- `500` — ошибка backend или базы данных.

## Диагностика проблем

Карта не загружается:
- Проверьте, что `YANDEX_MAPS_API_KEY` задан в `.env`.
- Убедитесь, что `/` отдаёт script URL с ключом.
- Проверьте консоль браузера на ошибки Yandex API.
- Проверьте доступность `https://api-maps.yandex.ru/`.

Объекты или метки не загружаются:
- Проверьте, что backend запущен.
- Откройте `/api/v1/health`.
- Проверьте ответы `/api/v1/objects`, `/api/v1/map-markers` и `/api/v1/filters`.
- Убедитесь, что PostgreSQL запущен и seed-данные применены.

Admin-панель перенаправляет на login:
- Проверьте наличие `access_token`.
- Убедитесь, что текущий пользователь имеет роль `admin`.
- Вызовите `/api/v1/auth/me` с токеном.
- Войдите заново, если token-сессия истекла.

Создание метки запрещено:
- Убедитесь, что текущий пользователь имеет роль `admin` или `moderator`.
- Проверьте, что заголовок `Authorization` отправляется в `POST /api/v1/map-markers`.
- Посмотрите detail backend-ответа на вкладке Network.

CSS или JS изменения не отображаются:
- Выполните hard refresh страницы.
- Отключите cache в DevTools.
- Проверьте, что шаблон ссылается на нужный файл под `/static`.

## Безопасность

- Проверки ролей на frontend не являются границей безопасности.
- Не размещайте реальные секреты во frontend-файлах.
- JWT-токены в `localStorage` доступны JavaScript-коду, поэтому не добавляйте недоверенные scripts.
- Валидируйте и очищайте все данные на backend.
- Ограничьте CORS в production.

## Чеклист сопровождения

При изменении frontend или поведения API:
1. Обновите соответствующие HTML, CSS или JS-файлы.
2. Вручную проверьте браузерные сценарии.
3. Проверьте связанные backend API-ответы.
4. Обновите этот README.
5. Обновите корневой `README.md`, если изменились установка, архитектура или публичные маршруты.
