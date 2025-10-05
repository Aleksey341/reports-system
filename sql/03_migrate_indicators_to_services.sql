-- Миграция данных из indicator_values в service_values
-- Этот скрипт переносит показатели, которые являются услугами

-- ВАЖНО: Выполняйте этот скрипт только если:
-- 1. Таблицы services_catalog и service_values уже созданы (01_create_services_tables.sql)
-- 2. Справочник services_catalog заполнен (02_seed_services_catalog.sql)
-- 3. В indicator_values есть данные из Формы 1-ГМУ, которые относятся к услугам

-- ========================================
-- ВАРИАНТ 1: Автоматическая миграция по совпадению названий
-- ========================================
-- Этот вариант ищет индикаторы, названия которых совпадают с названиями услуг,
-- и переносит их значения в service_values

INSERT INTO service_values (municipality_id, service_id, period_year, period_month, value_numeric)
SELECT
  iv.municipality_id,
  sc.id as service_id,
  iv.period_year,
  iv.period_month,
  iv.value_numeric
FROM indicator_values iv
INNER JOIN indicators_catalog ic ON ic.id = iv.indicator_id
INNER JOIN services_catalog sc ON LOWER(TRIM(sc.name)) = LOWER(TRIM(ic.name))
WHERE iv.value_numeric IS NOT NULL
  AND iv.value_numeric > 0
ON CONFLICT (municipality_id, service_id, period_year, period_month)
DO UPDATE SET
  value_numeric = EXCLUDED.value_numeric,
  updated_at = CURRENT_TIMESTAMP;

-- Проверка результатов миграции
SELECT
  COUNT(*) as migrated_records,
  COUNT(DISTINCT municipality_id) as municipalities,
  MIN(period_year) as from_year,
  MAX(period_year) as to_year
FROM service_values;

-- ========================================
-- ВАРИАНТ 2: Миграция конкретных показателей (вручную)
-- ========================================
-- Используйте этот вариант, если хотите точно контролировать,
-- какие показатели из indicator_values перенести в service_values

-- Пример: перенос конкретных показателей
-- Раскомментируйте и настройте под свои нужды:

/*
-- Перенос показателя "Количество выданных паспортов" -> услуга "Оформление паспорта"
INSERT INTO service_values (municipality_id, service_id, period_year, period_month, value_numeric)
SELECT
  iv.municipality_id,
  (SELECT id FROM services_catalog WHERE name = 'Оформление паспорта' LIMIT 1) as service_id,
  iv.period_year,
  iv.period_month,
  iv.value_numeric
FROM indicator_values iv
INNER JOIN indicators_catalog ic ON ic.id = iv.indicator_id
WHERE ic.name LIKE '%паспорт%'
  AND iv.value_numeric IS NOT NULL
ON CONFLICT (municipality_id, service_id, period_year, period_month)
DO UPDATE SET value_numeric = EXCLUDED.value_numeric;

-- Перенос показателя "Количество записей к врачу" -> услуга "Запись к врачу"
INSERT INTO service_values (municipality_id, service_id, period_year, period_month, value_numeric)
SELECT
  iv.municipality_id,
  (SELECT id FROM services_catalog WHERE name = 'Запись к врачу' LIMIT 1) as service_id,
  iv.period_year,
  iv.period_month,
  iv.value_numeric
FROM indicator_values iv
INNER JOIN indicators_catalog ic ON ic.id = iv.indicator_id
WHERE ic.name LIKE '%врач%' OR ic.name LIKE '%запись%'
  AND iv.value_numeric IS NOT NULL
ON CONFLICT (municipality_id, service_id, period_year, period_month)
DO UPDATE SET value_numeric = EXCLUDED.value_numeric;
*/

-- ========================================
-- ВАРИАНТ 3: Просмотр данных перед миграцией
-- ========================================
-- Используйте эти запросы, чтобы понять, какие данные есть в indicator_values

-- Посмотреть все показатели из indicators_catalog
SELECT
  id,
  name,
  category,
  unit
FROM indicators_catalog
ORDER BY category, name;

-- Посмотреть, какие показатели могут быть услугами (содержат ключевые слова)
SELECT DISTINCT
  ic.id,
  ic.name,
  ic.category,
  COUNT(iv.id) as records_count
FROM indicators_catalog ic
LEFT JOIN indicator_values iv ON iv.indicator_id = ic.id
WHERE ic.name ILIKE ANY(ARRAY[
  '%услуг%',
  '%обращен%',
  '%запис%',
  '%выдан%',
  '%оформлен%',
  '%получен%',
  '%регистрац%',
  '%заявк%',
  '%справк%'
])
GROUP BY ic.id, ic.name, ic.category
ORDER BY records_count DESC;

-- Посмотреть статистику по периодам в indicator_values
SELECT
  period_year,
  period_month,
  COUNT(DISTINCT municipality_id) as municipalities,
  COUNT(*) as total_records,
  SUM(value_numeric) as total_value
FROM indicator_values
GROUP BY period_year, period_month
ORDER BY period_year DESC, period_month DESC;

-- ========================================
-- ВАРИАНТ 4: Создание маппинга индикаторов -> услуг
-- ========================================
-- Если ваши показатели и услуги имеют разные названия,
-- создайте временную таблицу маппинга

/*
-- Создать временную таблицу для маппинга
CREATE TEMP TABLE indicator_to_service_mapping (
  indicator_name VARCHAR(255),
  service_name VARCHAR(255)
);

-- Заполнить маппинг (настройте под свои данные)
INSERT INTO indicator_to_service_mapping (indicator_name, service_name) VALUES
  ('Выдано паспортов', 'Оформление паспорта'),
  ('Записей к врачу через портал', 'Запись к врачу'),
  ('Зачислено в школы', 'Запись в школу'),
  ('Зарегистрировано ИП', 'Регистрация ИП'),
  ('Выдано водительских удостоверений', 'Оформление водительских прав');
  -- Добавьте свои маппинги...

-- Выполнить миграцию по маппингу
INSERT INTO service_values (municipality_id, service_id, period_year, period_month, value_numeric)
SELECT
  iv.municipality_id,
  sc.id as service_id,
  iv.period_year,
  iv.period_month,
  iv.value_numeric
FROM indicator_values iv
INNER JOIN indicators_catalog ic ON ic.id = iv.indicator_id
INNER JOIN indicator_to_service_mapping m ON LOWER(TRIM(ic.name)) = LOWER(TRIM(m.indicator_name))
INNER JOIN services_catalog sc ON LOWER(TRIM(sc.name)) = LOWER(TRIM(m.service_name))
WHERE iv.value_numeric IS NOT NULL
ON CONFLICT (municipality_id, service_id, period_year, period_month)
DO UPDATE SET value_numeric = EXCLUDED.value_numeric;

-- Проверка результатов
SELECT
  sc.name as service_name,
  COUNT(*) as records_migrated,
  SUM(sv.value_numeric) as total_value
FROM service_values sv
INNER JOIN services_catalog sc ON sc.id = sv.service_id
GROUP BY sc.name
ORDER BY records_migrated DESC;
*/

-- ========================================
-- Итоговая проверка
-- ========================================

-- Сколько записей перенесено
SELECT
  'service_values' as table_name,
  COUNT(*) as total_records,
  COUNT(DISTINCT municipality_id) as municipalities,
  COUNT(DISTINCT service_id) as services,
  MIN(period_year || '-' || LPAD(period_month::TEXT, 2, '0')) as from_period,
  MAX(period_year || '-' || LPAD(period_month::TEXT, 2, '0')) as to_period
FROM service_values;

-- Сравнение с исходными данными
SELECT
  'indicator_values' as table_name,
  COUNT(*) as total_records,
  COUNT(DISTINCT municipality_id) as municipalities,
  COUNT(DISTINCT indicator_id) as indicators
FROM indicator_values;

-- Детализация по категориям услуг
SELECT
  sc.category,
  COUNT(DISTINCT sc.id) as services_count,
  COUNT(sv.id) as values_count,
  SUM(sv.value_numeric) as total_value
FROM services_catalog sc
LEFT JOIN service_values sv ON sv.service_id = sc.id
GROUP BY sc.category
ORDER BY total_value DESC NULLS LAST;
