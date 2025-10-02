-- ============================================
-- Миграция: Система авторизации пользователей
-- Дата: 2025-10-02
-- Описание: Таблицы для пользователей и привязки к муниципалитетам
-- ============================================

-- 1) Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  municipality_id INTEGER REFERENCES municipalities(id) ON DELETE SET NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(municipality_id)
);

-- Комментарий: municipality_id NULL означает администратора (доступ ко всем муниципалитетам)

-- 2) Индексы для таблицы users
CREATE INDEX IF NOT EXISTS idx_users_municipality ON users(municipality_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- 3) Триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4) Комментарии к таблице
COMMENT ON TABLE users IS 'Пользователи системы: 1 пользователь = 1 муниципалитет (или admin если municipality_id = NULL)';
COMMENT ON COLUMN users.municipality_id IS 'ID муниципалитета (NULL для администратора)';
COMMENT ON COLUMN users.role IS 'Роль: admin (полный доступ ко всем муниципалитетам) или operator (доступ только к своему муниципалитету)';
COMMENT ON COLUMN users.is_active IS 'Активность пользователя (блокировка без удаления)';
