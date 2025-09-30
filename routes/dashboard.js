const express = require('express');
const ExcelJS = require('exceljs');
const { query } = require('../config/database');

const router = express.Router();

// Получить данные для дашборда
router.get('/data', async (req, res) => {
    try {
        const {
            dateFrom,
            dateTo,
            municipality,
            year
        } = req.query;

        let baseQuery = `
            SELECT
                r.id,
                r.report_month,
                r.municipality_name,
                r.created_at,
                r.updated_at,
                rv.row_id,
                rv.serial_number,
                rv.indicator_description,
                rv.unit,
                rv.value
            FROM reports r
            LEFT JOIN report_values rv ON r.id = rv.report_id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        // Фильтры
        if (municipality && municipality !== 'all') {
            baseQuery += ` AND r.municipality_name = $${paramIndex}`;
            params.push(municipality);
            paramIndex++;
        }

        if (year) {
            baseQuery += ` AND EXTRACT(YEAR FROM TO_DATE(r.report_month, 'YYYY-MM')) = $${paramIndex}`;
            params.push(parseInt(year));
            paramIndex++;
        }

        if (dateFrom) {
            baseQuery += ` AND r.created_at >= $${paramIndex}`;
            params.push(dateFrom);
            paramIndex++;
        }

        if (dateTo) {
            baseQuery += ` AND r.created_at <= $${paramIndex}`;
            params.push(dateTo);
            paramIndex++;
        }

        baseQuery += ` ORDER BY r.report_month DESC, r.municipality_name, rv.serial_number`;

        const result = await query(baseQuery, params, true);

        // Группируем данные по отчетам
        const reportsMap = new Map();
        result.rows.forEach(row => {
            if (!reportsMap.has(row.id)) {
                reportsMap.set(row.id, {
                    id: row.id,
                    month: row.report_month,
                    municipality: row.municipality_name,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    values: []
                });
            }

            if (row.row_id) {
                reportsMap.get(row.id).values.push({
                    row_id: row.row_id,
                    serial_number: row.serial_number,
                    description: row.indicator_description,
                    unit: row.unit,
                    value: row.value
                });
            }
        });

        const reports = Array.from(reportsMap.values());

        // Статистика
        const statsResult = await query(`
            SELECT
                COUNT(DISTINCT r.id) as total_reports,
                COUNT(DISTINCT r.municipality_name) as municipalities_count,
                SUM(rv.value) as total_values,
                MIN(r.created_at) as first_report,
                MAX(r.created_at) as last_report
            FROM reports r
            LEFT JOIN report_values rv ON r.id = rv.report_id
            ${municipality && municipality !== 'all' ? 'WHERE r.municipality_name = $1' : ''}
        `, municipality && municipality !== 'all' ? [municipality] : [], true);

        const stats = statsResult.rows[0];

        // Данные по месяцам для графиков
        const monthlyResult = await query(`
            SELECT
                r.report_month,
                r.municipality_name,
                COUNT(DISTINCT r.id) as reports_count,
                SUM(rv.value) as total_value,
                AVG(rv.value) as avg_value
            FROM reports r
            LEFT JOIN report_values rv ON r.id = rv.report_id
            ${municipality && municipality !== 'all' ? 'WHERE r.municipality_name = $1' : ''}
            GROUP BY r.report_month, r.municipality_name
            ORDER BY r.report_month DESC
        `, municipality && municipality !== 'all' ? [municipality] : [], true);

        // Топ показателей
        const topIndicatorsResult = await query(`
            SELECT
                rv.indicator_description,
                SUM(rv.value) as total_value,
                AVG(rv.value) as avg_value,
                COUNT(*) as reports_count
            FROM report_values rv
            JOIN reports r ON rv.report_id = r.id
            ${municipality && municipality !== 'all' ? 'WHERE r.municipality_name = $1' : ''}
            GROUP BY rv.indicator_description
            HAVING SUM(rv.value) > 0
            ORDER BY SUM(rv.value) DESC
            LIMIT 10
        `, municipality && municipality !== 'all' ? [municipality] : [], true);

        res.json({
            success: true,
            data: {
                reports,
                stats,
                monthly: monthlyResult.rows,
                topIndicators: topIndicatorsResult.rows
            }
        });

    } catch (error) {
        console.error('Dashboard data error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения данных дашборда'
        });
    }
});

// Получить данные для сравнения муниципалитетов
router.get('/compare', async (req, res) => {
    try {
        const { months, indicators } = req.query;

        if (!months) {
            return res.status(400).json({
                success: false,
                error: 'Необходимо указать месяцы для сравнения'
            });
        }

        const monthsList = Array.isArray(months) ? months : [months];
        const indicatorsList = indicators ? (Array.isArray(indicators) ? indicators : [indicators]) : null;

        let compareQuery = `
            SELECT
                r.report_month,
                r.municipality_name,
                rv.row_id,
                rv.indicator_description,
                rv.value
            FROM reports r
            JOIN report_values rv ON r.id = rv.report_id
            WHERE r.report_month = ANY($1)
        `;

        const params = [monthsList];
        let paramIndex = 2;

        if (indicatorsList) {
            compareQuery += ` AND rv.row_id = ANY($${paramIndex})`;
            params.push(indicatorsList);
        }

        compareQuery += ` ORDER BY r.municipality_name, rv.serial_number`;

        const result = await query(compareQuery, params, true);

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Compare data error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения данных для сравнения'
        });
    }
});

// Экспорт в Excel
router.post('/export', async (req, res) => {
    try {
        const {
            dateFrom,
            dateTo,
            municipality,
            includeCharts = false,
            format = 'detailed'
        } = req.body;

        // Получаем данные для экспорта
        let exportQuery = `
            SELECT
                r.report_month,
                r.municipality_name,
                r.created_at,
                rv.serial_number,
                rv.indicator_description,
                rv.unit,
                rv.value
            FROM reports r
            LEFT JOIN report_values rv ON r.id = rv.report_id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (municipality && municipality !== 'all') {
            exportQuery += ` AND r.municipality_name = $${paramIndex}`;
            params.push(municipality);
            paramIndex++;
        }

        if (dateFrom) {
            exportQuery += ` AND r.created_at >= $${paramIndex}`;
            params.push(dateFrom);
            paramIndex++;
        }

        if (dateTo) {
            exportQuery += ` AND r.created_at <= $${paramIndex}`;
            params.push(dateTo);
            paramIndex++;
        }

        exportQuery += ` ORDER BY r.report_month DESC, r.municipality_name, rv.serial_number`;

        const result = await query(exportQuery, params, true);

        // Создаем Excel workbook
        const workbook = new ExcelJS.Workbook();

        // Основной лист с данными
        const worksheet = workbook.addWorksheet('Отчеты');

        // Заголовки
        const headers = [
            'Месяц',
            'Муниципалитет',
            'Дата создания',
            '№ п/п',
            'Показатель',
            'Единица',
            'Значение'
        ];

        worksheet.addRow(headers);

        // Стилизация заголовков
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };

        // Добавляем данные
        result.rows.forEach(row => {
            worksheet.addRow([
                row.report_month,
                row.municipality_name,
                row.created_at ? new Date(row.created_at).toLocaleDateString('ru-RU') : '',
                row.serial_number,
                row.indicator_description,
                row.unit,
                row.value || 0
            ]);
        });

        // Автоширина колонок
        worksheet.columns.forEach(column => {
            let maxLength = 0;
            column.eachCell({ includeEmpty: false }, cell => {
                const length = cell.value ? cell.value.toString().length : 0;
                if (length > maxLength) {
                    maxLength = length;
                }
            });
            column.width = Math.min(Math.max(maxLength + 2, 10), 50);
        });

        // Сводный лист
        if (format === 'detailed') {
            const summarySheet = workbook.addWorksheet('Сводка');

            // Статистика по муниципалитетам
            const summaryQuery = `
                SELECT
                    r.municipality_name,
                    COUNT(DISTINCT r.id) as reports_count,
                    SUM(rv.value) as total_value,
                    AVG(rv.value) as avg_value,
                    MIN(r.created_at) as first_report,
                    MAX(r.created_at) as last_report
                FROM reports r
                LEFT JOIN report_values rv ON r.id = rv.report_id
                ${municipality && municipality !== 'all' ? 'WHERE r.municipality_name = $1' : ''}
                GROUP BY r.municipality_name
                ORDER BY SUM(rv.value) DESC
            `;

            const summaryResult = await query(summaryQuery,
                municipality && municipality !== 'all' ? [municipality] : [], true);

            const summaryHeaders = [
                'Муниципалитет',
                'Количество отчетов',
                'Общая сумма',
                'Среднее значение',
                'Первый отчет',
                'Последний отчет'
            ];

            summarySheet.addRow(summaryHeaders);
            const summaryHeaderRow = summarySheet.getRow(1);
            summaryHeaderRow.font = { bold: true };
            summaryHeaderRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            };

            summaryResult.rows.forEach(row => {
                summarySheet.addRow([
                    row.municipality_name,
                    row.reports_count,
                    Math.round(row.total_value || 0),
                    Math.round(row.avg_value || 0),
                    row.first_report ? new Date(row.first_report).toLocaleDateString('ru-RU') : '',
                    row.last_report ? new Date(row.last_report).toLocaleDateString('ru-RU') : ''
                ]);
            });

            summarySheet.columns.forEach(column => {
                let maxLength = 0;
                column.eachCell({ includeEmpty: false }, cell => {
                    const length = cell.value ? cell.value.toString().length : 0;
                    if (length > maxLength) {
                        maxLength = length;
                    }
                });
                column.width = Math.min(Math.max(maxLength + 2, 10), 50);
            });
        }

        // Генерируем файл
        const buffer = await workbook.xlsx.writeBuffer();

        // Формируем имя файла
        const dateStr = new Date().toISOString().split('T')[0];
        const muniStr = municipality && municipality !== 'all' ?
            municipality.replace(/\s+/g, '_') : 'Все_муниципалитеты';
        const fileName = `Отчеты_${muniStr}_${dateStr}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
        res.send(buffer);

    } catch (error) {
        console.error('Excel export error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка экспорта в Excel'
        });
    }
});

// Получить список доступных периодов
router.get('/periods', async (req, res) => {
    try {
        const result = await query(`
            SELECT DISTINCT
                report_month,
                EXTRACT(YEAR FROM TO_DATE(report_month, 'YYYY-MM')) as year,
                EXTRACT(MONTH FROM TO_DATE(report_month, 'YYYY-MM')) as month
            FROM reports
            ORDER BY report_month DESC
        `, [], true);

        const periods = result.rows.map(row => ({
            value: row.report_month,
            year: parseInt(row.year),
            month: parseInt(row.month),
            label: new Date(row.year, row.month - 1).toLocaleDateString('ru-RU', {
                year: 'numeric',
                month: 'long'
            })
        }));

        res.json({
            success: true,
            data: periods
        });

    } catch (error) {
        console.error('Periods data error:', error);
        res.status(500).json({
            success: false,
            error: 'Ошибка получения списка периодов'
        });
    }
});

module.exports = router;