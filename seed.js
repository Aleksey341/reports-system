const { pool } = require('../config/database');
const xlsx = require('xlsx');
const path = require('path');

async function seed() {
  try {
    console.log('Seeding municipalities...');

    const filePath = path.join(__dirname, '../муниципалитеты с главами и должностями.xlsx');
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    for (const row of data) {
      await pool.query(
        `INSERT INTO municipalities (name, head_name, head_position) VALUES ($1, $2, $3)
         ON CONFLICT (name) DO NOTHING`,
        [row.Муниципалитет, row.Глава, row.Должность]
      );
    }

    console.log('✅ Municipalities imported successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seed();
