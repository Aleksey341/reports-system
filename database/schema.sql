-- Схема базы данных для системы отчетности
-- PostgreSQL 17.5+

-- ========================================
-- 1. Справочник муниципалитетов
-- ========================================
CREATE TABLE IF NOT EXISTS public.municipalities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  head_name VARCHAR(255),
  head_position VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_municipalities_name ON public.municipalities(name);

-- ========================================
-- 2. Каталог показателей (индикаторов)
-- ========================================
CREATE TABLE IF NOT EXISTS public.indicators_catalog (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(500) NOT NULL,
  unit VARCHAR(50),
  form_code VARCHAR(50) DEFAULT 'form_1_gmu',
  sort_order INTEGER,
  category VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indicators_form_code ON public.indicators_catalog(form_code);
CREATE INDEX IF NOT EXISTS idx_indicators_code ON public.indicators_catalog(code);

-- ========================================
-- 3. Значения показателей
-- ========================================
CREATE TABLE IF NOT EXISTS public.indicator_values (
  id BIGSERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL REFERENCES public.municipalities(id) ON DELETE CASCADE,
  indicator_id INTEGER NOT NULL REFERENCES public.indicators_catalog(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL CHECK (period_year >= 2020 AND period_year <= 2100),
  period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  value_numeric NUMERIC(15, 2),
  value_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Уникальность: один показатель для муниципалитета в конкретный месяц
  CONSTRAINT uq_indicator_values UNIQUE (municipality_id, indicator_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_indicator_values_muni ON public.indicator_values(municipality_id);
CREATE INDEX IF NOT EXISTS idx_indicator_values_period ON public.indicator_values(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_indicator_values_indicator ON public.indicator_values(indicator_id);

-- ========================================
-- 4. Каталог услуг
-- ========================================
CREATE TABLE IF NOT EXISTS public.services_catalog (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(500) NOT NULL,
  unit VARCHAR(50),
  category VARCHAR(100),
  description TEXT,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_category ON public.services_catalog(category);
CREATE INDEX IF NOT EXISTS idx_services_code ON public.services_catalog(code);

-- ========================================
-- 5. Значения услуг
-- ========================================
CREATE TABLE IF NOT EXISTS public.service_values (
  id BIGSERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL REFERENCES public.municipalities(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES public.services_catalog(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL CHECK (period_year >= 2020 AND period_year <= 2100),
  period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  value_numeric NUMERIC(15, 2),
  value_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Уникальность: одна услуга для муниципалитета в конкретный месяц
  CONSTRAINT uq_service_values UNIQUE (municipality_id, service_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_service_values_muni ON public.service_values(municipality_id);
CREATE INDEX IF NOT EXISTS idx_service_values_period ON public.service_values(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_service_values_service ON public.service_values(service_id);

-- ========================================
-- 6. Триггеры для updated_at
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  -- Municipalities
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_municipalities_updated_at') THEN
    CREATE TRIGGER tr_municipalities_updated_at
      BEFORE UPDATE ON public.municipalities
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- Indicators Catalog
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_indicators_catalog_updated_at') THEN
    CREATE TRIGGER tr_indicators_catalog_updated_at
      BEFORE UPDATE ON public.indicators_catalog
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- Indicator Values
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_indicator_values_updated_at') THEN
    CREATE TRIGGER tr_indicator_values_updated_at
      BEFORE UPDATE ON public.indicator_values
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- Services Catalog
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_services_catalog_updated_at') THEN
    CREATE TRIGGER tr_services_catalog_updated_at
      BEFORE UPDATE ON public.services_catalog
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- Service Values
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_service_values_updated_at') THEN
    CREATE TRIGGER tr_service_values_updated_at
      BEFORE UPDATE ON public.service_values
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ========================================
-- 7. Комментарии к таблицам
-- ========================================
COMMENT ON TABLE public.municipalities IS 'Справочник муниципальных образований Липецкой области';
COMMENT ON TABLE public.indicators_catalog IS 'Каталог показателей формы 1-ГМУ и других форм';
COMMENT ON TABLE public.indicator_values IS 'Значения показателей по муниципалитетам и периодам';
COMMENT ON TABLE public.services_catalog IS 'Справочник услуг (МФЦ и другие)';
COMMENT ON TABLE public.service_values IS 'Значения услуг по муниципалитетам и периодам';
