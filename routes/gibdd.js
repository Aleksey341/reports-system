// routes/gibdd.js
'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const ExcelJS = require('exceljs');
const { pool } = require('../config/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Только Excel файлы (.xlsx, .xls)'));
    }
  }
});

/**
 * POST /api/gibdd/upload
 * Upload GIBDD Excel file
 * Admin only
 */
router.post('/upload', requireAuth, requireAdmin, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Файл не загружен'
      });
    }

    console.log('[GIBDD] Processing file:', req.file.originalname);

    // Parse Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Excel файл не содержит листов'
      });
    }

    // Extract period from sheet name (e.g., "Август 2025" -> "2025-08-01")
    const period = parsePeriodFromSheetName(sheet.name);
    if (!period) {
      return res.status(400).json({
        error: 'bad_request',
        message: `Не удалось определить период из названия листа: "${sheet.name}". Ожидается формат "Месяц YYYY"`
      });
    }

    console.log('[GIBDD] Period:', period);

    // Get municipalities mapping
    const { rows: municipalities } = await pool.query('SELECT id, name FROM municipalities');
    const municipalityMap = {};
    municipalities.forEach(m => {
      municipalityMap[normalizeMunicipalityName(m.name)] = m.id;
    });

    const results = {
      success: 0,
      errors: [],
      skipped: []
    };

    // Process each row (skip header row 1, start from row 2)
    for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
      const row = sheet.getRow(rowNum);
      const territoryName = row.getCell(1).value;

      if (!territoryName || territoryName.toString().trim() === '') {
        continue;
      }

      // Skip "Липецкая область" summary row
      if (territoryName.toString().toLowerCase().includes('липецкая область')) {
        results.skipped.push(`Пропущена итоговая строка: ${territoryName}`);
        continue;
      }

      // Find municipality ID
      const normalizedName = normalizeMunicipalityName(territoryName);
      const municipalityId = municipalityMap[normalizedName];

      if (!municipalityId) {
        results.errors.push(`Муниципалитет не найден: ${territoryName}`);
        continue;
      }

      try {
        // Extract data from row
        const data = {
          municipality_id: municipalityId,
          period,
          // Columns: B-D (2-4): ДТП всего
          dtp_total: getIntValue(row, 2),
          dtp_total_dead: getIntValue(row, 3),
          dtp_total_injured: getIntValue(row, 4),
          // Columns: E-G (5-7): Пешеходы
          dtp_pedestrians: getIntValue(row, 5),
          dtp_pedestrians_dead: getIntValue(row, 6),
          dtp_pedestrians_injured: getIntValue(row, 7),
          // Columns: H-J (8-10): Дети до 16
          dtp_children_16: getIntValue(row, 8),
          dtp_children_16_dead: getIntValue(row, 9),
          dtp_children_16_injured: getIntValue(row, 10),
          // Columns: K-M (11-13): Нарушения водителей
          dtp_drivers_violation: getIntValue(row, 11),
          dtp_drivers_violation_dead: getIntValue(row, 12),
          dtp_drivers_violation_injured: getIntValue(row, 13),
          // Columns: N-P (14-16): Встречная полоса
          dtp_oncoming_lane: getIntValue(row, 14),
          dtp_oncoming_lane_dead: getIntValue(row, 15),
          dtp_oncoming_lane_injured: getIntValue(row, 16),
          // Columns: Q-S (17-19): Дети до 18
          dtp_children_18: getIntValue(row, 17),
          dtp_children_18_dead: getIntValue(row, 18),
          dtp_children_18_injured: getIntValue(row, 19),
          // Columns: T-V (20-22): В населенных пунктах
          dtp_in_settlements: getIntValue(row, 20),
          dtp_in_settlements_dead: getIntValue(row, 21),
          dtp_in_settlements_injured: getIntValue(row, 22),
          // Columns: W-Y (23-25): На автодорогах
          dtp_on_highways: getIntValue(row, 23),
          dtp_on_highways_dead: getIntValue(row, 24),
          dtp_on_highways_injured: getIntValue(row, 25),
          // Columns: Z-\ (26-28): Ж/д переезды
          dtp_railway_crossings: getIntValue(row, 26),
          dtp_railway_crossings_dead: getIntValue(row, 27),
          dtp_railway_crossings_injured: getIntValue(row, 28),
          // Columns: ]-_ (29-31): Вне населенных пунктов
          dtp_outside_settlements: getIntValue(row, 29),
          dtp_outside_settlements_dead: getIntValue(row, 30),
          dtp_outside_settlements_injured: getIntValue(row, 31),
          // Columns: `-b (32-34): Скрывшиеся ТС
          dtp_hit_and_run: getIntValue(row, 32),
          dtp_hit_and_run_dead: getIntValue(row, 33),
          dtp_hit_and_run_injured: getIntValue(row, 34),
          // Columns: c-e (35-37): Скрывшийся водитель
          dtp_driver_fled: getIntValue(row, 35),
          dtp_driver_fled_dead: getIntValue(row, 36),
          dtp_driver_fled_injured: getIntValue(row, 37),
          // Columns: f-h (38-40): Неустановленные ТС
          dtp_unknown_vehicle: getIntValue(row, 38),
          dtp_unknown_vehicle_dead: getIntValue(row, 39),
          dtp_unknown_vehicle_injured: getIntValue(row, 40),
          // Columns: i-k (41-43): Фотофиксация
          dtp_photo_radar: getIntValue(row, 41),
          dtp_photo_radar_dead: getIntValue(row, 42),
          dtp_photo_radar_injured: getIntValue(row, 43)
        };

        // Insert or update
        await upsertGibddData(data);
        results.success++;

      } catch (err) {
        console.error(`[GIBDD] Error processing row ${rowNum}:`, err);
        results.errors.push(`Строка ${rowNum} (${territoryName}): ${err.message}`);
      }
    }

    console.log('[GIBDD] Import complete:', results);

    return res.json({
      success: true,
      period,
      imported: results.success,
      errors: results.errors,
      skipped: results.skipped,
      message: `Импортировано записей: ${results.success}`
    });

  } catch (err) {
    console.error('[GIBDD] Upload error:', err);
    next(err);
  }
});

/**
 * GET /api/gibdd/data
 * Get GIBDD data for a specific period
 */
router.get('/data', requireAuth, async (req, res, next) => {
  try {
    const { period } = req.query;

    if (!period) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Параметр period обязателен (формат: YYYY-MM)'
      });
    }

    const periodDate = `${period}-01`;

    const { rows } = await pool.query(`
      SELECT
        g.*,
        m.name as municipality_name
      FROM gibdd_data g
      LEFT JOIN municipalities m ON m.id = g.municipality_id
      WHERE g.period = $1
      ORDER BY m.name
    `, [periodDate]);

    return res.json(rows);

  } catch (err) {
    console.error('[GIBDD] Get data error:', err);
    next(err);
  }
});

/**
 * GET /api/gibdd/periods
 * Get list of available periods
 */
router.get('/periods', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT
        TO_CHAR(period, 'YYYY-MM') as period,
        TO_CHAR(period, 'Month YYYY') as period_name
      FROM gibdd_data
      ORDER BY period DESC
    `);

    return res.json(rows);

  } catch (err) {
    console.error('[GIBDD] Get periods error:', err);
    next(err);
  }
});

/* ========== Helper Functions ========== */

function parsePeriodFromSheetName(sheetName) {
  // Expected format: "Август 2025" or similar
  const months = {
    'январь': '01', 'февраль': '02', 'март': '03', 'апрель': '04',
    'май': '05', 'июнь': '06', 'июль': '07', 'август': '08',
    'сентябрь': '09', 'октябрь': '10', 'ноябрь': '11', 'декабрь': '12'
  };

  const parts = sheetName.toLowerCase().trim().split(/\s+/);

  for (const part of parts) {
    if (months[part]) {
      const yearPart = parts.find(p => /^\d{4}$/.test(p));
      if (yearPart) {
        return `${yearPart}-${months[part]}-01`;
      }
    }
  }

  return null;
}

function normalizeMunicipalityName(name) {
  return name.toString()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^г\.\s*/i, '')
    .replace(/\s*(муниципальный\s+)?(район|округ)$/i, '');
}

function getIntValue(row, colNum) {
  const cell = row.getCell(colNum);
  const value = cell.value;

  if (value === null || value === undefined || value === '') {
    return 0;
  }

  // Handle formula results
  if (typeof value === 'object' && value.result !== undefined) {
    return parseInt(value.result) || 0;
  }

  return parseInt(value) || 0;
}

async function upsertGibddData(data) {
  const fields = Object.keys(data).filter(k => k !== 'municipality_id' && k !== 'period');
  const values = fields.map(f => data[f]);

  const setClause = fields.map((f, i) => `${f} = $${i + 3}`).join(', ');
  const insertFields = ['municipality_id', 'period', ...fields].join(', ');
  const insertPlaceholders = Array.from({ length: fields.length + 2 }, (_, i) => `$${i + 1}`).join(', ');

  const query = `
    INSERT INTO gibdd_data (${insertFields})
    VALUES (${insertPlaceholders})
    ON CONFLICT (municipality_id, period)
    DO UPDATE SET
      ${setClause},
      updated_at = NOW()
  `;

  await pool.query(query, [data.municipality_id, data.period, ...values]);
}

module.exports = router;
