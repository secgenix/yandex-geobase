-- ============================================================================
-- YANDEX GEOBASE: Полная SQL схема с системой авторизации и управлением ролями
-- ============================================================================

-- ============================================================================
-- 1. СИСТЕМА ПОЛЬЗОВАТЕЛЕЙ И РОЛЕЙ
-- ============================================================================

-- 1.1. Таблица пользователей
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    avatar_url VARCHAR(500),
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Индексы для пользователей
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_created_at ON users(created_at);

-- 1.2. Таблица ролей
CREATE TABLE roles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,  -- системная роль (не может быть удалена)
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Индексы для ролей
CREATE INDEX idx_roles_name ON roles(name);

-- 1.3. Таблица связи пользователей и ролей (Many-to-Many)
CREATE TABLE user_roles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    assigned_by BIGINT REFERENCES users(id),
    UNIQUE(user_id, role_id)
);

-- Индексы для связей
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);

-- 1.4. Таблица разрешений (Permissions)
CREATE TABLE permissions (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(50),  -- 'objects', 'users', 'roles', 'reports', 'system'
    created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для разрешений
CREATE INDEX idx_permissions_name ON permissions(name);
CREATE INDEX idx_permissions_category ON permissions(category);

-- 1.5. Таблица связи ролей и разрешений (Many-to-Many)
CREATE TABLE role_permissions (
    id BIGSERIAL PRIMARY KEY,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);

-- Индексы
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission_id ON role_permissions(permission_id);

-- 1.6. Таблица сессий/токенов
CREATE TABLE sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Индексы для сессий
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- 1.7. Таблица логирования действий администратора
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,  -- 'create', 'update', 'delete', 'assign_role', etc
    resource_type VARCHAR(50),     -- 'user', 'object', 'role', etc
    resource_id BIGINT,
    changes JSONB,                  -- перед и после для изменений
    ip_address INET,
    user_agent TEXT,
    status VARCHAR(20),             -- 'success', 'failure'
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Индексы для логов
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================================================
-- 2. ОСНОВНЫЕ ТАБЛИЦЫ ГЕОДАННЫХ (обновлённые)
-- ============================================================================

-- 2.1. Справочник категорий
CREATE TABLE categories_reference (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(255),
    color VARCHAR(7),
    created_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_categories_name ON categories_reference(name);

-- 2.2. Справочник статусов
-- (удалено) statuses_reference
-- (удалено) cities_reference

-- 2.2. Таблица метак (Labels/Tags)
CREATE TABLE labels (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(7),
    icon VARCHAR(255),
    created_by BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_labels_name ON labels(name);
CREATE INDEX idx_labels_created_by ON labels(created_by);

-- 2.3. Основная таблица географических объектов
CREATE TABLE geo_objects (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    description TEXT,
    category_id BIGINT REFERENCES categories_reference(id),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    created_by BIGINT NOT NULL REFERENCES users(id),
    updated_by BIGINT REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_verified BOOLEAN DEFAULT FALSE,
    verified_by BIGINT REFERENCES users(id)
);

-- Индексы для объектов
CREATE INDEX idx_geo_objects_category_id ON geo_objects(category_id);
CREATE INDEX idx_geo_objects_name ON geo_objects(name);
CREATE INDEX idx_geo_objects_created_at ON geo_objects(created_at);
CREATE INDEX idx_geo_objects_coords_brin ON geo_objects USING BRIN (latitude, longitude);
CREATE INDEX idx_geo_objects_created_by ON geo_objects(created_by);
CREATE INDEX idx_geo_objects_is_verified ON geo_objects(is_verified);

-- Составные индексы
-- (удалено) idx_geo_objects_category_status
-- (удалено) idx_geo_objects_city_category

-- 2.6. Таблица связи объектов и меток (Many-to-Many)
CREATE TABLE object_labels (
    id BIGSERIAL PRIMARY KEY,
    object_id BIGINT NOT NULL REFERENCES geo_objects(id) ON DELETE CASCADE,
    label_id BIGINT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(object_id, label_id)
);

CREATE INDEX idx_object_labels_object_id ON object_labels(object_id);
CREATE INDEX idx_object_labels_label_id ON object_labels(label_id);

-- 2.7. Таблица комментариев/истории изменений объектов
CREATE TABLE object_comments (
    id BIGSERIAL PRIMARY KEY,
    object_id BIGINT NOT NULL REFERENCES geo_objects(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id),
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_object_comments_object_id ON object_comments(object_id);
CREATE INDEX idx_object_comments_user_id ON object_comments(user_id);

-- ============================================================================
-- 3. НАЧАЛЬНЫЕ ДАННЫЕ (Fixtures)
-- ============================================================================

-- 3.1. Создание системных ролей
INSERT INTO roles (name, description, is_system) VALUES
('admin', 'Администратор системы с полными правами', TRUE),
('moderator', 'Модератор контента, может управлять объектами и пользователями', FALSE),
('user', 'Обычный пользователь, может просматривать и добавлять объекты', FALSE),
('viewer', 'Зритель, может только просматривать объекты', TRUE)
ON CONFLICT (name) DO NOTHING;

-- 3.2. Создание разрешений
INSERT INTO permissions (name, description, category) VALUES
-- Управление пользователями
('users.list', 'Просмотр списка пользователей', 'users'),
('users.view', 'Просмотр информации пользователя', 'users'),
('users.create', 'Создание нового пользователя', 'users'),
('users.update', 'Редактирование пользователя', 'users'),
('users.delete', 'Удаление пользователя', 'users'),
('users.ban', 'Блокирование пользователя', 'users'),

-- Управление ролями
('roles.list', 'Просмотр списка ролей', 'roles'),
('roles.view', 'Просмотр информации роли', 'roles'),
('roles.create', 'Создание новой роли', 'roles'),
('roles.update', 'Редактирование роли', 'roles'),
('roles.delete', 'Удаление роли', 'roles'),
('roles.assign', 'Назначение ролей пользователям', 'roles'),

-- Управление объектами
('objects.list', 'Просмотр списка объектов', 'objects'),
('objects.view', 'Просмотр объекта', 'objects'),
('objects.create', 'Создание объекта', 'objects'),
('objects.update', 'Редактирование объекта', 'objects'),
('objects.delete', 'Удаление объекта', 'objects'),
('objects.verify', 'Верификация объекта', 'objects'),
('objects.bulk_import', 'Массовая загрузка объектов', 'objects'),

-- Управление метками
('labels.list', 'Просмотр списка меток', 'objects'),
('labels.create', 'Создание метки', 'objects'),
('labels.update', 'Редактирование метки', 'objects'),
('labels.delete', 'Удаление метки', 'objects'),

-- Управление справочниками
('references.manage', 'Управление категориями, статусами, городами', 'objects'),

-- Просмотр логов
('logs.view', 'Просмотр логов действий', 'system'),
('logs.export', 'Экспорт логов', 'system'),

-- Система
('system.settings', 'Управление настройками системы', 'system'),
('system.maintenance', 'Техническое обслуживание', 'system')
ON CONFLICT (name) DO NOTHING;

-- 3.3. Назначение разрешений ролям (ADMIN - все разрешения)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3.4. Разрешения для MODERATOR
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'moderator' AND p.name IN (
    'users.list', 'users.view', 'users.update', 'users.ban',
    'objects.list', 'objects.view', 'objects.create', 'objects.update', 'objects.delete', 'objects.verify',
    'labels.list', 'labels.create', 'labels.update', 'labels.delete',
    'logs.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3.5. Разрешения для USER
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'user' AND p.name IN (
    'objects.list', 'objects.view', 'objects.create',
    'labels.list'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 3.6. Разрешения для VIEWER
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'viewer' AND p.name IN (
    'objects.list', 'objects.view',
    'labels.list'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================================================
-- 4. ПРЕДСТАВЛЕНИЯ (Views) для удобства
-- ============================================================================

-- 4.1. Представление пользователей с их ролями
CREATE OR REPLACE VIEW v_users_with_roles AS
SELECT 
    u.id,
    u.username,
    u.email,
    u.first_name,
    u.last_name,
    u.is_active,
    u.is_verified,
    u.created_at,
    array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) as roles,
    array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL) as permissions
FROM users u
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN roles r ON ur.role_id = r.id
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
GROUP BY u.id, u.username, u.email, u.first_name, u.last_name, u.is_active, u.is_verified, u.created_at;

-- 4.2. Представление объектов с полной информацией
CREATE OR REPLACE VIEW v_geo_objects_full AS
SELECT 
    g.id,
    g.name,
    g.address,
    g.description,
    g.latitude,
    g.longitude,
    c.name as category,
    u_creator.username as created_by_username,
    u_updater.username as updated_by_username,
    g.created_at,
    g.updated_at,
    g.is_verified,
    array_agg(DISTINCT l.name) FILTER (WHERE l.name IS NOT NULL) as labels
FROM geo_objects g
LEFT JOIN categories_reference c ON g.category_id = c.id
LEFT JOIN users u_creator ON g.created_by = u_creator.id
LEFT JOIN users u_updater ON g.updated_by = u_updater.id
LEFT JOIN object_labels ol ON g.id = ol.object_id
LEFT JOIN labels l ON ol.label_id = l.id
GROUP BY g.id, g.name, g.address, g.description, g.latitude, g.longitude,
         c.name, u_creator.username, u_updater.username,
         g.created_at, g.updated_at, g.is_verified;

-- ============================================================================
-- 5. ФУНКЦИИ И ТРИГГЕРЫ
-- ============================================================================

-- 5.1. Функция обновления времени updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5.2. Триггер для users таблицы
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 5.3. Триггер для roles таблицы
CREATE TRIGGER update_roles_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 5.4. Триггер для categories_reference таблицы
CREATE TRIGGER update_categories_reference_updated_at
BEFORE UPDATE ON categories_reference
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 5.5. Триггер для geo_objects таблицы
CREATE TRIGGER update_geo_objects_updated_at
BEFORE UPDATE ON geo_objects
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 5.8. Триггер для labels таблицы
CREATE TRIGGER update_labels_updated_at
BEFORE UPDATE ON labels
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 5.9. Функция для логирования действий администратора
CREATE OR REPLACE FUNCTION log_admin_action(
    p_user_id BIGINT,
    p_action VARCHAR,
    p_resource_type VARCHAR,
    p_resource_id BIGINT,
    p_changes JSONB,
    p_ip_address INET,
    p_user_agent TEXT
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, changes, ip_address, user_agent, status, created_at)
    VALUES (p_user_id, p_action, p_resource_type, p_resource_id, p_changes, p_ip_address, p_user_agent, 'success', NOW());
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. ПРОВЕРКИ И КОММЕНТАРИИ
-- ============================================================================

COMMENT ON TABLE users IS 'Таблица пользователей системы';
COMMENT ON TABLE roles IS 'Таблица ролей с правами доступа';
COMMENT ON TABLE permissions IS 'Таблица разрешений (дискретные права)';
COMMENT ON TABLE geo_objects IS 'Таблица географических объектов с координатами';
COMMENT ON TABLE labels IS 'Таблица меток для классификации объектов';
COMMENT ON TABLE audit_logs IS 'Логирование всех административных действий';
COMMENT ON TABLE sessions IS 'Таблица активных сессий пользователей';

-- ============================================================================
-- 7. ФИНАЛЬНЫЕ ПРОВЕРКИ
-- ============================================================================

-- Проверка целостности данных
ALTER TABLE users ADD CONSTRAINT check_email_format 
CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$');

ALTER TABLE users ADD CONSTRAINT check_username_length 
CHECK (LENGTH(username) >= 3 AND LENGTH(username) <= 100);

ALTER TABLE geo_objects ADD CONSTRAINT check_coordinates 
CHECK (latitude >= -90 AND latitude <= 90 AND longitude >= -180 AND longitude <= 180);

-- ============================================================================
-- ВЫВОД: Схема полностью готова к использованию!
-- ============================================================================
