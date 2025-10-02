-- ============================================
-- Миграция: Система авторизации пользователей
-- Дата: 2025-10-02
-- Описание: Таблицы для пользователей и привязки к муниципалитетам
-- ============================================

-- 1) Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2) Связь "пользователь ↔ муниципалитеты"
-- Определяет к каким муниципалитетам имеет доступ пользователь
CREATE TABLE IF NOT EXISTS user_municipalities (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  municipality_id INTEGER NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, municipality_id)
);

-- 3) Индексы для ускорения проверок прав
CREATE INDEX IF NOT EXISTS idx_user_munis_user ON user_municipalities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_munis_muni ON user_municipalities(municipality_id);

-- 4) Индексы для таблицы users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- 5) Триггер для автоматического обновления updated_at
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

-- 6) Комментарии к таблицам
COMMENT ON TABLE users IS 'Пользователи системы с хешированными паролями';
COMMENT ON TABLE user_municipalities IS 'Привязка пользователей к муниципалитетам (права доступа)';
COMMENT ON COLUMN users.role IS 'Роль: admin (полный доступ) или operator (доступ только к своим муниципалитетам)';
COMMENT ON COLUMN users.is_active IS 'Активность пользователя (блокировка без удаления)';
