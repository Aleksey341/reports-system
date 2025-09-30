const express = require('express');
const { query, transaction } = require('../config/database');

const router = express.Router();

// Создать новый отчет
router.post('/', async (req, res) => {
    try {
        const {
            month,
            municipality,
            values,
            meta = {}
        } = req.body;

        // Валидация входных данных
        if (!month || !municipality || !values) {
            return res.status(400).json({
                success: false,
                error: 'Необходимы поля: month, municipality, values'
            });
        }

        // Проверяем формат месяца (YYYY-MM)
        const monthRegex = /^\d{4}-\d{2}$/;
        if (!monthRegex.test(month)) {
            return res.status(400).json({
                success: false,
                error: 'Неверный формат месяца. Используйте YYYY-MM'
            });
        }

        const clientIP = req.ip || req.connection.remoteAddress;

        // Выполняем операцию в транзакции
        const result = await transaction(async (client) => {
            // Проверяем, существует ли уже отчет
            const existingReport = await client.query(
                'SELECT id FROM reports WHERE report_month = $1 AND municipality_name = $2 AND report_type = $3',
                [month, municipality, 'form_1_gmu']
            );

            let reportId;

            if (existingReport.rows.length > 0) {
                // Обновляем существующий отчет
                reportId = existingReport.rows[0].id;

                await client.query(
                    'UPDATE reports SET updated_at = CURRENT_TIMESTAMP, user_ip = $1 WHERE id = $2',
                    [clientIP, reportId]
                );

                // Удаляем старые значения
                await client.query(
                    'DELETE FROM report_values WHERE report_id = $1',
                    [reportId]
                );
            } else {
                // Создаем новый отчет
                const newReport = await client.query(
                    `INSERT INTO reports (report_month, municipality_name, meta_title, user_ip)
                     VALUES ($1, $2, $3, $4)
                     RETURNING id`,
                    [month, municipality, meta.title || 'Форма 1-ГМУ', clientIP]
                );

                reportId = newReport.rows[0].id;
            }

            // Получаем шаблон показателей
            const indicators = await client.query(
                'SELECT row_id, serial_number, description, unit FROM indicators_template WHERE report_type = $1',
                ['form_1_gmu']
            );

            const indicatorMap = new Map();
            indicators.rows.forEach(ind => {
                indicatorMap.set(ind.serial_number.toString(), ind);
            });

            // Добавляем новые значения
            const insertPromises = [];
            for (const [serialNum, valueData] of Object.entries(values)) {
                const indicator = indicatorMap.get(serialNum);
                if (indicator && valueData.value !== undefined && valueData.value !== '') {
                    insertPromises.push(
                        client.query(
                            `INSERT INTO report_values
                             (report_id, row_id, serial_number, indicator_description, unit, value)
                             VALUES ($1, $2, $3, $4, $5, $6)`,
                            [
                                reportId,
                                indicator.row_id,
                                indicator.serial_number,
                                indicator.description,
                                indicator.unit,
                                parseInt(valueData.value) || 0
                            ]
                        )
                    );
                }
            }

            await Promise.all(insertPromises);

            return { reportId };
        });

        res.json({
            success: true,
            message: 'Отчет успешно сохранен',
            data: { reportId: result.reportId }
        });

    } catch (error) {
        console.error('Error saving report:', error);

        if (error.code === '23505') { // Unique constraint violation
            res.status(409).json({
                success: false,
                error: 'Отчет за данный период уже существует'
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Ошибка сохранения отчета'
            });
        }
    }
});

// Получить отчет по ID
router.get('/:id', async (req, res) => {
    try {
        const reportId = parseInt(req.params.id);

        if (isNaN(reportId)) {
            return res.status(400).json({
                success: false,
                error: 'Неверный ID отчета'
            });
        }

        // Получаем основные данные отчета
        const reportResult = await query(
            'SELECT * FROM reports WHERE id = $1',
            [reportId],
            true
        );

        if (reportResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Отчет не найден'
            });
        }

        // Получаем значения показателей
        const valuesResult = await query(
            `SELECT row_id, serial_number, indicator_description, unit, value
             FROM report_values
             WHERE report_id = $1
             ORDER BY serial_number`,
            [reportId],
            true
        );

        const report = reportResult.rows[0];
        report.values = valuesResult.rows;

        res.json({
            success: true,
            data: report
        });

    } catch (error) {
        console.error('Error fetching report:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения отчета'
        });
    }
});

// Удалить отчет
router.delete('/:id', async (req, res) => {
    try {
        const reportId = parseInt(req.params.id);

        if (isNaN(reportId)) {
            return res.status(400).json({
                success: false,
                error: 'Неверный ID отчета'
            });
        }

        const result = await query(
            'DELETE FROM reports WHERE id = $1 RETURNING id',
            [reportId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Отчет не найден'
            });
        }

        res.json({
            success: true,
            message: 'Отчет успешно удален'
        });

    } catch (error) {
        console.error('Error deleting report:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка удаления отчета'
        });
    }
});

// Получить список отчетов с фильтрацией
router.get('/', async (req, res) => {
    try {
        const {
            municipality,
            year,
            month,
            limit = 50,
            offset = 0
        } = req.query;

        let queryText = `
            SELECT r.id, r.report_month, r.municipality_name, r.status, r.created_at, r.updated_at,
                   COUNT(rv.id) as values_count,
                   SUM(rv.value) as total_value
            FROM reports r
            LEFT JOIN report_values rv ON r.id = rv.report_id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (municipality) {
            queryText += ` AND r.municipality_name ILIKE $${paramIndex}`;
            params.push(`%${municipality}%`);
            paramIndex++;
        }

        if (year) {
            queryText += ` AND EXTRACT(YEAR FROM TO_DATE(r.report_month, 'YYYY-MM')) = $${paramIndex}`;
            params.push(parseInt(year));
            paramIndex++;
        }

        if (month) {
            queryText += ` AND r.report_month = $${paramIndex}`;
            params.push(month);
            paramIndex++;
        }

        queryText += `
            GROUP BY r.id, r.report_month, r.municipality_name, r.status, r.created_at, r.updated_at
            ORDER BY r.updated_at DESC
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
        console.error('Error fetching reports list:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения списка отчетов'
        });
    }
});

module.exports = router;