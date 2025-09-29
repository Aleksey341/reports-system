// server.js
'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { pool, poolRO } = require('./config/database');

const app = express();
app.set('trust proxy', 1); // корректная идентификация IP за прокси/балансировщиком
const PORT = Number(process.env.PORT || 80);

/* ---------- Безопасность (CSP расширен для jsDelivr) ---------- */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:'],
        // sourcemap/fetch для CDN
        connectSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      },
    },
  })
);

/* ---------- Rate limit ---------- */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Превышен лимит запросов. Попробуйте позже.',
  })
);

/* ---------- Общие middleware ---------- */
app.use(compression());
app.use(
  cors({
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ---------- Статика ---------- */
app.use(express.static('public'));

/* ---------- Лог запросов ---------- */
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} - ${req.ip}`);
  next();
});

/* ---------- Определение схемы/таблиц на старте ---------- */
const DB = {
  indicatorsCatalog: null,   // 'public.indicators_catalog' или 'public.indicators'
  indicatorValues: null,     // 'public.indicator_values' если существует
};

async function resolveTables() {
  // что есть в БД
  const q = `
    SELECT
      to_regclass('public.indicators_catalog') AS icatalog,
      to_regclass('public.indicators')         AS indicators,
      to_regclass('public.indicator_values')   AS ivalues
  `;
  const { rows } = await poolRO.query(q);
  const r = rows[0];

  // каталог показателей (обязателен для /api/indicators/*)
  if (r.icatalog) {
    DB.indicatorsCatalog = 'public.indicators_catalog';
  } else if (r.indicators) {
    DB.indicatorsCatalog = 'public.indicators';
  } else {
    DB.indicatorsCatalog = null;
  }

  // таблица значений для дашборда (необязательна)
  DB.indicatorValues = r.ivalues ? 'public.indicator_values' : null;

  console.log('DB mapping:', DB);
}

// запускаем обнаружение сразу
resolveTables().catch((e) => {
  console.error('Failed to resolve tables on startup:', e);
});

/* ==================== API ==================== */

/** Справочник муниципалитетов */
app.get('/api/municipalities', async (_req, res, next) => {
  try {
    const sql = 'SELECT id, name FROM public.municipalities ORDER BY name';
    const { rows } = await poolRO.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching municipalities:', err);
    next(err);
  }
});

/** Шаблон показателей по form_code (универсальный) */
app.get('/api/indicators/:formCode', async (req, res, next) => {
  try {
    if (!DB.indicatorsCatalog) {
      return res.status(500).json({ error: 'Catalog table not found (indicators/indicators_catalog)' });
    }

    const { formCode } = req.params; // например: form_1_gmu
    const sql = `
      SELECT id, code, name, unit
      FROM ${DB.indicatorsCatalog}
      WHERE form_code = $1
      ORDER BY sort_order NULLS LAST, id
    `;
    const { rows } = await poolRO.query(sql, [formCode]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching indicators:', err);
    next(err);
  }
});

/** Совместимость: /api/indicators/form_1_gmu */
app.get('/api/indicators/form_1_gmu', async (_req, res, next) => {
  try {
    if (!DB.indicatorsCatalog) {
      return res.status(500).json({ error: 'Catalog table not found (indicators/indicators_catalog)' });
    }

    const sql = `
      SELECT id, code, name, unit
      FROM ${DB.indicatorsCatalog}
      WHERE form_code = $1
      ORDER BY sort_order NULLS LAST, id
    `;
    const { rows } = await poolRO.query(sql, ['form_1_gmu']);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching indicators:', err);
    next(err);
  }
});

/** Сводные данные для дашборда (работает только если есть indicator_values) */
app.get('/api/dashboard/data', async (req, res, next) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();

    if (!DB.indicatorValues) {
      // Нет таблицы значений — отдаём нули, чтобы не падать 500
      const byMonth = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        total_value: 0,
        records: 0,
      }));
      return res.json({ year, byMonth });
    }

    const sql = `
      SELECT
        period_month AS month,
        COALESCE(SUM(value_numeric), 0) AS total_value,
        COUNT(*) AS records
      FROM ${DB.indicatorValues}
      WHERE period_year = $1
      GROUP BY period_month
      ORDER BY period_month
    `;
    const { rows } = await poolRO.query(sql, [year]);

    const byMonth = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const found = rows.find(r => Number(r.month) === m);
      return {
        month: m,
        total_value: found ? Number(found.total_value) : 0,
        records: found ? Number(found.records) : 0,
      };
    });

    res.json({ year, byMonth });
  } catch (err) {
    console.error('Dashboard data error:', err);
    next(err);
  }
});

/** Базовая статистика */
app.get('/api/stats', async (_req, res, next) => {
  try {
    const promises = [poolRO.query('SELECT COUNT(*)::int AS cnt FROM public.municipalities')];

    if (DB.indicatorValues) {
      promises.push(poolRO.query(`SELECT COUNT(*)::int AS cnt FROM ${DB.indicatorValues}`));
    } else {
      // если нет таблицы значений — вернём 0
      promises.push(Promise.resolve({ rows: [{ cnt: 0 }] }));
    }

    const [m, v] = await Promise.all(promises);

    res.json({
      municipalities: m.rows[0].cnt,
      indicator_values: v.rows[0].cnt,
    });
  } catch (err) {
    console.error('Error fetching stats:', err);
    next(err);
  }
});

/* ==================== Страницы ==================== */

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/form', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'form.html'));
});

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

/* ==================== Health ==================== */

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    await poolRO.query('SELECT 1');

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: process.env.npm_package_version || '1.0.0',
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
});

/* ==================== Ошибки ==================== */

app.use((_req, res) => {
  res.status(404).json({ error: 'Страница не найдена' });
});

app.use((err, _req, res, _next) => {
  console.error('Global error handler:', err);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'Внутренняя ошибка сервера',
    ...(isDev && { stack: err.stack }),
  });
});

/* ==================== Завершение ==================== */

const shutdown = async (signal) => {
  console.log(`${signal} получен. Завершение работы...`);
  try {
    await pool.end();
    await poolRO.end();
  } finally {
    process.exit(0);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/* -------------------- Запуск -------------------- */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📊 Дашборд: http://localhost:${PORT}/dashboard`);
  console.log(`📝 Форма:   http://localhost:${PORT}/form`);
  console.log(`❤️ Health:  http://localhost:${PORT}/health`);
});

module.exports = app;
