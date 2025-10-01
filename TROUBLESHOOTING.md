# 🔧 Решение проблем

## Ошибка 500 при сохранении отчета

### Симптомы
```
Failed to load resource: the server responded with a status of 500
POST /api/reports/save - 500 Internal Server Error
```

### Возможные причины

#### 1. База данных не инициализирована

**Проверка:**
```bash
npm run db:check
```

**Ожидаемый результат:**
```
✅ Подключение к БД успешно

📊 Статус таблиц:

✅ municipalities              - 18+ записей
✅ indicators_catalog          - 10+ записей
⚠️  indicator_values           - 0 записей (нормально для новой БД)
✅ services_catalog            - 25+ записей
⚠️  service_values             - 0 записей (нормально для новой БД)
```

**Решение (если таблицы отсутствуют):**
```bash
npm run db:init
```

#### 2. Таблица indicator_values не создана

**Проверка в PostgreSQL:**
```sql
SELECT * FROM pg_tables WHERE tablename = 'indicator_values';
```

**Решение:**
```bash
npm run db:init
```

#### 3. Нарушение constraint

**Ошибка в логах:**
```
duplicate key value violates unique constraint "uq_indicator_values"
```

**Причина:** Попытка сохранить данные для уже существующей комбинации (municipality_id, indicator_id, period_year, period_month).

**Решение:** Это нормально! Используется `ON CONFLICT DO UPDATE`, данные должны обновляться.

#### 4. Foreign key violation

**Ошибка в логах:**
```
insert or update on table "indicator_values" violates foreign key constraint
```

**Причины:**
- `municipality_id` не существует в таблице `municipalities`
- `indicator_id` не существует в таблице `indicators_catalog`

**Проверка:**
```bash
npm run db:check
```

Убедитесь, что есть данные в:
- `municipalities` (загружаются через `npm run db:migrate`)
- `indicators_catalog` (загружаются через `npm run db:init`)

#### 5. DB.indicatorValues = null

**Ошибка:**
```json
{
  "error": "indicator_values table not found. Run: npm run db:init"
}
```

**Причина:** Таблица не обнаружена при старте сервера.

**Решение:**
1. Выполните `npm run db:init`
2. **Перезапустите сервер** (server.js проверяет таблицы только при старте)

```bash
# Остановите сервер (Ctrl+C)
npm start
```

### Диагностика через логи

**Включите детальные логи:**

В `.env` добавьте:
```env
NODE_ENV=development
```

**Смотрите логи сервера:**
```
[SAVE REPORT] Incoming request body: {...}
[SAVE REPORT] DB.indicatorValues: public.indicator_values
[SAVE REPORT] Validation passed. Processing 10 values
[SQL][reports:save] INSERT INTO public.indicator_values ...
[SAVE REPORT] Transaction started
[SAVE REPORT] Insert/Update completed. Rows affected: 10
[SAVE REPORT] Transaction committed
```

**Если видите ошибку:**
```
[SAVE REPORT] Error: relation "public.indicator_values" does not exist
```

→ Выполните `npm run db:init` и перезапустите сервер!

### Проверка через консоль браузера (F12)

**Откройте форму → F12 → Console → попробуйте сохранить:**

```javascript
[FORM] Saving report with payload: {
  municipality_id: 1,
  period_year: 2025,
  period_month: 10,
  values: [
    { indicator_id: 1, value: 100 },
    { indicator_id: 2, value: 200 }
  ]
}
[FORM] Server response: { success: true, saved: 2, message: "..." }
```

**Если ошибка:**
```javascript
[FORM] Save failed: {
  error: "Ошибка при сохранении отчета",
  detail: "relation \"public.indicator_values\" does not exist"
}
```

→ База не инициализирована!

## Пошаговое решение

### Шаг 1: Проверка БД
```bash
npm run db:check
```

### Шаг 2: Инициализация (если нужно)
```bash
npm run db:init
```

**Ожидаемый вывод:**
```
📄 Создание схемы БД
   Файл: .../database/schema.sql
   ✅ Успешно выполнено

📄 Загрузка тестовых данных
   Файл: .../database/seed_data.sql
   ✅ Успешно выполнено

📊 Проверка созданных таблиц:
   ✓ municipalities              - 0 записей
   ✓ indicators_catalog          - 10 записей
   ✓ indicator_values            - 0 записей
   ✓ services_catalog            - 25 записей
   ✓ service_values              - 0 записей

🎉 Инициализация завершена успешно!
```

### Шаг 3: Загрузка муниципалитетов
```bash
npm run db:migrate
```

### Шаг 4: Перезапуск сервера (ВАЖНО!)
```bash
# Остановить (Ctrl+C)
npm start
```

**Смотрите в логах:**
```
DB mapping: {
  indicatorsCatalog: 'public.indicators_catalog',
  indicatorValues: 'public.indicator_values',
  servicesCatalog: 'public.services_catalog',
  serviceValues: 'public.service_values'
}
```

Если `indicatorValues: null` → база не инициализирована!

### Шаг 5: Тест сохранения

1. Откройте http://localhost/form
2. Откройте консоль браузера (F12)
3. Выберите:
   - Месяц
   - Муниципалитет
   - Категорию услуг
   - Услугу
4. Заполните любое значение
5. Нажмите "Сохранить отчёт"

**Успех:**
```
✅ Отчёт сохранён! (зеленый баннер)
```

**Ошибка:**
```
❌ Ошибка при сохранении отчета: ... (красный баннер)
```

Смотрите детали в консоли браузера и логах сервера.

## Частые вопросы

### Q: Нужно ли выбирать услугу для сохранения?
**A:** Да! Без выбора услуги кнопки заблокированы.

### Q: Данные сохраняются в indicator_values или service_values?
**A:** В `indicator_values`. Форма 1-ГМУ работает с показателями (indicators), услуга нужна только для контекста.

### Q: Как проверить, что данные сохранились?
**A:** SQL-запрос:
```sql
SELECT
  m.name as municipality,
  ic.name as indicator,
  iv.value_numeric,
  iv.period_year,
  iv.period_month
FROM indicator_values iv
JOIN municipalities m ON m.id = iv.municipality_id
JOIN indicators_catalog ic ON ic.id = iv.indicator_id
ORDER BY iv.created_at DESC
LIMIT 10;
```

### Q: Ошибка "роль не существует"
**A:** Проверьте переменные окружения в `.env`:
```env
DB_USER=reports_admin
DB_PASSWORD=Qwerty12345!
DB_NAME=reports
```

### Q: Connection timeout
**A:** Проверьте хост и порт:
```env
DB_HOST=localhost  # или amvera-alex1976-cnpg-reports-db-rw
DB_PORT=5432
```

## Команды для диагностики

```bash
# Проверка БД
npm run db:check

# Инициализация БД
npm run db:init

# Миграция муниципалитетов
npm run db:migrate

# Запуск сервера
npm start

# Логи сервера (на Amvera)
tail -f /var/log/app.log
```

---

**Если проблема не решена:**

1. Соберите логи:
   - Вывод `npm run db:check`
   - Консоль браузера (F12)
   - Логи сервера
2. Проверьте версии:
   - Node.js: `node --version` (>=18.0.0)
   - PostgreSQL: `psql --version` (>=13.0)
