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
const PORT = Number(process.env.PORT || 80);

/* Безопасность */
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
        connectSrc: ["'self'"],
      },
    },
  })
);

/* Rate limit */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Превышен лимит запросов. Попробуйте позже.',
  })
);

/* Общие middleware */
app.use(compression());
app.use(
  cors({
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* Статика */
app.use(express.static('public'));

/* Лог запросов */
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} - ${req.ip}`);
  next();
});

/* ==================== API ==================== */

/** Справочник муниципалитетов */
app.get('/api/municipalities', async (req, res, next) => {
  try {
    // поправь названия таблицы/полей под свою схему
    const sql = 'SELECT id, name FROM municipalities ORDER BY name';
    const { rows } = await poolRO.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching municipalities:', err);
    next(err);
  }
});

/** Шаблон показателей для формы 1-ГМУ (и универсальный по form_code) */
app.get('/api/indicators/:formCode', async (req, res, next) => {
  try {
    const { formCode } = req.params; // например: form_1_gmu
    // поправь названия таблицы/полей под свою схему
    const sql = `
      SELECT id, code, name, unit
      FROM indicators
      WHERE form_code = $1
      ORDER BY sort_order, id
    `;
    const { rows } = await poolRO.query(sql, [formCode]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching indicators:', err);
    next(err);
  }
});

/** Совместимость со старым фронтом: /api/indicators/form_1_gmu */
app.get('/api/indicators/form_1_gmu', async (req, res, next) => {
  try {
    const sql = `
      SELECT id, code, name, unit
      FROM indicators
      WHERE form_code = $1
      ORDER BY sort_order, id
    `;
    const { rows } = await poolRO.query(sql, ['form_1_gmu']);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching indicators:', err);
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

/* Запуск */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📊 Дашборд: http://localhost:${PORT}/dashboard`);
  console.log(`📝 Форма:   http://localhost:${PORT}/form`);
  console.log(`❤️ Health:  http://localhost:${PORT}/health`);
});

module.exports = app;
