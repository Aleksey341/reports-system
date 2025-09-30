const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

// Конфигурация БД для миграций (используем RW)
const dbConfig = {
    host: process.env.DB_HOST_RW || 'amvera-alex1976-cnpg-reports-db-rw',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'reports',
    user: process.env.DB_USER || 'reports_admin',
    password: process.env.DB_PASSWORD || 'Qwerty12345!',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
};

async function runMigrations() {
    const client = new Client(dbConfig);

    try {
        console.log('🔌 Подключение к базе данных...');
        await client.connect();
        console.log('✅ Подключение установлено');

        // Читаем схему
        const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        console.log('📋 Выполнение миграций схемы...');
        await client.query(schema);
        console.log('✅ Схема создана успешно');

        // Читаем seed данные
        const seedPath = path.join(__dirname, '..', 'database', 'seed.sql');
        const seed = fs.readFileSync(seedPath, 'utf8');

        console.log('🌱 Загрузка начальных данных...');
        await client.query(seed);
        console.log('✅ Начальные данные загружены');

        // Проверяем результат
        const municipalitiesResult = await client.query('SELECT COUNT(*) FROM municipalities');
        const indicatorsResult = await client.query('SELECT COUNT(*) FROM indicators_template');

        console.log('\n📊 Результаты миграции:');
        console.log(`   Муниципалитетов: ${municipalitiesResult.rows[0].count}`);
        console.log(`   Показателей: ${indicatorsResult.rows[0].count}`);

        console.log('\n🎉 Миграция завершена успешно!');

    } catch (error) {
        console.error('❌ Ошибка миграции:', error);
        process.exit(1);
    } finally {
        await client.end();
    }
}

// Запуск миграций
if (require.main === module) {
    runMigrations().catch(console.error);
}

module.exports = { runMigrations };