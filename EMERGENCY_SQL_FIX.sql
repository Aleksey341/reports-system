-- EMERGENCY FIX: Execute this SQL directly in PostgreSQL
-- If npm run db:init doesn't work, use this file

-- Connect to database:
-- psql -U reports_admin -d reports -f EMERGENCY_SQL_FIX.sql

BEGIN;

-- ========================================
-- 1. Drop and recreate tables (clean slate)
-- ========================================

DROP TABLE IF EXISTS public.service_values CASCADE;
DROP TABLE IF EXISTS public.indicator_values CASCADE;
DROP TABLE IF EXISTS public.services_catalog CASCADE;
DROP TABLE IF EXISTS public.indicators_catalog CASCADE;
DROP TABLE IF EXISTS public.municipalities CASCADE;

-- ========================================
-- 2. Create municipalities table
-- ========================================
CREATE TABLE public.municipalities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  head_name VARCHAR(255),
  head_position VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- 3. Create indicators_catalog table
-- ========================================
CREATE TABLE public.indicators_catalog (
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

-- ========================================
-- 4. Create indicator_values table
-- ========================================
CREATE TABLE public.indicator_values (
  id BIGSERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL REFERENCES public.municipalities(id) ON DELETE CASCADE,
  indicator_id INTEGER NOT NULL REFERENCES public.indicators_catalog(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL CHECK (period_year >= 2020 AND period_year <= 2100),
  period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  value_numeric NUMERIC(15, 2),
  value_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_indicator_values UNIQUE (municipality_id, indicator_id, period_year, period_month)
);

-- ========================================
-- 5. Create services_catalog table
-- ========================================
CREATE TABLE public.services_catalog (
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

-- ========================================
-- 6. Create service_values table
-- ========================================
CREATE TABLE public.service_values (
  id BIGSERIAL PRIMARY KEY,
  municipality_id INTEGER NOT NULL REFERENCES public.municipalities(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES public.services_catalog(id) ON DELETE CASCADE,
  period_year INTEGER NOT NULL CHECK (period_year >= 2020 AND period_year <= 2100),
  period_month INTEGER NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  value_numeric NUMERIC(15, 2),
  value_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_service_values UNIQUE (municipality_id, service_id, period_year, period_month)
);

-- ========================================
-- 7. Create indexes
-- ========================================
CREATE INDEX idx_municipalities_name ON public.municipalities(name);
CREATE INDEX idx_indicators_form_code ON public.indicators_catalog(form_code);
CREATE INDEX idx_indicators_code ON public.indicators_catalog(code);
CREATE INDEX idx_indicator_values_muni ON public.indicator_values(municipality_id);
CREATE INDEX idx_indicator_values_period ON public.indicator_values(period_year, period_month);
CREATE INDEX idx_indicator_values_indicator ON public.indicator_values(indicator_id);
CREATE INDEX idx_services_category ON public.services_catalog(category);
CREATE INDEX idx_services_code ON public.services_catalog(code);
CREATE INDEX idx_service_values_muni ON public.service_values(municipality_id);
CREATE INDEX idx_service_values_period ON public.service_values(period_year, period_month);
CREATE INDEX idx_service_values_service ON public.service_values(service_id);

-- ========================================
-- 8. Insert test data - Indicators
-- ========================================
INSERT INTO public.indicators_catalog (code, name, unit, form_code, sort_order, category) VALUES
  ('ind_001', 'Численность населения', 'чел.', 'form_1_gmu', 1, 'Демография'),
  ('ind_002', 'Площадь территории', 'км²', 'form_1_gmu', 2, 'Территория'),
  ('ind_003', 'Количество населенных пунктов', 'ед.', 'form_1_gmu', 3, 'Территория'),
  ('ind_004', 'Бюджет муниципалитета', 'тыс. руб.', 'form_1_gmu', 4, 'Финансы'),
  ('ind_005', 'Доходы бюджета', 'тыс. руб.', 'form_1_gmu', 5, 'Финансы'),
  ('ind_006', 'Расходы бюджета', 'тыс. руб.', 'form_1_gmu', 6, 'Финансы'),
  ('ind_007', 'Количество МФЦ', 'ед.', 'form_1_gmu', 7, 'Инфраструктура'),
  ('ind_008', 'Количество школ', 'ед.', 'form_1_gmu', 8, 'Образование'),
  ('ind_009', 'Количество детских садов', 'ед.', 'form_1_gmu', 9, 'Образование'),
  ('ind_010', 'Количество больниц', 'ед.', 'form_1_gmu', 10, 'Здравоохранение')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      unit = EXCLUDED.unit,
      category = EXCLUDED.category,
      sort_order = EXCLUDED.sort_order;

-- ========================================
-- 9. Insert test data - Services
-- ========================================
INSERT INTO public.services_catalog (code, name, unit, category, sort_order) VALUES
  ('mfc_001', 'Выдача паспорта гражданина РФ', 'шт.', 'МФЦ - Паспорта и документы', 1),
  ('mfc_002', 'Замена паспорта гражданина РФ', 'шт.', 'МФЦ - Паспорта и документы', 2),
  ('mfc_003', 'Регистрация по месту жительства', 'шт.', 'МФЦ - Регистрация', 3),
  ('mfc_004', 'Регистрация по месту пребывания', 'шт.', 'МФЦ - Регистрация', 4),
  ('mfc_005', 'Оформление СНИЛС', 'шт.', 'МФЦ - Социальные услуги', 5),
  ('mfc_006', 'Оформление материнского капитала', 'шт.', 'МФЦ - Социальные услуги', 6),
  ('mfc_007', 'Получение выписки из ЕГРН', 'шт.', 'МФЦ - Недвижимость', 7),
  ('mfc_008', 'Регистрация права на недвижимость', 'шт.', 'МФЦ - Недвижимость', 8),
  ('mfc_009', 'Получение водительского удостоверения', 'шт.', 'МФЦ - Транспорт', 9),
  ('mfc_010', 'Замена водительского удостоверения', 'шт.', 'МФЦ - Транспорт', 10),
  ('mfc_011', 'Регистрация транспортного средства', 'шт.', 'МФЦ - Транспорт', 11),
  ('mfc_012', 'Оформление загранпаспорта', 'шт.', 'МФЦ - Паспорта и документы', 12),
  ('mfc_013', 'Выдача справки о судимости', 'шт.', 'МФЦ - Справки', 13),
  ('mfc_014', 'Выдача справки об отсутствии судимости', 'шт.', 'МФЦ - Справки', 14),
  ('mfc_015', 'Постановка на учет в качестве безработного', 'шт.', 'МФЦ - Занятость', 15),
  ('util_001', 'Подключение к водоснабжению', 'шт.', 'Коммунальные услуги', 20),
  ('util_002', 'Подключение к газоснабжению', 'шт.', 'Коммунальные услуги', 21),
  ('util_003', 'Подключение к электроснабжению', 'шт.', 'Коммунальные услуги', 22),
  ('lic_001', 'Выдача разрешения на строительство', 'шт.', 'Лицензии и разрешения', 30),
  ('lic_002', 'Выдача разрешения на ввод объекта в эксплуатацию', 'шт.', 'Лицензии и разрешения', 31),
  ('lic_003', 'Выдача торгового патента', 'шт.', 'Лицензии и разрешения', 32),
  ('soc_001', 'Оформление пособия на ребенка', 'шт.', 'Социальные выплаты', 40),
  ('soc_002', 'Оформление пенсии по старости', 'шт.', 'Социальные выплаты', 41),
  ('soc_003', 'Оформление льгот ветеранам', 'шт.', 'Социальные выплаты', 42)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      unit = EXCLUDED.unit,
      category = EXCLUDED.category,
      sort_order = EXCLUDED.sort_order;

-- ========================================
-- 10. Insert test municipality
-- ========================================
INSERT INTO public.municipalities (name, head_name, head_position) VALUES
  ('Тестовый муниципалитет', 'Иванов И.И.', 'Глава администрации')
ON CONFLICT (name) DO NOTHING;

COMMIT;

-- ========================================
-- 11. Verification
-- ========================================
SELECT
  'municipalities' as table_name,
  COUNT(*) as row_count
FROM public.municipalities
UNION ALL
SELECT
  'indicators_catalog',
  COUNT(*)
FROM public.indicators_catalog
UNION ALL
SELECT
  'services_catalog',
  COUNT(*)
FROM public.services_catalog;

-- Should show:
-- municipalities: 1+
-- indicators_catalog: 10
-- services_catalog: 24

\echo '✅ Database initialized successfully!'
\echo 'Now RESTART your server: pm2 restart all'
