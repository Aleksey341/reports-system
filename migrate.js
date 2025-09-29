const { pool } = require('../config/database');

async function migrate() {
  try {
    console.log('Running migrations...');

    // Таблица муниципалитетов
    await pool.query(`
      CREATE TABLE IF NOT EXISTS municipalities (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        head_name TEXT,
        head_position TEXT
      );
    `);

    // Таблица показателей
    await pool.query(`
      CREATE TABLE IF NOT EXISTS indicators (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        unit TEXT
      );
    `);

    // Таблица отчётов
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        municipality_id INT REFERENCES municipalities(id),
        indicator_id INT REFERENCES indicators(id),
        report_month DATE NOT NULL,
        value NUMERIC,
        created_at TIMESTAMP DEFAULT now()
      );
    `);

    console.log('✅ Migration complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();
