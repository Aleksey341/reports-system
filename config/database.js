const { Pool } = require('pg');

// Конфигурация для записи и чтения
const dbConfigRW = {
    host: process.env.DB_HOST_RW || 'amvera-alex1976-cnpg-reports-db-rw',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'reports',
    user: process.env.DB_USER || 'reports_admin',
    password: process.env.DB_PASSWORD || 'Qwerty12345!',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20, // максимум соединений в пуле
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};

// Конфигурация только для чтения (аналитика, дашборд)
const dbConfigRO = {
    ...dbConfigRW,
    host: process.env.DB_HOST_RO || 'amvera-alex1976-cnpg-reports-db-ro',
    max: 10, // меньше соединений для readonly
};

// Пул для записи/чтения
const pool = new Pool(dbConfigRW);

// Пул только для чтения
const poolRO = new Pool(dbConfigRO);

// Обработка ошибок подключения
pool.on('error', (err, client) => {
    console.error('Неожиданная ошибка БД (RW):', err);
});

poolRO.on('error', (err, client) => {
    console.error('Неожиданная ошибка БД (RO):', err);
});

// Тестирование подключения при запуске
async function testConnections() {
    try {
        const clientRW = await pool.connect();
        console.log('✅ Подключение к БД (RW) установлено');
        clientRW.release();

        const clientRO = await poolRO.connect();
        console.log('✅ Подключение к БД (RO) установлено');
        clientRO.release();
    } catch (err) {
        console.error('❌ Ошибка подключения к БД:', err.message);
        process.exit(1);
    }
}

// Выполняем тест при загрузке модуля
testConnections();

// Утилита для выполнения запросов с обработкой ошибок
async function query(text, params, useReadOnly = false) {
    const targetPool = useReadOnly ? poolRO : pool;
    const start = Date.now();

    try {
        const res = await targetPool.query(text, params);
        const duration = Date.now() - start;

        console.log(`🔍 Executed query (${useReadOnly ? 'RO' : 'RW'}):`, {
            duration: `${duration}ms`,
            rows: res.rowCount
        });

        return res;
    } catch (error) {
        console.error('🚨 Database query error:', {
            error: error.message,
            query: text,
            params: params
        });
        throw error;
    }
}

// Утилита для транзакций
async function transaction(callback) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    poolRO,
    query,
    transaction
};