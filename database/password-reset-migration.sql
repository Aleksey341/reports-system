-- ============================================
-- Миграция: Добавление функционала смены пароля
-- Дата: 2025-10-02
-- Описание: Добавляет поле для принудительной смены пароля
-- ============================================

-- 1) Добавляем поле password_reset_required
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_reset_required BOOLEAN NOT NULL DEFAULT FALSE;

-- 2) Добавляем поле last_password_change для отслеживания
ALTER TABLE users
ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMP;

-- 3) Устанавливаем текущее время для существующих пользователей
UPDATE users
SET last_password_change = updated_at
WHERE last_password_change IS NULL;

-- 4) Комментарии
COMMENT ON COLUMN users.password_reset_required IS 'Флаг принудительной смены пароля при следующем входе';
COMMENT ON COLUMN users.last_password_change IS 'Дата последней смены пароля';
