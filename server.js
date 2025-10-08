// server.js
'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const ExcelJS = require('exceljs');

const { pool, poolRO } = require('./config/database');
const { requireAuth, requireAdmin, requireMunicipalityAccess } = require('./middleware/auth');

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

/* ---------- Сессии для авторизации ---------- */
app.use(
  session({
    name: 'sid',
    secret: process.env.SESSION_SECRET || 'change-me-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 2 * 60 * 60 * 1000, // 2 часа
    },
  })
);

/* ---------- Общие middleware ---------- */
app.use(compression());
app.use(
  cors({
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [
      'http://localhost:3000',  // React dev server
      'http://localhost:5173',  // Vite dev server
      '*'
    ],
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

/* ---------- DEBUG прокси: все /api/* проходят сюда? ---------- */
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log('[DEBUG] passed proxy → Node sees:', req.method, req.originalUrl);
  }
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
resolveTables().catch((e) => console.error('Failed to resolve tables on startup:', e));

/* ==================== API ==================== */

/* ---- Авторизация ---- */
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

/* ---- Админка (управление пользователями) ---- */
const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

/* ---- ГИБДД (статистика ДТП) ---- */
const gibddRoutes = require('./routes/gibdd');
app.use('/api/gibdd', gibddRoutes);

/* ---- Услуги (дашборд аналитика) ---- */
try {
  const servicesDashboardRoutes = require('./routes/services');
  app.use('/api/services-dashboard', servicesDashboardRoutes);
  console.log('✅ Services dashboard routes registered');
} catch (err) {
  console.error('❌ Failed to load services dashboard routes:', err.message);
}

/* ---- Справочник услуг ---- */
app.get('/api/services-catalog', requireAuth, async (req, res, next) => {
  try {
    const sql = `
      SELECT id, name, category, description
      FROM services_catalog
      ORDER BY category, name
    `;
    const { rows } = await poolRO.query(sql);
    console.log(`[API] /api/services-catalog -> ${rows.length} services`);
    res.json(rows);
  } catch (err) {
    console.error('[API] Error fetching services catalog:', err);
    next(err);
  }
});

/* ---- Значения услуг (чтение) ---- */
app.get('/api/service-values', requireAuth, async (req, res, next) => {
  try {
    const { year, month, municipality_id } = req.query;

    if (!year || !month || !municipality_id) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Параметры year, month и municipality_id обязательны'
      });
    }

    const sql = `
      SELECT service_id, value_numeric
      FROM service_values
      WHERE period_year = $1
        AND period_month = $2
        AND municipality_id = $3
    `;
    const { rows } = await poolRO.query(sql, [
      parseInt(year),
      parseInt(month),
      parseInt(municipality_id)
    ]);

    console.log(`[API] /api/service-values -> ${rows.length} values for ${year}-${month} municipality ${municipality_id}`);
    res.json(rows);
  } catch (err) {
    console.error('[API] Error fetching service values:', err);
    next(err);
  }
});

/* ---- Сохранение значений услуг ---- */
app.post('/api/service-values/save', requireAuth, requireMunicipalityAccess, async (req, res, next) => {
  try {
    const { municipality_id, period_year, period_month, values } = req.body;

    if (!municipality_id || !period_year || !period_month || !Array.isArray(values)) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Некорректные данные запроса'
      });
    }

    // Check access
    if (req.user.role !== 'admin' && req.user.municipality_id !== municipality_id) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Нет доступа к данному муниципалитету'
      });
    }

    // Build VALUES for batch insert
    const valueStrings = [];
    const params = [];
    let paramIndex = 1;

    values.forEach(v => {
      if (v.service_id && v.value_numeric !== undefined) {
        valueStrings.push(
          `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`
        );
        params.push(
          municipality_id,
          v.service_id,
          period_year,
          period_month,
          v.value_numeric
        );
        paramIndex += 5;
      }
    });

    if (valueStrings.length === 0) {
      return res.json({ saved: 0, message: 'Нет данных для сохранения' });
    }

    const sql = `
      INSERT INTO service_values
        (municipality_id, service_id, period_year, period_month, value_numeric)
      VALUES ${valueStrings.join(', ')}
      ON CONFLICT (municipality_id, service_id, period_year, period_month)
      DO UPDATE SET value_numeric = EXCLUDED.value_numeric
    `;

    console.log(`[API] Saving ${valueStrings.length} service values for municipality ${municipality_id}, period ${period_year}-${period_month}`);
    await pool.query(sql, params);

    res.json({
      saved: valueStrings.length,
      message: 'Данные успешно сохранены'
    });
  } catch (err) {
    console.error('[API] Error saving service values:', err);
    next(err);
  }
});

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

/* ---- Все муниципалитеты (для формы входа, без авторизации) ---- */
app.get('/api/municipalities/all', async (_req, res, next) => {
  try {
    const sql = 'SELECT id, name FROM public.municipalities ORDER BY name';
    logSql('municipalities-all', sql);
    const { rows } = await poolRO.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching municipalities:', err);
    next(err);
  }
});

/* ---- Муниципалитеты (с фильтрацией по правам пользователя) ---- */
app.get('/api/my/municipalities', requireAuth, async (req, res, next) => {
  try {
    const user = req.session.user;

    // Админ видит все муниципалитеты
    if (user.role === 'admin') {
      const sql = 'SELECT id, name FROM public.municipalities ORDER BY name';
      logSql('my-municipalities:admin', sql);
      const { rows } = await poolRO.query(sql);
      console.log(`[API] /api/my/municipalities (admin) -> ${rows.length} rows`);
      return res.json(rows);
    }

    // Оператор видит только свой муниципалитет (1 пользователь = 1 муниципалитет)
    if (!user.municipality_id) {
      console.log(`[API] /api/my/municipalities (operator) -> 0 rows (no municipality assigned)`);
      return res.json([]);
    }

    const sql = `
      SELECT id, name
      FROM public.municipalities
      WHERE id = $1
      ORDER BY name
    `;
    logSql('my-municipalities:operator', sql, [user.municipality_id]);
    const { rows } = await poolRO.query(sql, [user.municipality_id]);
    console.log(`[API] /api/my/municipalities (operator, municipality=${user.municipality_id}) -> ${rows.length} rows`);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching my municipalities:', err);
    next(err);
  }
});

/* ---- Индикаторы (форма 1-ГМУ) ---- */
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
    const { rows } = await poolRO.query(sql);
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
app.get('/api/dashboard/data', requireAuth, requireAdmin, async (req, res, next) => {
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

/** 1) Категории услуг (для выпадающего списка на дашборде) */
app.get('/api/service-categories', async (_req, res, next) => {
  try {
    if (!DB.servicesCatalog) return res.json([]);
    const sql = `
      SELECT COALESCE(category,'') AS category, COUNT(*)::int AS cnt
      FROM ${DB.servicesCatalog}
      GROUP BY 1
      ORDER BY 1
    `;
    logSql('services:categories', sql);
    const { rows } = await poolRO.query(sql);
    res.json(rows);
  } catch (err) { next(err); }
});

/** 2) Справочник услуг — поддержка фильтра ?category=... */
app.get('/api/services', async (req, res, next) => {
  try {
    if (!DB.servicesCatalog) return res.json([]);
    const { category } = req.query;

    let sql = `
      SELECT id, code, name, unit, category
      FROM ${DB.servicesCatalog}
    `;
    const params = [];
    if (category) {
      sql += ` WHERE category = $1 `;
      params.push(category);
    }
    sql += ` ORDER BY COALESCE(category,''), name`;

    logSql('services:list', sql, params);
    const { rows } = await poolRO.query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/** 3) Агрегат по месяцам для выбранной услуги и года */
app.get('/api/services/:id/monthly', async (req, res, next) => {
  try {
    if (!DB.serviceValues) {
      return res.json({
        serviceId: Number(req.params.id),
        year: Number(req.query.year) || new Date().getFullYear(),
        byMonth: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total: 0 })),
      });
    }

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

/** 4) Детализация по муниципалитетам для услуги и года */
app.get('/api/services/:id/details', async (req, res, next) => {
  try {
    if (!DB.serviceValues) {
      return res.json({
        serviceId: Number(req.params.id),
        year: Number(req.query.year) || new Date().getFullYear(),
        rows: [],
      });
    }

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

/** 5) Recent updates for dashboard - combines indicator_values and service_values */
app.get('/api/dashboard/recent-updates', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const municipalityId = req.query.municipality_id ? Number(req.query.municipality_id) : null;
    const serviceId = req.query.service_id ? Number(req.query.service_id) : null;
    const limit = Math.min(Number(req.query.limit) || 50, 200); // Max 200 records

    const updates = [];

    // Fetch indicator_values updates
    if (DB.indicatorValues && DB.indicatorsCatalog) {
      let sql = `
        SELECT
          m.name AS municipality,
          ic.name AS item_name,
          iv.period_year,
          iv.period_month,
          iv.value_numeric AS value,
          iv.updated_at,
          iv.created_at
        FROM ${DB.indicatorValues} iv
        JOIN public.municipalities m ON m.id = iv.municipality_id
        JOIN ${DB.indicatorsCatalog} ic ON ic.id = iv.indicator_id
        WHERE iv.period_year = $1
      `;
      const params = [year];
      let paramIndex = 2;

      if (municipalityId) {
        sql += ` AND iv.municipality_id = $${paramIndex++}`;
        params.push(municipalityId);
      }

      sql += ` ORDER BY iv.updated_at DESC LIMIT $${paramIndex}`;
      params.push(limit);

      logSql('dashboard:recent-indicators', sql, params);
      const { rows } = await poolRO.query(sql, params);

      for (const r of rows) {
        updates.push({
          municipality: r.municipality,
          item_name: r.item_name,
          period_year: Number(r.period_year),
          period_month: Number(r.period_month),
          value: Number(r.value) || 0,
          updated_at: r.updated_at,
          is_new: r.created_at && r.updated_at && new Date(r.created_at).getTime() === new Date(r.updated_at).getTime()
        });
      }
    }

    // Fetch service_values updates
    if (DB.serviceValues && DB.servicesCatalog) {
      let sql = `
        SELECT
          m.name AS municipality,
          sc.name AS item_name,
          sv.period_year,
          sv.period_month,
          sv.value_numeric AS value,
          sv.updated_at,
          sv.created_at
        FROM ${DB.serviceValues} sv
        JOIN public.municipalities m ON m.id = sv.municipality_id
        JOIN ${DB.servicesCatalog} sc ON sc.id = sv.service_id
        WHERE sv.period_year = $1
      `;
      const params = [year];
      let paramIndex = 2;

      if (municipalityId) {
        sql += ` AND sv.municipality_id = $${paramIndex++}`;
        params.push(municipalityId);
      }

      if (serviceId) {
        sql += ` AND sv.service_id = $${paramIndex++}`;
        params.push(serviceId);
      }

      sql += ` ORDER BY sv.updated_at DESC LIMIT $${paramIndex}`;
      params.push(limit);

      logSql('dashboard:recent-services', sql, params);
      const { rows } = await poolRO.query(sql, params);

      for (const r of rows) {
        updates.push({
          municipality: r.municipality,
          item_name: r.item_name,
          period_year: Number(r.period_year),
          period_month: Number(r.period_month),
          value: Number(r.value) || 0,
          updated_at: r.updated_at,
          is_new: r.created_at && r.updated_at && new Date(r.created_at).getTime() === new Date(r.updated_at).getTime()
        });
      }
    }

    // Sort all updates by updated_at DESC and limit
    updates.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    const result = updates.slice(0, limit);

    res.json(result);
  } catch (err) {
    console.error('Error fetching recent updates:', err);
    next(err);
  }
});

/* ---------- Импорт исторических данных (JSON) ---------- */
function requireImportAuth(req, res, next) {
  if (process.env.IMPORT_ENABLED !== 'true') return res.status(403).json({ error: 'Import disabled' });
  const token = req.headers['x-import-token'];
  if (!token || token !== process.env.IMPORT_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

/** 6) Импорт справочника услуг (UPSERT по code) */
app.post('/api/import/services-catalog', requireImportAuth, async (req, res, next) => {
  try {
    if (!DB.servicesCatalog) return res.status(500).json({ error: 'services_catalog not found' });
    const items = Array.isArray(req.body) ? req.body : [];
    if (items.length === 0) return res.json({ inserted: 0, updated: 0 });

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
      SET name     = EXCLUDED.name,
          unit     = COALESCE(NULLIF(EXCLUDED.unit,''),     ${DB.servicesCatalog}.unit),
          category = COALESCE(NULLIF(EXCLUDED.category,''), ${DB.servicesCatalog}.category)
      RETURNING xmax <> 0 AS updated;
    `;

    logSql('import:services-catalog', sql, params);
    const { rows } = await poolRO.query(sql, params);
    const updated = rows.filter(r => r.updated).length;
    res.json({ inserted: rows.length - updated, updated });
  } catch (err) { next(err); }
});

/** 7) Импорт значений из Excel-файла (запись в indicator_values для дашборда) */
const upload = multer({ dest: 'uploads/' });

app.post('/api/import/service-values', requireAuth, requireMunicipalityAccess, upload.single('file'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    if (!req.file) {
      client.release();
      return res.status(400).json({ error: 'Файл не загружен' });
    }

    const { municipality_id, period_year, period_month, service_id, service_name } = req.body;

    if (!municipality_id || !period_year || !period_month) {
      client.release();
      return res.status(400).json({ error: 'Отсутствуют параметры: municipality_id, period_year, period_month' });
    }

    if (!service_id) {
      client.release();
      return res.status(400).json({ error: 'Не указана услуга (service_id)' });
    }

    console.log(`[IMPORT] Processing file: ${req.file.originalname} for municipality ${municipality_id}, service ${service_name || service_id}`);

    // Парсинг Excel файла
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      client.release();
      return res.status(400).json({ error: 'Excel файл пуст' });
    }

    // Получаем каталог показателей для сопоставления
    const indicatorsRes = await poolRO.query(`
      SELECT id, code, name
      FROM ${DB.indicatorsCatalog}
      WHERE form_code = 'form_1_gmu'
    `);
    const indicatorsByCode = new Map(indicatorsRes.rows.map(r => [r.code.trim().toLowerCase(), r]));
    const indicatorsByName = new Map(indicatorsRes.rows.map(r => [r.name.trim().toLowerCase(), r]));

    const vals = [];
    const params = [];
    let p = 1;
    let rowCount = 0;

    // Парсим строки Excel
    // Структура: A=Код | B=N п/п | C=Наименование | D=Ед.изм. | E=Значение (предположительно)
    let firstRows = [];
    worksheet.eachRow((row, rowNumber) => {
      // Логируем первые 5 строк для отладки (все колонки A-E)
      if (rowNumber <= 5) {
        const cellA = row.getCell(1).value;
        const cellB = row.getCell(2).value;
        const cellC = row.getCell(3).value;
        const cellD = row.getCell(4).value;
        const cellE = row.getCell(5).value;
        firstRows.push(`Row ${rowNumber}: A="${cellA}" | B="${cellB}" | C="${cellC}" | D="${cellD}" | E="${cellE}"`);
      }

      // Пропускаем первые 2 строки (заголовок формы и заголовки таблицы)
      if (rowNumber <= 2) return;

      const cellA = row.getCell(1).value; // Код показателя
      const cellC = row.getCell(3).value; // Наименование показателя
      const cellE = row.getCell(5).value; // Значение (предположительно в колонке E)

      if (!cellC && !cellA) return;

      // Ищем значение в разных колонках (E, F, G...)
      let value = null;
      for (let col = 5; col <= 10; col++) {
        const cellValue = row.getCell(col).value;
        if (cellValue != null && !isNaN(Number(cellValue))) {
          value = Number(cellValue);
          break;
        }
      }

      if (value === null) return;

      // Ищем показатель по коду (колонка A) или названию (колонка C)
      const keyByCode = cellA ? String(cellA).trim().toLowerCase() : null;
      const keyByName = cellC ? String(cellC).trim().toLowerCase() : null;

      let indicator = null;
      if (keyByCode) indicator = indicatorsByCode.get(keyByCode);
      if (!indicator && keyByName) indicator = indicatorsByName.get(keyByName);

      if (indicator) {
        vals.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
        params.push(municipality_id, service_id, indicator.id, period_year, period_month, value);
        rowCount++;
      }
    });

    console.log(`[IMPORT] First rows from Excel:\n${firstRows.join('\n')}`);
    console.log(`[IMPORT] Available indicators (first 5): ${Array.from(indicatorsByName.keys()).slice(0, 5).join(', ')}`);

    if (vals.length === 0) {
      client.release();
      return res.json({ upserted: 0, message: 'Не найдено совпадений с показателями' });
    }

    // Записываем в indicator_values (с привязкой к услуге через service_id)
    const sql = `
      INSERT INTO ${DB.indicatorValues}
        (municipality_id, service_id, indicator_id, period_year, period_month, value_numeric)
      VALUES ${vals.join(', ')}
      ON CONFLICT (municipality_id, indicator_id, period_year, period_month)
      DO UPDATE SET
        value_numeric = EXCLUDED.value_numeric,
        service_id = EXCLUDED.service_id,
        updated_at = CURRENT_TIMESTAMP
    `;
    logSql('import:indicator-values', sql, params);

    await client.query('BEGIN');
    const insertResult = await client.query(sql, params);
    console.log(`[IMPORT] Insert/Update result: ${insertResult.rowCount} rows affected`);
    await client.query('COMMIT');
    client.release();

    console.log(`[IMPORT] Successfully imported ${rowCount} rows from ${req.file.originalname}`);
    res.json({ upserted: vals.length, message: `Импортировано ${rowCount} строк для услуги ${service_name || service_id}` });

  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    client.release();
    console.error('[IMPORT] Error:', err);
    next(err);
  }
});

/** 8) Экспорт отчёта в Excel */
app.post('/api/reports/export', requireAuth, requireMunicipalityAccess, async (req, res, next) => {
  try {
    const { municipality_id, period_year, period_month } = req.body;

    if (!municipality_id || !period_year || !period_month) {
      return res.status(400).json({ error: 'Отсутствуют параметры: municipality_id, period_year, period_month' });
    }

    // Получаем название муниципалитета
    const muniRes = await poolRO.query(
      'SELECT name FROM public.municipalities WHERE id = $1',
      [municipality_id]
    );
    const muniName = muniRes.rows[0]?.name || 'Неизвестно';

    // Получаем показатели и их значения
    let data = [];
    if (DB.indicatorsCatalog && DB.indicatorValues) {
      const sql = `
        SELECT
          ic.code,
          ic.name,
          ic.unit,
          COALESCE(iv.value_numeric, 0) as value
        FROM ${DB.indicatorsCatalog} ic
        LEFT JOIN ${DB.indicatorValues} iv
          ON iv.indicator_id = ic.id
          AND iv.municipality_id = $1
          AND iv.period_year = $2
          AND iv.period_month = $3
        WHERE ic.form_code = 'form_1_gmu'
        ORDER BY ic.sort_order NULLS LAST, ic.id
      `;
      const result = await poolRO.query(sql, [municipality_id, period_year, period_month]);
      data = result.rows;
    }

    if (data.length === 0) {
      return res.status(404).json({ error: 'Нет данных для экспорта' });
    }

    // Создаем Excel файл
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Отчет 1-ГМУ');

    // Заголовок
    worksheet.mergeCells('A1:D1');
    worksheet.getCell('A1').value = `Форма 1-ГМУ - ${muniName}`;
    worksheet.getCell('A1').font = { bold: true, size: 14 };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A2:D2');
    worksheet.getCell('A2').value = `Период: ${String(period_month).padStart(2, '0')}.${period_year}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    // Заголовки таблицы
    worksheet.getRow(4).values = ['№', 'Показатель', 'Единица измерения', 'Значение'];
    worksheet.getRow(4).font = { bold: true };
    worksheet.getRow(4).alignment = { horizontal: 'center' };

    // Данные
    data.forEach((row, idx) => {
      worksheet.addRow([
        idx + 1,
        row.name,
        row.unit,
        row.value
      ]);
    });

    // Стили столбцов
    worksheet.getColumn(1).width = 8;
    worksheet.getColumn(2).width = 50;
    worksheet.getColumn(3).width = 20;
    worksheet.getColumn(4).width = 15;

    // Границы таблицы
    const borderStyle = { style: 'thin', color: { argb: 'FF000000' } };
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber >= 4) {
        row.eachCell((cell) => {
          cell.border = {
            top: borderStyle,
            left: borderStyle,
            bottom: borderStyle,
            right: borderStyle
          };
        });
      }
    });

    // Отправка файла
    const fileName = `Report_${muniName.replace(/\s+/g, '_')}_${period_year}_${String(period_month).padStart(2, '0')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('Error exporting report:', err);
    next(err);
  }
});

/** 9) Сохранение отчёта (значения показателей из формы) */
app.post('/api/reports/save', requireAuth, requireMunicipalityAccess, async (req, res, next) => {
  const client = await pool.connect();
  try {
    console.log('[SAVE REPORT] Incoming request body:', JSON.stringify(req.body, null, 2));
    console.log('[SAVE REPORT] DB.indicatorValues:', DB.indicatorValues);

    if (!DB.indicatorValues) {
      client.release();
      return res.status(500).json({ error: 'indicator_values table not found. Run: npm run db:init' });
    }

    const { municipality_id, service_id, period_year, period_month, values } = req.body;

    // Валидация входных данных
    if (!municipality_id || !period_year || !period_month) {
      client.release();
      return res.status(400).json({ error: 'Отсутствуют обязательные поля: municipality_id, period_year, period_month' });
    }

    if (!Array.isArray(values) || values.length === 0) {
      client.release();
      return res.status(400).json({ error: 'Массив values пуст или отсутствует' });
    }

    console.log('[SAVE REPORT] Validation passed. Processing', values.length, 'values');

    const vals = [];
    const params = [];
    let p = 1;

    for (const item of values) {
      const indicatorId = Number(item.indicator_id);
      const value = item.value == null ? null : Number(item.value);

      if (!indicatorId) continue;

      vals.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(municipality_id, indicatorId, period_year, period_month, value);
    }

    if (vals.length === 0) {
      client.release();
      return res.status(400).json({ error: 'Нет валидных данных для сохранения' });
    }

    const sql = `
      INSERT INTO ${DB.indicatorValues}
        (municipality_id, indicator_id, period_year, period_month, value_numeric)
      VALUES ${vals.join(', ')}
      ON CONFLICT (municipality_id, indicator_id, period_year, period_month)
      DO UPDATE SET value_numeric = EXCLUDED.value_numeric
    `;

    logSql('reports:save', sql, params);

    await client.query('BEGIN');
    console.log('[SAVE REPORT] Transaction started');

    const result = await client.query(sql, params);
    console.log('[SAVE REPORT] Insert/Update completed. Rows affected:', result.rowCount);

    await client.query('COMMIT');
    console.log('[SAVE REPORT] Transaction committed');

    client.release();

    res.json({
      success: true,
      saved: vals.length,
      message: `Сохранено ${vals.length} значений показателей`
    });
  } catch (err) {
    console.error('[SAVE REPORT] Error:', err.message);
    console.error('[SAVE REPORT] Stack:', err.stack);
    console.error('[SAVE REPORT] SQL Error Detail:', err.detail);
    console.error('[SAVE REPORT] SQL Error Hint:', err.hint);

    try { await client.query('ROLLBACK'); } catch (rollbackErr) {
      console.error('[SAVE REPORT] Rollback error:', rollbackErr);
    }
    client.release();

    res.status(500).json({
      error: 'Ошибка при сохранении отчета',
      detail: process.env.NODE_ENV === 'production' ? undefined : err.message
    });
  }
});

/* ==================== Страницы ==================== */
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/form', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'form.html')));
app.get('/gibdd', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'gibdd.html')));
app.get('/dashboard', requireAuth, requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/admin', requireAuth, requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

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
      db_mapping: {
        indicatorsCatalog: DB.indicatorsCatalog,
        indicatorValues: DB.indicatorValues,
        servicesCatalog: DB.servicesCatalog,
        serviceValues: DB.serviceValues,
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ status: 'unhealthy', timestamp: new Date().toISOString(), error: error.message });
  }
});

/* ==================== Debug endpoint (only for dev) ==================== */
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/routes', (_req, res) => {
    const routes = [];
    app._router.stack.forEach((middleware) => {
      if (middleware.route) {
        const methods = Object.keys(middleware.route.methods).join(',').toUpperCase();
        routes.push({ method: methods, path: middleware.route.path });
      }
    });
    res.json({ routes, db_mapping: DB });
  });
}

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
