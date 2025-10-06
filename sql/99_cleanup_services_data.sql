-- Очистка всех данных по услугам
-- ВНИМАНИЕ: Этот скрипт удалит ВСЕ данные из таблиц services_catalog и service_values
-- Используйте с осторожностью!

-- ========================================
-- ВАРИАНТ 1: Удалить только значения услуг (данные)
-- ========================================
-- Справочник services_catalog остается, удаляются только введенные данные

TRUNCATE TABLE service_values CASCADE;

-- Проверка
SELECT 'service_values' as table_name, COUNT(*) as records_count FROM service_values;
-- Должно быть 0

-- ========================================
-- ВАРИАНТ 2: Удалить ВСЁ (справочник + данные)
-- ========================================
-- Удаляет и справочник услуг, и все данные

-- TRUNCATE TABLE services_catalog CASCADE;
-- TRUNCATE TABLE service_values CASCADE;

-- Проверка
-- SELECT 'services_catalog' as table_name, COUNT(*) as records_count FROM services_catalog
-- UNION ALL
-- SELECT 'service_values' as table_name, COUNT(*) as records_count FROM service_values;
-- Обе таблицы должны быть пустыми (0 записей)

-- ========================================
-- ВАРИАНТ 3: Удалить данные по конкретному периоду
-- ========================================
-- Удаляет данные только за определенный год/месяц

-- DELETE FROM service_values
-- WHERE period_year = 2025 AND period_month = 9;

-- Проверка
-- SELECT period_year, period_month, COUNT(*) as records_count
-- FROM service_values
-- GROUP BY period_year, period_month
-- ORDER BY period_year DESC, period_month DESC;

-- ========================================
-- ВАРИАНТ 4: Удалить данные по конкретному муниципалитету
-- ========================================

-- DELETE FROM service_values
-- WHERE municipality_id = 1;

-- Проверка
-- SELECT municipality_id, COUNT(*) as records_count
-- FROM service_values
-- GROUP BY municipality_id
-- ORDER BY municipality_id;

-- ========================================
-- ВАРИАНТ 5: Сброс автоинкремента (если нужно)
-- ========================================
-- После очистки таблиц, сбросить счетчики ID на 1

-- ALTER SEQUENCE services_catalog_id_seq RESTART WITH 1;
-- ALTER SEQUENCE service_values_id_seq RESTART WITH 1;

-- ========================================
-- После очистки
-- ========================================

-- 1. Заполните справочник заново (если удалили):
-- \i sql/02_seed_services_catalog.sql

-- 2. Импортируйте данные:
--    - Через веб-форму /services-import
--    - Или через миграцию sql/03_migrate_indicators_to_services.sql
--    - Или тестовые данные sql/04_generate_test_data.sql
