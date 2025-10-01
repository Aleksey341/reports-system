#!/usr/bin/env node
// scripts/check-db.js
// Проверка состояния базы данных

'use strict';

require('dotenv').config();
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

async function checkDatabase() {
  console.log('🔍 Проверка базы данных...\n');

  try {
    // Проверка подключения
    await pool.query('SELECT 1');
    console.log('✅ Подключение к БД успешно\n');

    // Проверка таблиц
    const tables = [
      'municipalities',
      'indicators_catalog',
      'indicator_values',
      'services_catalog',
      'service_values'
    ];

    console.log('📊 Статус таблиц:\n');

    for (const table of tables) {
      try {
        const countRes = await pool.query(`SELECT COUNT(*)::int as cnt FROM public.${table}`);
        const count = countRes.rows[0].cnt;

        // Проверка структуры
        const columnsRes = await pool.query(`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `, [table]);

        const status = count > 0 ? '✅' : '⚠️ ';
        console.log(`${status} ${table.padEnd(25)} - ${count} записей`);

        if (count === 0 && table !== 'indicator_values' && table !== 'service_values') {
          console.log(`   ⚠️  Таблица пустая! Выполните: npm run db:init`);
        }

        // Показываем колонки для indicator_values
        if (table === 'indicator_values') {
          console.log('   Колонки:', columnsRes.rows.map(r => r.column_name).join(', '));
        }

      } catch (err) {
        console.log(`❌ ${table.padEnd(25)} - НЕ НАЙДЕНА`);
        console.log(`   Ошибка: ${err.message}`);
        console.log(`   💡 Выполните: npm run db:init`);
      }
    }

    console.log('\n🔧 Проверка constraint и индексов:\n');

    // Проверка unique constraint для indicator_values
    const constraintsRes = await pool.query(`
      SELECT conname, contype
      FROM pg_constraint
      WHERE conrelid = 'public.indicator_values'::regclass
    `);

    if (constraintsRes.rows.length > 0) {
      console.log('✅ Constraints для indicator_values:');
      constraintsRes.rows.forEach(r => {
        const type = { u: 'UNIQUE', p: 'PRIMARY KEY', f: 'FOREIGN KEY', c: 'CHECK' }[r.contype];
        console.log(`   - ${r.conname} (${type})`);
      });
    } else {
      console.log('⚠️  Нет constraints для indicator_values');
    }

    console.log('\n📈 Примеры данных:\n');

    // Показываем примеры муниципалитетов
    const muniRes = await pool.query('SELECT id, name FROM public.municipalities LIMIT 3');
    if (muniRes.rows.length > 0) {
      console.log('Муниципалитеты:');
      muniRes.rows.forEach(r => console.log(`  - [${r.id}] ${r.name}`));
    }

    // Показываем примеры показателей
    const indRes = await pool.query(`
      SELECT id, code, name FROM public.indicators_catalog
      WHERE form_code = 'form_1_gmu' LIMIT 3
    `);
    if (indRes.rows.length > 0) {
      console.log('\nПоказатели (form_1_gmu):');
      indRes.rows.forEach(r => console.log(`  - [${r.id}] ${r.code}: ${r.name}`));
    }

    console.log('\n✅ Проверка завершена!\n');

  } catch (err) {
    console.error('\n❌ Ошибка проверки:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkDatabase();
