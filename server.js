const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { pool, poolRO } = require('./config/database');
const reportRoutes = require('./routes/reports');
const dashboardRoutes = require('./routes/dashboard');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 80;

// Middleware безопасности
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            fontSrc: ["https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"]
        }
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 1000, // максимум запросов с одного IP
    message: 'Превышен лимит запросов. Попробуйте позже.'
});
app.use(limiter);

// Общие middleware
app.use(compression());
app.use(cors({
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Статические файлы
app.use(express.static('public'));

// Логирование запросов
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} - ${req.ip}`);
    next();
});

// API маршруты
app.use('/api', apiRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Форма заполнения
app.get('/form', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'form.html'));
});

// Дашборд
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Проверка здоровья приложения
app.get('/health', async (req, res) => {
    try {
        // Проверяем подключение к БД
        await pool.query('SELECT 1');
        await poolRO.query('SELECT 1');

        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected',
            version: process.env.npm_package_version || '1.0.0'
        });
    } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Обработка 404
app.use((req, res) => {
    res.status(404).json({ error: 'Страница не найдена' });
});

// Глобальная обработка ошибок
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);

    // Не показываем детали ошибок в продакшене
    const isDevelopment = process.env.NODE_ENV !== 'production';

    res.status(err.status || 500).json({
        error: isDevelopment ? err.message : 'Внутренняя ошибка сервера',
        ...(isDevelopment && { stack: err.stack })
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM получен. Завершение работы...');
    await pool.end();
    await poolRO.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT получен. Завершение работы...');
    await pool.end();
    await poolRO.end();
    process.exit(0);
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📊 Дашборд: http://localhost:${PORT}/dashboard`);
    console.log(`📝 Форма: http://localhost:${PORT}/form`);
    console.log(`❤️ Health: http://localhost:${PORT}/health`);
});

module.exports = app;