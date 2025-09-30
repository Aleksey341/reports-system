const express = require('express');
const { query } = require('../config/database');

const router = express.Router();

// Получить список муниципалитетов
router.get('/municipalities', async (req, res) => {
    try {
        const result = await query(
            'SELECT id, name FROM municipalities WHERE is_active = true ORDER BY name',
            [],
            true // readonly
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching municipalities:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения списка муниципалитетов'
        });
    }
});

// Получить шаблон показателей для формы
router.get('/indicators/:reportType?', async (req, res) => {
    try {
        const reportType = req.params.reportType || 'form_1_gmu';

        const result = await query(
            `SELECT row_id, serial_number, description, unit
             FROM indicators_template
             WHERE report_type = $1 AND is_active = true
             ORDER BY serial_number`,
            [reportType],
            true // readonly
        );

        res.json({
            success: true,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching indicators:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения шаблона показателей'
        });
    }
});

// Проверить существование отчета
router.get('/check-report', async (req, res) => {
    try {
        const { month, municipality, reportType = 'form_1_gmu' } = req.query;

        if (!month || !municipality) {
            return res.status(400).json({
                success: false,
                error: 'Необходимо указать месяц и муниципалитет'
            });
        }

        const result = await query(
            `SELECT id, created_at, status
             FROM reports
             WHERE report_month = $1 AND municipality_name = $2 AND report_type = $3`,
            [month, municipality, reportType],
            true // readonly
        );

        res.json({
            success: true,
            exists: result.rows.length > 0,
            data: result.rows[0] || null
        });
    } catch (error) {
        console.error('Error checking report:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка проверки отчета'
        });
    }
});

// Получить статистику
router.get('/stats', async (req, res) => {
    try {
        const [reportsCount, municipalitiesCount, lastReports] = await Promise.all([
            // Общее количество отчетов
            query('SELECT COUNT(*) as count FROM reports', [], true),

            // Количество муниципалитетов
            query('SELECT COUNT(*) as count FROM municipalities WHERE is_active = true', [], true),

            // Последние 5 отчетов
            query(`
                SELECT r.municipality_name, r.report_month, r.created_at,
                       COUNT(rv.id) as values_count
                FROM reports r
                LEFT JOIN report_values rv ON r.id = rv.report_id
                GROUP BY r.id, r.municipality_name, r.report_month, r.created_at
                ORDER BY r.created_at DESC
                LIMIT 5
            `, [], true)
        ]);

        res.json({
            success: true,
            data: {
                reportsCount: parseInt(reportsCount.rows[0].count),
                municipalitiesCount: parseInt(municipalitiesCount.rows[0].count),
                lastReports: lastReports.rows
            }
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения статистики'
        });
    }
});

// Поиск отчетов
router.get('/search', async (req, res) => {
    try {
        const {
            month,
            municipality,
            dateFrom,
            dateTo,
            limit = 50,
            offset = 0
        } = req.query;

        let queryText = `
            SELECT r.id, r.report_month, r.municipality_name, r.status, r.created_at,
                   COUNT(rv.id) as values_count,
                   SUM(rv.value) as total_value
            FROM reports r
            LEFT JOIN report_values rv ON r.id = rv.report_id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (month) {
            queryText += ` AND r.report_month = $${paramIndex}`;
            params.push(month);
            paramIndex++;
        }

        if (municipality) {
            queryText += ` AND r.municipality_name ILIKE $${paramIndex}`;
            params.push(`%${municipality}%`);
            paramIndex++;
        }

        if (dateFrom) {
            queryText += ` AND r.created_at >= $${paramIndex}`;
            params.push(dateFrom);
            paramIndex++;
        }

        if (dateTo) {
            queryText += ` AND r.created_at <= $${paramIndex}`;
            params.push(dateTo);
            paramIndex++;
        }

        queryText += `
            GROUP BY r.id, r.report_month, r.municipality_name, r.status, r.created_at
            ORDER BY r.created_at DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        params.push(parseInt(limit), parseInt(offset));

        const result = await query(queryText, params, true);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: result.rows.length === parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Error searching reports:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка поиска отчетов'
        });
    }
});

module.exports = router;