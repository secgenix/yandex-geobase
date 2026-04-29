-- Миграция: добавление поля image_url в таблицу geo_objects
-- Выполнить: psql -U postgres -d geobase -f add_image_url_to_geo_objects.sql

ALTER TABLE geo_objects ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);

-- Индекс для быстрого поиска по image_url (опционально)
CREATE INDEX IF NOT EXISTS idx_geo_objects_image_url ON geo_objects(image_url);