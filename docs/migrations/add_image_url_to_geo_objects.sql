-- Миграция: добавление поля image_url в таблицу geo_objects
-- Выполнить: psql -U postgres -d geobase -f add_image_url_to_geo_objects.sql

ALTER TABLE geo_objects ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE geo_objects ALTER COLUMN image_url TYPE TEXT;

-- Индекс по image_url не создаётся: поле может хранить длинные base64-изображения.
