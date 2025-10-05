// routes/services.js
'use strict';

const express = require('express');
const router = express.Router();
const { pool, poolRO } = require('../config/database');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/services-dashboard/data
 * Dashboard analytics for services
 * Returns aggregated KPIs and data for charts
 */
router.get('/data', requireAuth, async (req, res, next) => {
  try {
    const { year, month, municipality_id } = req.query;

    if (!year) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Параметр year обязателен'
      });
    }

    const currentYear = parseInt(year);
    const prevYear = currentYear - 1;

    // Проверяем существование таблиц
    try {
      await poolRO.query(`SELECT 1 FROM service_values LIMIT 1`);
    } catch (err) {
      // Таблица не существует или пуста - возвращаем пустые данные
      console.log('[Services Dashboard] service_values table not available:', err.message);
      return res.json({
        kpi: {
          total_services: 0,
          prev_total_services: 0,
          change_percent: null
        },
        monthly_dynamics: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total: 0 })),
        top_services: [],
        categories: [],
        top_municipalities: []
      });
    }

    // Build base query filters
    let whereConditions = ['sv.period_year = $1'];
    let params = [currentYear];
    let paramIndex = 2;

    if (month) {
      whereConditions.push(`sv.period_month = $${paramIndex}`);
      params.push(parseInt(month));
      paramIndex++;
    }

    if (municipality_id) {
      whereConditions.push(`sv.municipality_id = $${paramIndex}`);
      params.push(parseInt(municipality_id));
      paramIndex++;
    }

    const whereClause = whereConditions.join(' AND ');

    // 1. Total services count (KPI)
    const totalQuery = `
      SELECT COALESCE(SUM(sv.value_numeric), 0) as total
      FROM service_values sv
      WHERE ${whereClause}
    `;
    const { rows: totalRows } = await poolRO.query(totalQuery, params);
    const totalServices = parseInt(totalRows[0].total) || 0;

    // Previous year for comparison
    const prevParams = [prevYear, ...params.slice(1)];
    const { rows: prevTotalRows } = await poolRO.query(totalQuery.replace('$1', `$1`), prevParams);
    const prevTotalServices = parseInt(prevTotalRows[0].total) || 0;

    // 2. Monthly dynamics (for line chart)
    const monthlyQuery = `
      SELECT
        sv.period_month as month,
        COALESCE(SUM(sv.value_numeric), 0) as total
      FROM service_values sv
      WHERE sv.period_year = $1
      ${municipality_id ? `AND sv.municipality_id = $${params.indexOf(parseInt(municipality_id)) + 1}` : ''}
      GROUP BY sv.period_month
      ORDER BY sv.period_month
    `;
    const monthlyParams = municipality_id ? [currentYear, parseInt(municipality_id)] : [currentYear];
    const { rows: monthlyRows } = await poolRO.query(monthlyQuery, monthlyParams);

    const monthlyData = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const found = monthlyRows.find(r => parseInt(r.month) === m);
      return {
        month: m,
        total: found ? parseInt(found.total) : 0
      };
    });

    // 3. Top 10 services (for bar chart)
    const topServicesQuery = `
      SELECT
        sc.id,
        sc.name,
        sc.category,
        COALESCE(SUM(sv.value_numeric), 0) as total
      FROM services_catalog sc
      INNER JOIN service_values sv ON sv.service_id = sc.id
      WHERE ${whereClause}
      GROUP BY sc.id, sc.name, sc.category
      ORDER BY total DESC
      LIMIT 10
    `;
    const { rows: topServices } = await poolRO.query(topServicesQuery, params);

    // 4. Distribution by categories (for pie chart)
    const categoriesQuery = `
      SELECT
        COALESCE(sc.category, 'Без категории') as category,
        COALESCE(SUM(sv.value_numeric), 0) as total
      FROM services_catalog sc
      INNER JOIN service_values sv ON sv.service_id = sc.id
      WHERE ${whereClause}
      GROUP BY sc.category
      ORDER BY total DESC
    `;
    const { rows: categories } = await poolRO.query(categoriesQuery, params);

    // 5. Top municipalities (for horizontal bar chart)
    const { rows: topMunicipalities } = await poolRO.query(
      `
      SELECT
        m.id,
        m.name,
        COALESCE(SUM(sv.value_numeric), 0) as total
      FROM municipalities m
      LEFT JOIN service_values sv ON sv.municipality_id = m.id
        AND sv.period_year = $1
        ${month ? `AND sv.period_month = $2` : ''}
      ${municipality_id ? `WHERE m.id = ${municipality_id}` : ''}
      GROUP BY m.id, m.name
      ORDER BY total DESC
      LIMIT 10
      `,
      month ? [currentYear, parseInt(month)] : [currentYear]
    );

    // Return aggregated data
    res.json({
      kpi: {
        total_services: totalServices,
        prev_total_services: prevTotalServices,
        change_percent: prevTotalServices > 0
          ? ((totalServices - prevTotalServices) / prevTotalServices * 100).toFixed(1)
          : null
      },
      monthly_dynamics: monthlyData,
      top_services: topServices.map(s => ({
        id: s.id,
        name: s.name,
        category: s.category,
        total: parseInt(s.total)
      })),
      categories: categories.map(c => ({
        category: c.category,
        total: parseInt(c.total)
      })),
      top_municipalities: topMunicipalities.map(m => ({
        id: m.id,
        name: m.name,
        total: parseInt(m.total)
      }))
    });

  } catch (err) {
    console.error('[Services Dashboard] Error:', err);

    // Возвращаем пустые данные вместо ошибки при проблемах с БД
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
      return res.json({
        kpi: {
          total_services: 0,
          prev_total_services: 0,
          change_percent: null
        },
        monthly_dynamics: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total: 0 })),
        top_services: [],
        categories: [],
        top_municipalities: []
      });
    }

    next(err);
  }
});

module.exports = router;
