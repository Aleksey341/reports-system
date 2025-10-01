#!/usr/bin/env node
// scripts/init-database.js
// Инициализация базы данных: создание схемы и загрузка тестовых данных

'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || process.env.DB_HOST,
  port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
  database: process.env.PGDATABASE || process.env.DB_NAME || 'reports',
  user: process.env.PGUSER || process.env.DB_USER || 'reports_admin',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
  ssl: ['true', '1', 'yes'].includes(String(process.env.PGSSL || process.env.DB_SSL || '').toLowerCase())
    ? { rejectUnauthorized: false }
    : undefined,
});

async function runSQLFile(filePath, description) {
  console.log(`\n📄 ${description}`);
  console.log(`   Файл: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Файл не найден: ${filePath}`);
  }

  const sql = fs.readFileSync(filePath, 'utf-8');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Выполняем SQL
    await client.query(sql);

    await client.query('COMMIT');
    console.log(`   ✅ Успешно выполнено`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`   ❌ Ошибка:`, err.message);
    throw err;
  } finally {
    client.release();
  }
}

async function checkTables() {
  console.log('\n📊 Проверка созданных таблиц:');

  const tables = [
    'municipalities',
    'indicators_catalog',
    'indicator_values',
    'services_catalog',
    'service_values'
  ];

  for (const table of tables) {
    try {
      const result = await pool.query(
        `SELECT COUNT(*)::int as cnt FROM public.${table}`
      );
      console.log(`   ✓ ${table.padEnd(25)} - ${result.rows[0].cnt} записей`);
    } catch (err) {
      console.log(`   ✗ ${table.padEnd(25)} - НЕ НАЙДЕНА`);
    }
  }
}

async function main() {
  console.log('🚀 Инициализация базы данных reports-system\n');
  console.log('🔗 Подключение:');
  console.log(`   Host: ${process.env.PGHOST || process.env.DB_HOST}`);
  console.log(`   Database: ${process.env.PGDATABASE || process.env.DB_NAME}`);
  console.log(`   User: ${process.env.PGUSER || process.env.DB_USER}`);

  try {
    // Проверка подключения
    await pool.query('SELECT 1');
    console.log('\n   ✅ Подключение установлено');

    // 1. Создание схемы
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    await runSQLFile(schemaPath, 'Создание схемы БД');

    // 2. Загрузка тестовых данных
    const seedPath = path.join(__dirname, '..', 'database', 'seed_data.sql');
    await runSQLFile(seedPath, 'Загрузка тестовых данных');

    // 3. Проверка результатов
    await checkTables();

    console.log('\n🎉 Инициализация завершена успешно!\n');
    console.log('Следующие шаги:');
    console.log('  1. Импортируйте муниципалитеты: npm run migrate');
    console.log('  2. Запустите сервер: npm start');
    console.log('  3. Откройте дашборд: http://localhost/dashboard\n');

  } catch (err) {
    console.error('\n❌ Ошибка инициализации:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Запуск
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
