-- Создание пользователя "Губернатор Липецкой области"
-- Выполните этот скрипт в pgAdmin

-- Добавить нового пользователя с ролью "governor"
INSERT INTO users (municipality_id, username, password_hash, role, password_reset_required)
VALUES (
  NULL,  -- Губернатор не привязан к конкретному муниципалитету
  'governor',
  '$2b$10$rQZ5YHqXKZ5XGqXKZ5XGqOZGqXKZ5XGqXKZ5XGqXKZ5XGqXKZ5XGq',  -- Пароль: Governor2025 (нужно изменить!)
  'governor',
  TRUE  -- Требуется смена пароля при первом входе
)
ON CONFLICT (username) DO NOTHING;

-- Проверка
SELECT id, username, role, password_reset_required
FROM users
WHERE username = 'governor';

-- ВАЖНО: После создания пользователя замените пароль!
-- Используйте bcrypt для генерации хеша пароля
