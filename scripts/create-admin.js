#!/usr/bin/env node
// scripts/create-admin.js
'use strict';

/**
 * Скрипт для создания первого администратора
 *
 * Использование:
 *   node scripts/create-admin.js <email> <password>
 *
 * Пример:
 *   node scripts/create-admin.js admin@example.com SecurePass123
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');

async function createAdmin(email, password) {
  try {
    // Валидация входных данных
    if (!email || !password) {
      console.error('❌ Ошибка: Email и пароль обязательны');
      console.log('\nИспользование:');
      console.log('  node scripts/create-admin.js <email> <password>');
      console.log('\nПример:');
      console.log('  node scripts/create-admin.js admin@example.com SecurePass123');
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

    // Проверяем, существует ли уже пользователь с таким email
    const existingUser = await pool.query(
      'SELECT id, email, role FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];
      console.log(`\n⚠️  Пользователь с email "${email}" уже существует`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Роль: ${user.role}`);

      if (user.role === 'admin') {
        console.log('\n✅ Это уже администратор. Изменения не требуются.');
        process.exit(0);
      } else {
        console.log('\n🔄 Обновляю роль на admin...');
        await pool.query(
          'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2',
          ['admin', user.id]
        );
        console.log('✅ Роль успешно обновлена на admin');
        process.exit(0);
      }
    }

    // Хешируем пароль
    console.log('\n🔐 Хеширование пароля...');
    const password_hash = await bcrypt.hash(password, 12);

    // Создаём администратора
    console.log('👤 Создание администратора...');
    const result = await pool.query(`
      INSERT INTO users (email, password_hash, role, is_active)
      VALUES ($1, $2, 'admin', true)
      RETURNING id, email, role, created_at
    `, [email, password_hash]);

    const admin = result.rows[0];

    console.log('\n✅ Администратор успешно создан!');
    console.log('\n📋 Детали:');
    console.log(`   ID:         ${admin.id}`);
    console.log(`   Email:      ${admin.email}`);
    console.log(`   Роль:       ${admin.role}`);
    console.log(`   Создан:     ${admin.created_at}`);
    console.log('\n🔒 Данные для входа:');
    console.log(`   Email:      ${email}`);
    console.log(`   Пароль:     ${password}`);
    console.log('\n💡 Войдите в систему по адресу: http://localhost/form');

    process.exit(0);

  } catch (err) {
    console.error('\n❌ Ошибка при создании администратора:');

    if (err.code === '23505') {
      console.error('   Пользователь с таким email уже существует');
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
const email = process.argv[2];
const password = process.argv[3];

// Запускаем создание админа
createAdmin(email, password);
