-- ============================================
-- Миграция: Добавление service_id в indicator_values
-- Дата: 2025-10-02
-- Описание: Добавляет поле service_id для связи показателей с услугами
-- ============================================

-- 1) Добавляем колонку service_id в indicator_values
ALTER TABLE public.indicator_values
ADD COLUMN IF NOT EXISTS service_id INTEGER REFERENCES public.services_catalog(id) ON DELETE SET NULL;

-- 2) Создаем индекс для быстрого поиска по service_id
CREATE INDEX IF NOT EXISTS idx_indicator_values_service ON public.indicator_values(service_id);

-- 3) Комментарий к колонке
COMMENT ON COLUMN public.indicator_values.service_id IS 'ID услуги из справочника services_catalog (опционально, для связи показателей с конкретной услугой)';

-- 4) Обновляем constraint для уникальности (опционально, если нужно учитывать service_id)
-- Оставляем старый constraint без изменений, т.к. один показатель может быть связан с разными услугами
