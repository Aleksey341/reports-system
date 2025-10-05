-- Генерация тестовых данных по услугам
-- Используйте этот скрипт, если хотите быстро проверить работу дашборда

-- ВАЖНО: Этот скрипт создаёт случайные данные для ВСЕХ муниципалитетов
-- и ВСЕХ услуг за последние 12 месяцев

-- Параметры генерации
DO $$
DECLARE
  start_year INTEGER := 2024;
  start_month INTEGER := 9;  -- Сентябрь 2024
  months_count INTEGER := 12; -- 12 месяцев назад до августа 2025
  current_year INTEGER;
  current_month INTEGER;
  m INTEGER;
BEGIN
  -- Генерация данных за последние 12 месяцев
  FOR m IN 0..(months_count - 1) LOOP
    current_year := start_year + ((start_month + m - 1) / 12);
    current_month := ((start_month + m - 1) % 12) + 1;

    RAISE NOTICE 'Генерация данных за % год, % месяц...', current_year, current_month;

    -- Вставить данные для всех муниципалитетов и всех услуг
    INSERT INTO service_values (municipality_id, service_id, period_year, period_month, value_numeric)
    SELECT
      mun.id as municipality_id,
      svc.id as service_id,
      current_year as period_year,
      current_month as period_month,
      -- Генерация случайных значений от 0 до 500
      FLOOR(RANDOM() * 500)::INTEGER as value_numeric
    FROM municipalities mun
    CROSS JOIN services_catalog svc
    ON CONFLICT (municipality_id, service_id, period_year, period_month)
    DO NOTHING; -- Не перезаписывать существующие данные
  END LOOP;

  RAISE NOTICE 'Генерация завершена!';
END $$;

-- Проверка результатов
SELECT
  COUNT(*) as total_records,
  COUNT(DISTINCT municipality_id) as municipalities,
  COUNT(DISTINCT service_id) as services,
  MIN(period_year) as from_year,
  MAX(period_year) as to_year,
  MIN(period_month) as from_month,
  MAX(period_month) as to_month,
  SUM(value_numeric) as total_value
FROM service_values;

-- Распределение по категориям
SELECT
  sc.category,
  COUNT(sv.id) as records_count,
  SUM(sv.value_numeric) as total_value,
  ROUND(AVG(sv.value_numeric), 2) as avg_value
FROM service_values sv
INNER JOIN services_catalog sc ON sc.id = sv.service_id
GROUP BY sc.category
ORDER BY total_value DESC;

-- ТОП-10 услуг по общему количеству
SELECT
  sc.name as service_name,
  sc.category,
  SUM(sv.value_numeric) as total_value,
  COUNT(sv.id) as records_count
FROM service_values sv
INNER JOIN services_catalog sc ON sc.id = sv.service_id
GROUP BY sc.name, sc.category
ORDER BY total_value DESC
LIMIT 10;

-- Данные по месяцам за 2025 год
SELECT
  sv.period_month as month,
  COUNT(sv.id) as records_count,
  SUM(sv.value_numeric) as total_value
FROM service_values sv
WHERE sv.period_year = 2025
GROUP BY sv.period_month
ORDER BY sv.period_month;
