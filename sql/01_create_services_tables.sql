-- Создание таблиц для услуг
-- Выполните СНАЧАЛА этот скрипт, потом seed_services_catalog.sql

-- 1. Таблица справочника услуг
CREATE TABLE IF NOT EXISTS services_catalog (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  category VARCHAR(100),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создать индексы
CREATE INDEX IF NOT EXISTS idx_services_catalog_category ON services_catalog(category);

-- 2. Таблица значений услуг
CREATE TABLE IF NOT EXISTS service_values (
  id SERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL,
  service_id INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  value_numeric NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(municipality_id, service_id, period_year, period_month)
);

-- Создать индексы для service_values
CREATE INDEX IF NOT EXISTS idx_service_values_municipality ON service_values(municipality_id);
CREATE INDEX IF NOT EXISTS idx_service_values_service ON service_values(service_id);
CREATE INDEX IF NOT EXISTS idx_service_values_period ON service_values(period_year, period_month);

-- Добавить внешние ключи (если таблицы municipalities существуют)
DO $$
BEGIN
  -- Проверяем существование таблицы municipalities
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'municipalities') THEN
    -- Добавляем FK только если его еще нет
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_service_values_municipality'
    ) THEN
      ALTER TABLE service_values
        ADD CONSTRAINT fk_service_values_municipality
        FOREIGN KEY (municipality_id) REFERENCES municipalities(id) ON DELETE CASCADE;
    END IF;
  END IF;

  -- FK для service_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_service_values_service'
  ) THEN
    ALTER TABLE service_values
      ADD CONSTRAINT fk_service_values_service
      FOREIGN KEY (service_id) REFERENCES services_catalog(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Проверка созданных таблиц
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_name IN ('services_catalog', 'service_values')
ORDER BY table_name;
