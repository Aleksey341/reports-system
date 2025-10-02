#!/usr/bin/env node
// scripts/create-admin.js
'use strict';

/**
 * Скрипт для создания первого администратора
 *
 * Использование:
 *   node scripts/create-admin.js <password>
 *
 * Пример:
 *   node scripts/create-admin.js SecurePass123
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

async function createAdmin(password) {
  try {
    // Валидация входных данных
    if (!password) {
      console.error('❌ Ошибка: Пароль обязателен');
      console.log('\nИспользование:');
      console.log('  node scripts/create-admin.js <password>');
      console.log('\nПример:');
      console.log('  node scripts/create-admin.js SecurePass123');
      process.exit(1);
    }

    if (password.length < 6) {
      console.error('❌ Ошибка: Пароль должен содержать минимум 6 символов');
      process.exit(1);
    }

    // Проверяем подключение к БД
    console.log('🔌 Подключение к базе данных...');
    await pool.query('SELECT 1');
    console.log('✅ Подключение установлено');

    // Проверяем, существует ли таблица users
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.error('❌ Ошибка: Таблица users не найдена');
      console.log('\n💡 Выполните миграцию:');
      console.log('   psql -h HOST -U USER -d DATABASE -f database/auth-migration.sql');
      process.exit(1);
    }

    // Проверяем, существует ли уже администратор (municipality_id = NULL)
    const existingAdmin = await pool.query(
      'SELECT id, role FROM users WHERE municipality_id IS NULL'
    );

    if (existingAdmin.rows.length > 0) {
      const user = existingAdmin.rows[0];
      console.log(`\n⚠️  Администратор уже существует (ID: ${user.id})`);
      console.log('\n🔄 Обновляю пароль администратора...');

      const password_hash = await bcrypt.hash(password, 12);
      await pool.query(
        'UPDATE users SET password_hash = $1, role = $2, updated_at = NOW() WHERE id = $3',
        [password_hash, 'admin', user.id]
      );

      console.log('✅ Пароль администратора успешно обновлен');
      console.log('\n🔒 Данные для входа:');
      console.log(`   Выберите:   Администратор`);
      console.log(`   Пароль:     ${password}`);
      console.log('\n💡 Войдите в систему по адресу: http://localhost/form');
      process.exit(0);
    }

    // Хешируем пароль
    console.log('\n🔐 Хеширование пароля...');
    const password_hash = await bcrypt.hash(password, 12);

    // Создаём администратора (municipality_id = NULL)
    console.log('👤 Создание администратора...');
    const result = await pool.query(`
      INSERT INTO users (municipality_id, password_hash, role, is_active)
      VALUES (NULL, $1, 'admin', true)
      RETURNING id, role, created_at
    `, [password_hash]);

    const admin = result.rows[0];

    console.log('\n✅ Администратор успешно создан!');
    console.log('\n📋 Детали:');
    console.log(`   ID:         ${admin.id}`);
    console.log(`   Роль:       ${admin.role}`);
    console.log(`   Создан:     ${admin.created_at}`);
    console.log('\n🔒 Данные для входа:');
    console.log(`   Выберите:   Администратор`);
    console.log(`   Пароль:     ${password}`);
    console.log('\n💡 Войдите в систему по адресу: http://localhost/form');

    process.exit(0);

  } catch (err) {
    console.error('\n❌ Ошибка при создании администратора:');

    if (err.code === '23505') {
      console.error('   Администратор уже существует');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('   Не удалось подключиться к базе данных');
      console.error('   Проверьте настройки подключения в .env');
    } else {
      console.error(`   ${err.message}`);
      if (process.env.NODE_ENV !== 'production') {
        console.error('\n🐛 Детали ошибки:');
        console.error(err);
      }
    }

    process.exit(1);
  } finally {
    // Закрываем подключение
    await pool.end();
  }
}

// Получаем аргументы командной строки
const password = process.argv[2];

// Запускаем создание админа
createAdmin(password);
