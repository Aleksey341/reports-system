// scripts/create-default-users.js
// Скрипт для создания пользователей по умолчанию

require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

async function createDefaultUsers() {
  const client = await pool.connect();
  try {
    console.log('🔧 Создание пользователей по умолчанию...\n');

    // 1. Создаём администратора
    const adminPassword = 'admin123'; // СМЕНИТЕ НА БЕЗОПАСНЫЙ!
    const adminHash = await bcrypt.hash(adminPassword, 12);

    await client.query(`
      INSERT INTO users (municipality_id, password_hash, role, is_active, password_reset_required, last_password_change)
      VALUES (NULL, $1, 'admin', TRUE, TRUE, NOW())
      ON CONFLICT DO NOTHING
    `, [adminHash]);

    console.log('✅ Администратор создан:');
    console.log('   Логин: admin');
    console.log(`   Пароль: ${adminPassword}`);
    console.log('   ⚠️  Потребуется смена пароля при первом входе!\n');

    // 2. Получаем список всех муниципалитетов
    const { rows: municipalities } = await client.query(`
      SELECT id, name FROM municipalities ORDER BY id
    `);

    console.log(`📋 Найдено муниципалитетов: ${municipalities.length}\n`);

    // 3. Создаём пользователей для каждого муниципалитета
    const defaultPassword = 'temp123'; // Временный пароль для всех
    const defaultHash = await bcrypt.hash(defaultPassword, 12);

    for (const mun of municipalities) {
      try {
        await client.query(`
          INSERT INTO users (municipality_id, password_hash, role, is_active, password_reset_required, last_password_change)
          VALUES ($1, $2, 'operator', TRUE, TRUE, NOW())
          ON CONFLICT (municipality_id) DO NOTHING
        `, [mun.id, defaultHash]);

        console.log(`✅ ${mun.name} (ID: ${mun.id})`);
      } catch (err) {
        if (err.code === '23505') {
          console.log(`⏭️  ${mun.name} (ID: ${mun.id}) - уже существует`);
        } else {
          console.error(`❌ ${mun.name} (ID: ${mun.id}) - ошибка:`, err.message);
        }
      }
    }

    console.log(`\n✅ Создание завершено!`);
    console.log(`\n📝 Временный пароль для всех муниципалитетов: ${defaultPassword}`);
    console.log('⚠️  Все пользователи должны сменить пароль при первом входе!');
    console.log('\n💡 Рекомендации:');
    console.log('   1. Сообщите каждому муниципалитету их временный пароль');
    console.log('   2. Логин = ID муниципалитета из таблицы выше');
    console.log('   3. После первого входа система потребует смену пароля');

  } catch (err) {
    console.error('❌ Ошибка:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

createDefaultUsers();
