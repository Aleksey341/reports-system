// apply-service-id-migration.js
// Применение миграции для добавления service_id в indicator_values

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./config/database');

async function applyMigration() {
  const client = await pool.connect();
  try {
    console.log('🔧 Применение миграции: добавление service_id в indicator_values...');

    const migrationPath = path.join(__dirname, 'database', 'add-service-id-migration.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    await client.query('BEGIN');
    await client.query(migrationSql);
    await client.query('COMMIT');

    console.log('✅ Миграция успешно применена!');
    console.log('');
    console.log('Изменения:');
    console.log('- Добавлено поле service_id в таблицу indicator_values');
    console.log('- Создан индекс idx_indicator_values_service');
    console.log('');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Ошибка при применении миграции:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration();
