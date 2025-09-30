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
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 80);

/* ---------- Безопасность ---------- */
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        // inline-обработчики (если на фронте они есть)
        scriptSrcAttr: ["'unsafe-inline'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'https://cdn.jsdelivr.net'],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    referrerPolicy: { policy: 'no-referrer' },
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

/* ---------- Вспомогательный SQL-логгер ---------- */
function logSql(tag, sql, params = []) {
  console.log(`[SQL][${tag}] ${sql.replace(/\s+/g, ' ').trim()}`);
  if (params && params.length) console.log(`[SQL][${tag}] params:`, params);
}

/* ---------- Авто-детект объектов БД ---------- */
const DB = {
  indicatorsCatalog: null,   // public.indicators_catalog | public.indicators
  indicatorValues: null,     // public.indicator_values
  servicesCatalog: null,     // public.services_catalog
  serviceValues: null,       // public.service_values
};

async function resolveTables() {
  const q = `
    SELECT
      to_regclass('public.indicators_catalog') AS icatalog,
      to_regclass('public.indicators')         AS indicators,
      to_regclass('public.indicator_values')   AS ivalues,
      to_regclass('public.services_catalog')   AS scatalog,
      to_regclass('public.service_values')     AS svalues
  `;
  const { rows } = await poolRO.query(q);
  const r = rows[0];

  DB.indicatorsCatalog = r.icatalog ? 'public.indicators_catalog' : (r.indicators ? 'public.indicators' : null);
  DB.indicatorValues   = r.ivalues ? 'public.indicator_values' : null;
  DB.servicesCatalog   = r.scatalog ? 'public.services_catalog' : null;
  DB.serviceValues     = r.svalues ? 'public.service_values' : null;

  console.log('DB mapping:', DB);
}
resolveTables().catch((e) => {
  console.error('Failed to resolve tables on startup:', e);
});

/* ==================== API ==================== */
/* ---- Муниципалитеты ---- */
app.get('/api/municipalities', async (_req, res, next) => {
  try {
    const sql = 'SELECT id, name FROM public.municipalities ORDER BY name';
    logSql('municipalities', sql);
    const { rows } = await poolRO.query(sql);
    console.log(`[API] /api/municipalities -> ${rows.length} rows`);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching municipalities:', err);
    next(err);
  }
});

/* ---- Индикаторы (форма 1-ГМУ) ---- */
/** Спец-роут обязательно выше универсального */
app.get('/api/indicators/form_1_gmu', async (_req, res, next) => {
  try {
    if (!DB.indicatorsCatalog) {
      return res.status(500).json({ error: 'Catalog table not found (indicators/indicators_catalog)' });
    }
    const sql = `
      SELECT id, code, name, unit
      FROM ${DB.indicatorsCatalog}
      WHERE form_code = 'form_1_gmu'
      ORDER BY sort_order NULLS LAST, id
    `;
    logSql('indicators:form_1_gmu', sql);
    const { rows } = await pool.query(q);
    console.log(`[API] /api/indicators/form_1_gmu -> ${rows.length} rows`);
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/indicators/form_1_gmu:', err);
    next(err);
  }
});

/** Универсальный роут по formCode */
app.get('/api/indicators/:formCode', async (req, res, next) => {
  try {
    if (!DB.indicatorsCatalog) {
      return res.status(500).json({ error: 'Catalog table not found (indicators/indicators_catalog)' });
    }
    const { formCode } = req.params;
    const sql = `
      SELECT id, code, name, unit
      FROM ${DB.indicatorsCatalog}
      WHERE form_code = $1
      ORDER BY sort_order NULLS LAST, id
    `;
    logSql(`indicators:${formCode}`, sql, [formCode]);
    const { rows } = await poolRO.query(sql, [formCode]);
    console.log(`[API] /api/indicators/${formCode} -> ${rows.length} rows`);
    res.json(rows);
  } catch (err) {
    console.error('Error in /api/indicators/:formCode:', err);
    next(err);
  }
});

/* ---- Дашборд «старый» (по indicator_values) ---- */
app.get('/api/dashboard/data', async (req, res, next) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();

    if (!DB.indicatorValues) {
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
    logSql('dashboard:data', sql, [year]);
    const { rows } = await poolRO.query(sql, [year]);

    const byMonth = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const found = rows.find((r) => Number(r.month) === m);
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

/* ---- Статистика ---- */
app.get('/api/stats', async (_req, res, next) => {
  try {
    const promises = [poolRO.query('SELECT COUNT(*)::int AS cnt FROM public.municipalities')];
    if (DB.indicatorValues) promises.push(poolRO.query(`SELECT COUNT(*)::int AS cnt FROM ${DB.indicatorValues}`));
    else promises.push(Promise.resolve({ rows: [{ cnt: 0 }] }));
    const [m, v] = await Promise.all(promises);
    res.json({ municipalities: m.rows[0].cnt, indicator_values: v.rows[0].cnt });
  } catch (err) {
    console.error('Error fetching stats:', err);
    next(err);
  }
});

/* ======================================================================
 *                >>>   С Е Р В И С Ы   (новые API)   <<<
 * ====================================================================*/

/** 1) Справочник услуг — для выпадающего списка в дашборде */
app.get('/api/services', async (_req, res, next) => {
  try {
    if (!DB.servicesCatalog) return res.json([]); // мягко, чтобы UI не падал
    const sql = `
      SELECT id, code, name, unit, category
      FROM ${DB.servicesCatalog}
      ORDER BY COALESCE(category,''), name
    `;
    logSql('services:list', sql);
    const { rows } = await poolRO.query(sql);
    res.json(rows);
  } catch (err) { next(err); }
});

/** 2) Агрегат по месяцам для выбранной услуги и года */
app.get('/api/services/:id/monthly', async (req, res, next) => {
  try {
    if (!DB.serviceValues) return res.json({ serviceId: Number(req.params.id), year: Number(req.query.year)||new Date().getFullYear(), byMonth: Array.from({length:12},(_,i)=>({month:i+1,total:0})) });

    const serviceId = Number(req.params.id);
    const year = Number(req.query.year) || new Date().getFullYear();

    const sql = `
      SELECT period_month AS month, SUM(value_numeric) AS total
      FROM ${DB.serviceValues}
      WHERE service_id = $1 AND period_year = $2
      GROUP BY period_month
      ORDER BY period_month
    `;
    logSql('services:monthly', sql, [serviceId, year]);
    const { rows } = await poolRO.query(sql, [serviceId, year]);

    const byMonth = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const r = rows.find(x => Number(x.month) === m);
      return { month: m, total: r ? Number(r.total) : 0 };
    });

    res.json({ serviceId, year, byMonth });
  } catch (err) { next(err); }
});

/** 3) Детализация по муниципалитетам для услуги и года */
app.get('/api/services/:id/details', async (req, res, next) => {
  try {
    if (!DB.serviceValues) return res.json({ serviceId: Number(req.params.id), year: Number(req.query.year)||new Date().getFullYear(), rows: [] });

    const serviceId = Number(req.params.id);
    const year = Number(req.query.year) || new Date().getFullYear();

    const sql = `
      SELECT m.id AS municipality_id, m.name, sv.period_month, sv.value_numeric
      FROM ${DB.serviceValues} sv
      JOIN public.municipalities m ON m.id = sv.municipality_id
      WHERE sv.service_id = $1 AND sv.period_year = $2
      ORDER BY m.name, sv.period_month
    `;
    logSql('services:details', sql, [serviceId, year]);
    const { rows } = await poolRO.query(sql, [serviceId, year]);
    res.json({ serviceId, year, rows });
  } catch (err) { next(err); }
});

/* ---------- Импорт исторических данных (JSON) ----------
   Защита: заголовок x-import-token должен совпадать с process.env.IMPORT_TOKEN.
   Включение: process.env.IMPORT_ENABLED === 'true'
--------------------------------------------------------*/
function requireImportAuth(req, res, next) {
  if (process.env.IMPORT_ENABLED !== 'true') return res.status(403).json({ error: 'Import disabled' });
  const token = req.headers['x-import-token'];
  if (!token || token !== process.env.IMPORT_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

/** 4) Импорт справочника услуг (UPSERT по code)
 *  Body (application/json): [{ "code":"X1", "name":"Название", "unit":"ед.", "category":"Категория" }, ...]
 */
app.post('/api/import/services-catalog', requireImportAuth, async (req, res, next) => {
  try {
    if (!DB.servicesCatalog) return res.status(500).json({ error: 'services_catalog not found' });
    const items = Array.isArray(req.body) ? req.body : [];
    if (items.length === 0) return res.json({ inserted: 0, updated: 0 });

    // Собираем параметризованный multi-row INSERT
    const cols = ['code', 'name', 'unit', 'category'];
    const values = [];
    const params = [];
    let p = 1;
    for (const it of items) {
      values.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(
        (it.code || '').trim(),
        (it.name || '').trim(),
        (it.unit || '').trim(),
        (it.category || '').trim(),
      );
    }
    const sql = `
      INSERT INTO ${DB.servicesCatalog} (${cols.join(', ')})
      VALUES ${values.join(', ')}
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          unit = NULLIF(EXCLUDED.unit,'')   IS NOT NULL ? EXCLUDED.unit   : ${DB.servicesCatalog}.unit,
          category = NULLIF(EXCLUDED.category,'') IS NOT NULL ? EXCLUDED.category : ${DB.servicesCatalog}.category
      RETURNING xmax <> 0 AS updated; -- признак апдейта
    `;
    // Прим.: конструкцию с тернарным внутри SQL Postgres не поймет —
    // используем COALESCE/NULLIF в отдельной записи:
    const sqlFixed = `
      INSERT INTO ${DB.servicesCatalog} (${cols.join(', ')})
      VALUES ${values.join(', ')}
      ON CONFLICT (code) DO UPDATE
      SET name = EXCLUDED.name,
          unit = COALESCE(NULLIF(EXCLUDED.unit,''), ${DB.servicesCatalog}.unit),
          category = COALESCE(NULLIF(EXCLUDED.category,''), ${DB.servicesCatalog}.category)
      RETURNING xmax <> 0 AS updated;
    `;

    logSql('import:services-catalog', sqlFixed, params);
    const { rows } = await pool.query(sqlFixed, params);
    const updated = rows.filter(r => r.updated).length;
    res.json({ inserted: rows.length - updated, updated });
  } catch (err) { next(err); }
});

/** 5) Импорт значений услуг (UPSERT по (municipality_id, service_id, year, month))
 *  Body (application/json): [
 *    { "municipality":"г. Елец", "service_code":"X1", "period_year":2025, "period_month":9, "value":123.45 },
 *    ...
 *  ]
 */
app.post('/api/import/service-values', requireImportAuth, async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!DB.serviceValues || !DB.servicesCatalog) return res.status(500).json({ error: 'service tables not found' });
    const items = Array.isArray(req.body) ? req.body : [];
    if (items.length === 0) { client.release(); return res.json({ upserted: 0 }); }

    // Подтягиваем мапы: municipality name -> id, service code -> id
    const [muniRes, servRes] = await Promise.all([
      poolRO.query(`SELECT id, name FROM public.municipalities`),
      poolRO.query(`SELECT id, code FROM ${DB.servicesCatalog}`)
    ]);
    const muniMap = new Map(muniRes.rows.map(r => [r.name.trim(), r.id]));
    const serviceMap = new Map(servRes.rows.map(r => [r.code.trim(), r.id]));

    // Готовим батч
    const vals = [];
    const params = [];
    let p = 1;
    for (const it of items) {
      const mid = muniMap.get(String(it.municipality || '').trim());
      const sid = serviceMap.get(String(it.service_code || '').trim());
      const year = Number(it.period_year);
      const month = Number(it.period_month);
      const value = it.value == null ? null : Number(it.value);

      if (!mid || !sid || !year || !month || month < 1 || month > 12) continue;

      vals.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(mid, sid, year, month, value);
    }
    if (vals.length === 0) { client.release(); return res.json({ upserted: 0 }); }

    const sql = `
      INSERT INTO ${DB.serviceValues}
        (municipality_id, service_id, period_year, period_month, value_numeric)
      VALUES ${vals.join(', ')}
      ON CONFLICT (municipality_id, service_id, period_year, period_month)
      DO UPDATE SET value_numeric = EXCLUDED.value_numeric
    `;
    logSql('import:service-values', sql);
    await client.query('BEGIN');
    await client.query(sql, params);
    await client.query('COMMIT');
    client.release();
    res.json({ upserted: vals.length });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    next(err);
  }
});

/* ==================== Страницы ==================== */
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/form', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'form.html')));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

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
    res.status(500).json({ status: 'unhealthy', timestamp: new Date().toISOString(), error: error.message });
  }
});

/* ==================== Ошибки ==================== */
app.use((_req, res) => res.status(404).json({ error: 'Страница не найдена' }));
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
  try { await pool.end(); await poolRO.end(); }
  finally { process.exit(0); }
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

/* ---------- Отладка: печать всех роутов ---------- */
function printRoutes() {
  try {
    const routes = [];
    app._router.stack.forEach((m) => {
      if (m.route && m.route.path) {
        const methods = Object.keys(m.route.methods).filter((k) => m.route.methods[k]).join(',').toUpperCase();
        routes.push(`${methods} ${m.route.path}`);
      }
    });
    console.log('== Registered routes ==\n' + routes.sort().join('\n') + '\n=======================');
  } catch {}
}

/* -------------------- Запуск -------------------- */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📊 Дашборд: http://localhost:${PORT}/dashboard`);
  console.log(`📝 Форма:   http://localhost:${PORT}/form`);
  console.log(`❤️ Health:  http://localhost:${PORT}/health`);
  printRoutes();
});

module.exports = app;

