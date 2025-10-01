# 🆘 КРИТИЧЕСКАЯ ИНСТРУКЦИЯ - ИСПРАВИТЬ СЕЙЧАС

## ⚠️ ОШИБКА ВСЁ ЕЩЁ ЕСТЬ!

Вы всё ещё видите:
```
ERROR: indicator_values table not found
ERROR: 404 on /api/reports/export
```

Это значит **НА СЕРВЕРЕ НЕ ВЫПОЛНЕНЫ КОМАНДЫ!**

---

## 🔥 СРОЧНЫЙ FIX - ВЫПОЛНИТЕ ПРЯМО СЕЙЧАС

### Вариант A: SQL напрямую (САМЫЙ НАДЁЖНЫЙ)

```bash
# 1. Подключитесь к серверу Amvera через SSH/Console

# 2. Скачайте SQL-файл
cd /tmp
curl -o fix.sql https://raw.githubusercontent.com/Aleksey341/reports-system/main/EMERGENCY_SQL_FIX.sql

# 3. Выполните SQL
psql -U reports_admin -d reports -f fix.sql

# Должно вывести:
# ✅ Database initialized successfully!

# 4. ОБЯЗАТЕЛЬНО ПЕРЕЗАПУСТИТЬ СЕРВЕР
pm2 restart all
```

**ИЛИ через psql интерактивно:**

```bash
# Войти в PostgreSQL
psql -U reports_admin -d reports

# В psql скопировать и выполнить содержимое EMERGENCY_SQL_FIX.sql
# (весь файл целиком)

# Выйти
\q

# ПЕРЕЗАПУСТИТЬ СЕРВЕР
pm2 restart all
```

### Вариант B: Через Node.js (если A не работает)

```bash
# Перейдите в папку проекта
cd /path/to/reports-system

# Обновите код
git pull origin main
npm install

# Инициализация БД
npm run db:init

# ОЖИДАЕМЫЙ ВЫВОД:
# ✅ Успешно выполнено
# ✓ indicators_catalog - 10 записей
# ✓ services_catalog - 25 записей

# ПЕРЕЗАПУСТИТЬ
pm2 restart all
```

---

## ✅ ПРОВЕРКА (ОБЯЗАТЕЛЬНО!)

### 1. Проверьте health endpoint

```bash
curl https://reports-system-alex1976.amvera.io/health | jq
```

**ДОЛЖНО БЫТЬ:**
```json
{
  "status": "healthy",
  "db_mapping": {
    "indicatorsCatalog": "public.indicators_catalog",
    "indicatorValues": "public.indicator_values",   // ✅ НЕ NULL!
    "servicesCatalog": "public.services_catalog",
    "serviceValues": "public.service_values"        // ✅ НЕ NULL!
  }
}
```

**Если хоть одно поле NULL → СЕРВЕР НЕ ПЕРЕЗАПУЩЕН!**

```bash
# Перезапустите ещё раз!
pm2 restart all

# Подождите 10 секунд
sleep 10

# Проверьте снова
curl http://localhost/health | jq
```

### 2. Проверьте данные

```bash
curl https://reports-system-alex1976.amvera.io/api/indicators/form_1_gmu
```

**ДОЛЖНО вернуть массив из 10 показателей:**
```json
[
  {"id":1,"code":"ind_001","name":"Численность населения","unit":"чел."},
  {"id":2,"code":"ind_002","name":"Площадь территории","unit":"км²"},
  ...
]
```

**Если пустой массив `[]` → БД НЕ инициализирована!**

### 3. Проверьте в браузере

**Откройте:** https://reports-system-alex1976.amvera.io/form

**Откройте консоль (F12)**

**Попробуйте сохранить отчёт:**

**ОЖИДАЕТСЯ:**
```javascript
[FORM] Response status: 200 OK  // ✅ НЕ 500!
✅ Отчёт сохранён!
```

**Если всё ещё 500:**
```javascript
[FORM] Response status: 500
[FORM] Error details: {
  "error": "indicator_values table not found"
}
```

→ **СЕРВЕР НЕ ПЕРЕЗАПУЩЕН ПОСЛЕ SQL!**

---

## 🔍 ДИАГНОСТИКА ПРОБЛЕМЫ

### Проверка 1: Таблицы созданы?

```sql
-- Войти в PostgreSQL
psql -U reports_admin -d reports

-- Проверить таблицы
\dt public.*

-- ДОЛЖНЫ БЫТЬ:
-- public.municipalities
-- public.indicators_catalog
-- public.indicator_values
-- public.services_catalog
-- public.service_values

-- Проверить данные
SELECT COUNT(*) FROM public.indicators_catalog;
-- Должно быть: 10

SELECT COUNT(*) FROM public.services_catalog;
-- Должно быть: 24+
```

**Если таблиц НЕТ:**
```
→ SQL-файл НЕ выполнен или выполнен с ошибками
→ Выполните EMERGENCY_SQL_FIX.sql заново
```

**Если таблицы ПУСТЫЕ:**
```
→ Выполнилась только первая часть (CREATE TABLE)
→ Данные не загрузились
→ Выполните вторую часть (INSERT INTO)
```

### Проверка 2: Сервер видит таблицы?

```bash
# Проверьте логи при старте сервера
pm2 logs --lines 50

# ИЩИТЕ строку:
# DB mapping: { indicatorsCatalog: '...', indicatorValues: '...', ... }

# Если indicatorValues: null:
→ Сервер НЕ видит таблицу
→ Возможно таблица в другой схеме
→ Проверьте search_path в PostgreSQL
```

### Проверка 3: Код актуален?

```bash
cd /path/to/reports-system

# Проверьте последний коммит
git log --oneline -1

# ДОЛЖНО быть:
# 0b6d2ce Critical: Add deployment scripts...

# Если другой коммит:
git pull origin main
pm2 restart all
```

---

## 🆘 ЭКСТРЕННОЕ ВОССТАНОВЛЕНИЕ

**Если НИЧЕГО не помогает - полный сброс:**

```bash
# 1. Остановить всё
pm2 stop all

# 2. Полностью удалить БД и создать заново
psql -U postgres <<EOF
DROP DATABASE IF EXISTS reports;
CREATE DATABASE reports;
GRANT ALL PRIVILEGES ON DATABASE reports TO reports_admin;
EOF

# 3. Подключиться к новой БД
psql -U reports_admin -d reports <<EOF
CREATE SCHEMA IF NOT EXISTS public;
GRANT ALL ON SCHEMA public TO reports_admin;
GRANT ALL ON SCHEMA public TO public;
EOF

# 4. Выполнить SQL-фикс
psql -U reports_admin -d reports -f /tmp/fix.sql

# 5. Проверка
psql -U reports_admin -d reports -c "\dt public.*"

# 6. Запуск
cd /path/to/reports-system
pm2 start npm -- start

# 7. Проверка
sleep 10
curl http://localhost/health | jq
```

---

## 📞 ЕСЛИ НИЧЕГО НЕ РАБОТАЕТ

**Отправьте мне следующую информацию:**

### 1. Вывод health
```bash
curl https://reports-system-alex1976.amvera.io/health | jq > health.json
cat health.json
```

### 2. Список таблиц
```bash
psql -U reports_admin -d reports -c "\dt public.*" > tables.txt
cat tables.txt
```

### 3. Логи сервера
```bash
pm2 logs --lines 100 --nostream > server_logs.txt
cat server_logs.txt
```

### 4. Версия кода
```bash
cd /path/to/reports-system
git log --oneline -5 > git_log.txt
cat git_log.txt
```

### 5. Проверка роута export
```bash
grep -n "app.post.*export" server.js > routes.txt
cat routes.txt
```

**Отправьте мне эти 5 файлов!**

---

## ✅ КОНТРОЛЬНЫЙ ЧЕКЛИСТ

После исправления все пункты должны быть ✅:

- [ ] `curl /health` → `indicatorValues: "public.indicator_values"` (НЕ null)
- [ ] `curl /api/indicators/form_1_gmu` → массив из 10 показателей (НЕ пустой)
- [ ] `curl /api/service-categories` → список категорий (НЕ пустой)
- [ ] Форма `/form` → списки заполнены
- [ ] Сохранение → статус 200 OK (НЕ 500)
- [ ] Экспорт Excel → статус 200 OK (НЕ 404)
- [ ] Файл скачивается

**Если хоть один пункт ✗ → проблема НЕ решена!**

---

**УДАЧИ! 🚀**

**P.S. Главное - НЕ ЗАБУДЬТЕ ПЕРЕЗАПУСТИТЬ СЕРВЕР после SQL!**
