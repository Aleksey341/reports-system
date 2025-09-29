// migrate.js
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const { Pool } = require('pg');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

/* ---------- CLI ---------- */
const argv = yargs(hideBin(process.argv))
  .option('file', {
    alias: 'f',
    type: 'string',
    describe: 'Путь к Excel/CSV файлу с муниципалитетами',
    demandOption: true,
  })
  .option('sheet', {
    alias: 's',
    type: 'string',
    describe: 'Имя листа в Excel (по умолчанию первый лист)',
  })
  .option('truncate', {
    alias: 't',
    type: 'boolean',
    default: false,
    describe: 'Очистить таблицу перед загрузкой',
  })
  .option('schema', {
    type: 'string',
    default: 'public',
    describe: 'Схема БД (по умолчанию public)',
  })
  .help()
  .strict()
  .argv;

/* ---------- DB Pool ---------- */
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: String(process.env.DB_SSL || '').toLowerCase() === 'true'
      ? { rejectUnauthorized: false }
      : false,
});

const TABLE = 'municipalities';
const SCHEMA = argv.schema;

/* ---------- Helpers ---------- */

const HEADER_MAP = {
  // название муниципалитета
  name: [
    'муниципалитет',
    'муниципальное образование',
    'название',
    'наименование',
    'наименование мо',
    'mo',
  ],
  // ФИО главы
  head_name: [
    'глава',
    'руководитель',
    'фио',
    'фио главы',
    'председатель',
  ],
  // Должность
  head_position: [
    'должность',
    'должность главы',
    'позиция',
  ],
};

// пониженный регистр + без пробелов по краям
const norm = (v) => (v ?? '').toString().trim();
const normKey = (v) => norm(v).toLowerCase();

/** Найти целевые колонки в файле по русским заголовкам */
function resolveColumns(headersRow) {
  const idx = { name: -1, head_name: -1, head_position: -1 };
  const lower = headersRow.map(normKey);

  const findIdx = (aliases) =>
    lower.findIndex((h) => aliases.includes(h));

  idx.name         = findIdx(HEADER_MAP.name);
  idx.head_name    = findIdx(HEADER_MAP.head_name);
  idx.head_position= findIdx(HEADER_MAP.head_position);

  if (idx.name < 0) {
    throw new Error(
      `Не найден столбец с названием муниципалитета. Ожидались заголовки: ${HEADER_MAP.name.join(', ')}`
    );
  }
  return idx;
}

/* ---------- SQL ---------- */

const SQL_CREATE = `
  CREATE TABLE IF NOT EXISTS ${SCHEMA}.${TABLE} (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    head_name VARCHAR(255),
    head_position VARCHAR(255)
  );
`;

const SQL_UPSERT = `
  INSERT INTO ${SCHEMA}.${TABLE} (name, head_name, head_position)
  VALUES ($1, $2, $3)
  ON CONFLICT (name) DO UPDATE
    SET head_name = EXCLUDED.head_name,
        head_position = EXCLUDED.head_position;
`;

async function ensureTable() {
  await pool.query(SQL_CREATE);
}

/* ---------- Import ---------- */

function readWorkbook(filePath, sheetName) {
  const wb = xlsx.readFile(filePath, { cellDates: false, raw: false });
  const wsName = sheetName || wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  if (!ws) {
    throw new Error(`Лист "${wsName}" не найден в файле.`);
  }
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows.length) throw new Error('Пустой файл/лист.');

  // первая строка — заголовки
  const headers = rows[0];
  const data = rows.slice(1);

  return { headers, data, wsName };
}

async function importMunicipalities(filePath, sheetName, truncate) {
  console.log(`\n📄 Файл: ${filePath}`);
  const { headers, data, wsName } = readWorkbook(filePath, sheetName);
  console.log(`📑 Лист: ${wsName}`);
  console.log(`🧾 Всего строк (без заголовка): ${data.length}`);

  const idx = resolveColumns(headers);
  console.log('🔎 Колонки:', idx);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await ensureTable();

    if (truncate) {
      console.log('🧹 TRUNCATE таблицы перед загрузкой…');
      await client.query(`TRUNCATE TABLE ${SCHEMA}.${TABLE} RESTART IDENTITY CASCADE;`);
    }

    let inserted = 0, skipped = 0;
    for (let i = 0; i < data.length; i++) {
      const row = data[i] || [];

      const name          = norm(row[idx.name]);
      const head_name     = idx.head_name    >= 0 ? norm(row[idx.head_name])    : null;
      const head_position = idx.head_position>= 0 ? norm(row[idx.head_position]) : null;

      if (!name) { skipped++; continue; }

      await client.query(SQL_UPSERT, [name, head_name, head_position]);
      inserted++;
      if (inserted % 200 === 0) {
        process.stdout.write(`\r📦 Загружено: ${inserted}…`);
      }
    }

    await client.query('COMMIT');
    process.stdout.write('\n');
    console.log(`✅ Готово. Импортировано/обновлено: ${inserted}. Пропущено пустых: ${skipped}.`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/* ---------- Run ---------- */

(async () => {
  const abs = path.resolve(argv.file);
  if (!fs.existsSync(abs)) {
    throw new Error(`Файл не найден: ${abs}`);
  }
  console.log('🔗 Подключение к БД:', {
    host: process.env.DB_HOST,
    db: process.env.DB_NAME,
    user: process.env.DB_USER,
    ssl: process.env.DB_SSL,
    schema: SCHEMA,
  });

  await importMunicipalities(abs, argv.sheet, argv.truncate);
})()
  .catch((err) => {
    console.error('\n❌ Ошибка миграции:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
