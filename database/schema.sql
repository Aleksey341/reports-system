-- База данных для системы отчетов
-- PostgreSQL 17.5

-- Таблица муниципалитетов
CREATE TABLE IF NOT EXISTS municipalities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    region VARCHAR(100) DEFAULT 'Липецкая область',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица основных отчетов
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    report_month VARCHAR(7) NOT NULL, -- YYYY-MM формат
    municipality_id INTEGER REFERENCES municipalities(id),
    municipality_name VARCHAR(255) NOT NULL, -- дублируем для быстрого доступа
    report_type VARCHAR(50) DEFAULT 'form_1_gmu',
    meta_title VARCHAR(255),
    status VARCHAR(20) DEFAULT 'submitted',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_ip INET,

    -- Индекс для быстрого поиска
    UNIQUE(report_month, municipality_name, report_type)
);

-- Таблица значений показателей отчета
CREATE TABLE IF NOT EXISTS report_values (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    row_id VARCHAR(50) NOT NULL, -- R_35425, R_35404, etc.
    serial_number INTEGER,
    indicator_description TEXT,
    unit VARCHAR(20),
    value INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица справочника показателей (шаблонов)
CREATE TABLE IF NOT EXISTS indicators_template (
    id SERIAL PRIMARY KEY,
    row_id VARCHAR(50) NOT NULL UNIQUE,
    serial_number INTEGER,
    description TEXT NOT NULL,
    unit VARCHAR(20),
    report_type VARCHAR(50) DEFAULT 'form_1_gmu',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для оптимизации
CREATE INDEX IF NOT EXISTS idx_reports_month_municipality
    ON reports(report_month, municipality_name);

CREATE INDEX IF NOT EXISTS idx_report_values_report_id
    ON report_values(report_id);

CREATE INDEX IF NOT EXISTS idx_report_values_row_id
    ON report_values(row_id);

CREATE INDEX IF NOT EXISTS idx_reports_created_at
    ON reports(created_at);

-- Функция для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Триггер для автоматического обновления updated_at в таблице reports
DROP TRIGGER IF EXISTS update_reports_updated_at ON reports;
CREATE TRIGGER update_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Представление для удобного просмотра данных
CREATE OR REPLACE VIEW v_reports_summary AS
SELECT
    r.id,
    r.report_month,
    r.municipality_name,
    r.report_type,
    r.status,
    r.created_at,
    COUNT(rv.id) as values_count,
    SUM(rv.value) as total_values
FROM reports r
LEFT JOIN report_values rv ON r.id = rv.report_id
GROUP BY r.id, r.report_month, r.municipality_name, r.report_type, r.status, r.created_at
ORDER BY r.created_at DESC;

-- Представление для аналитики по периодам
CREATE OR REPLACE VIEW v_reports_analytics AS
SELECT
    r.report_month,
    r.municipality_name,
    COUNT(DISTINCT r.id) as reports_count,
    SUM(rv.value) as total_value,
    AVG(rv.value) as avg_value,
    MIN(r.created_at) as first_report,
    MAX(r.created_at) as last_report
FROM reports r
LEFT JOIN report_values rv ON r.id = rv.report_id
GROUP BY r.report_month, r.municipality_name
ORDER BY r.report_month DESC, r.municipality_name;

-- Комментарии к таблицам
COMMENT ON TABLE municipalities IS 'Справочник муниципалитетов';
COMMENT ON TABLE reports IS 'Основная таблица отчетов';
COMMENT ON TABLE report_values IS 'Значения показателей отчетов';
COMMENT ON TABLE indicators_template IS 'Шаблон показателей для форм';

COMMENT ON COLUMN reports.report_month IS 'Отчетный месяц в формате YYYY-MM';
COMMENT ON COLUMN report_values.row_id IS 'Идентификатор строки показателя (R_35425, R_35404, etc.)';
COMMENT ON COLUMN report_values.value IS 'Числовое значение показателя';