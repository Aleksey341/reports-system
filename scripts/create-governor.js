// Скрипт для создания пользователя "Губернатор"
// Запуск: node scripts/create-governor.js

const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST_RW,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function createGovernor() {
  try {
    console.log('🔐 Создание пользователя "Губернатор Липецкой области"...\n');

    // Пароль по умолчанию
    const defaultPassword = 'Governor2025';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    // Сначала проверим, нужно ли добавить 'governor' в CHECK constraint для role
    try {
      await pool.query(`
        ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'operator', 'governor'));
      `);
      console.log('✅ Constraint для роли governor добавлен');
    } catch (e) {
      console.log('⚠️  Constraint уже существует или не требуется');
    }

    // Сначала проверим, есть ли уже пользователь с ролью governor
    const checkResult = await pool.query(`SELECT id FROM users WHERE role = 'governor'`);

    if (checkResult.rows.length > 0) {
      // Обновляем существующего пользователя
      const updateQuery = `
        UPDATE users
        SET password_hash = $1, is_active = $2
        WHERE role = 'governor'
        RETURNING id, municipality_id, role;
      `;
      var result = await pool.query(updateQuery, [passwordHash, true]);
      console.log('✅ Существующий пользователь governor обновлен');
    } else {
      // Создаем нового пользователя (municipality_id = NULL, так как governor не привязан к муниципалитету)
      // Сначала временно отключим constraint UNIQUE(municipality_id)
      await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_municipality_id_key`);

      const insertQuery = `
        INSERT INTO users (municipality_id, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4)
        RETURNING id, municipality_id, role;
      `;

      var result = await pool.query(insertQuery, [
        null,                    // municipality_id = NULL для губернатора
        passwordHash,            // password_hash
        'governor',              // role
        true                     // is_active
      ]);
    }

    console.log('✅ Пользователь создан успешно!');
    console.log('\n📋 Данные для входа:');
    console.log('   Логин (municipality_id): governor');
    console.log('   Пароль:', defaultPassword);
    console.log('   Роль:', result.rows[0].role);
    console.log('   ID:', result.rows[0].id);
    console.log('\n🔗 Доступ только к "Общий дашборд"');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Ошибка создания пользователя:', error.message);
    await pool.end();
    process.exit(1);
  }
}

createGovernor();
