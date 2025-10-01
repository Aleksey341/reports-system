# 🚨 НЕМЕДЛЕННОЕ РАЗВЕРТЫВАНИЕ

## Проблема
```
ERROR: indicator_values table not found. Run: npm run db:init
ERROR: 404 on /api/reports/export
```

## Причины
1. ❌ База данных не инициализирована
2. ❌ Старый код на сервере (нет роута export)

---

## ⚡ РЕШЕНИЕ (5 минут)

### Вариант 1: Автоматический скрипт

**Скопируйте на сервер и выполните:**

```bash
# Скачать скрипт
curl -o deploy.sh https://raw.githubusercontent.com/Aleksey341/reports-system/main/DEPLOY_NOW.sh

# Сделать исполняемым
chmod +x deploy.sh

# Запустить
./deploy.sh

# ОБЯЗАТЕЛЬНО ПЕРЕЗАПУСТИТЬ!
pm2 restart all
```

### Вариант 2: Вручную (пошагово)

```bash
# Шаг 1: Обновить код
cd /path/to/reports-system
git pull origin main
npm install

# Шаг 2: Инициализировать БД
npm run db:init

# Выход должен быть:
# ✅ Успешно выполнено
# ✓ indicators_catalog - 10 записей
# ✓ services_catalog - 25 записей

# Шаг 3: Загрузить муниципалитеты
npm run db:migrate

# Шаг 4: ПЕРЕЗАПУСК (КРИТИЧНО!)
pm2 restart all
# ИЛИ если используете systemd:
systemctl restart your-app-service
# ИЛИ просто:
npm start
```

### Вариант 3: Через Amvera Dashboard

1. Откройте **Amvera Dashboard**
2. Перейдите в **Settings → Git**
3. Нажмите **Redeploy from main branch**
4. Подождите завершения
5. Перейдите в **Console**
6. Выполните:
   ```bash
   npm run db:init
   npm run db:migrate
   ```
7. Перезапустите приложение через Dashboard

---

## ✅ Проверка после развертывания

### 1. Проверьте health
```bash
curl https://reports-system-alex1976.amvera.io/health
```

**Должно быть:**
```json
{
  "status": "healthy",
  "db_mapping": {
    "indicatorsCatalog": "public.indicators_catalog",
    "indicatorValues": "public.indicator_values",   // ✅ НЕ null!
    "servicesCatalog": "public.services_catalog",
    "serviceValues": "public.service_values"
  }
}
```

**Если `indicatorValues: null`** → сервер НЕ перезапущен!

### 2. Проверьте данные
```bash
curl https://reports-system-alex1976.amvera.io/api/indicators/form_1_gmu
```

**Должен вернуть массив из 10 показателей:**
```json
[
  {"id":1,"code":"ind_001","name":"Численность населения","unit":"чел."},
  ...
]
```

### 3. Проверьте роуты (если NODE_ENV=development)
```bash
curl https://reports-system-alex1976.amvera.io/api/debug/routes
```

**Должен содержать:**
```json
{
  "routes": [
    {"method":"POST","path":"/api/reports/export"},  // ✅ Должен быть!
    {"method":"POST","path":"/api/reports/save"},
    ...
  ]
}
```

---

## 🧪 Тест в браузере

### 1. Откройте форму
```
https://reports-system-alex1976.amvera.io/form
```

### 2. Откройте консоль (F12)

### 3. Проверьте загрузку данных

**Должны увидеть:**
```javascript
✅ Загружены муниципалитеты
✅ Загружены категории услуг
✅ Загружены показатели (таблица заполнена)
```

### 4. Попробуйте сохранить

**Выберите:**
- Месяц: Октябрь 2025
- Муниципалитет: любой
- Категория: МФЦ - Паспорта и документы
- Услуга: Выдача паспорта гражданина РФ

**Заполните любое значение, нажмите "Сохранить отчёт"**

**Ожидаемый результат:**
```javascript
[FORM] Response status: 200 OK  // ✅
✅ Отчёт сохранён! (зеленый баннер)
```

**Если всё ещё 500:**
```javascript
[FORM] Response status: 500
[FORM] Error details: {
  "error": "indicator_values table not found"
}
```

→ **Сервер НЕ перезапущен после db:init!**

### 5. Попробуйте скачать Excel

**Нажмите "Скачать Excel"**

**Ожидаемый результат:**
```javascript
[FORM] Export response status: 200 OK  // ✅
✅ Excel файл загружен! (зеленый баннер)
```

**Если 404:**
```javascript
[FORM] Export response status: 404
```

→ **Старый код! Выполните `git pull` и перезапустите**

---

## 🔧 Если проблемы остаются

### Проблема: "indicator_values table not found" после db:init

**Проверка:**
```bash
# Подключитесь к PostgreSQL
psql -U reports_admin -d reports

# Проверьте таблицы
\dt public.*

# Должны быть:
# public.municipalities
# public.indicators_catalog
# public.indicator_values
# public.services_catalog
# public.service_values
```

**Если таблиц нет:**
```sql
-- Выполните SQL напрямую
\i database/schema.sql
\i database/seed_data.sql
```

### Проблема: 404 на /api/reports/export после git pull

**Проверка:**
```bash
# Убедитесь, что код обновлен
git log --oneline -3

# Должен содержать:
# a0fcf0e Fix: Enhanced error logging...
# 3b6a6a5 Debug: Add detailed logging...

# Проверьте роут в коде
grep -n "app.post.*export" server.js

# Должен вывести:
# 435:app.post('/api/reports/export', async (req, res, next) => {
```

**Если роута нет в коде:**
```bash
# Жесткий сброс к последней версии
git fetch origin
git reset --hard origin/main
npm install
pm2 restart all
```

---

## 📋 Чеклист развертывания

- [ ] git pull origin main
- [ ] npm install
- [ ] npm run db:init (создает таблицы + данные)
- [ ] npm run db:migrate (загружает муниципалитеты)
- [ ] **ПЕРЕЗАПУСК СЕРВЕРА** (pm2 restart all)
- [ ] curl /health → db_mapping все заполнены
- [ ] curl /api/indicators/form_1_gmu → 10 показателей
- [ ] Форма открывается, списки заполнены
- [ ] Сохранение работает (200 OK)
- [ ] Экспорт Excel работает (200 OK)

---

## 🆘 Экстренное восстановление

**Если ничего не помогает - полная переустановка:**

```bash
# 1. Остановить сервер
pm2 stop all

# 2. Очистить БД
psql -U reports_admin -d reports <<EOF
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO reports_admin;
GRANT ALL ON SCHEMA public TO public;
EOF

# 3. Чистая установка
cd /path/to/reports-system
git fetch origin
git reset --hard origin/main
npm install
npm run db:init
npm run db:migrate

# 4. Запуск
pm2 start npm -- start

# 5. Проверка
sleep 5
curl http://localhost/health | jq
```

---

## 📞 Контакты для помощи

После выполнения отправьте мне:

1. Вывод `curl http://localhost/health | jq`
2. Вывод `npm run db:check`
3. Лог сервера (первые 50 строк после запуска)
4. Скриншот консоли браузера (F12) с ошибками

**Удачи! 🚀**
