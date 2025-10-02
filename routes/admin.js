// routes/admin.js
'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const { pool, poolRO } = require('../config/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Все роуты админки требуют авторизации и роли admin
router.use(requireAuth);
router.use(requireAdmin);

/* ========== Управление пользователями ========== */

/**
 * GET /api/admin/users
 * Список всех пользователей
 */
router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await poolRO.query(`
      SELECT
        id,
        email,
        role,
        is_active,
        created_at,
        updated_at
      FROM users
      ORDER BY created_at DESC
    `);

    console.log(`[ADMIN] Запрошен список пользователей: ${rows.length} записей`);

    return res.json(rows);
  } catch (err) {
    console.error('[ADMIN] Error fetching users:', err);
    next(err);
  }
});

/**
 * GET /api/admin/users/:id
 * Информация о конкретном пользователе
 */
router.get('/users/:id', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);

    if (!userId) {
      return res.status(400).json({ error: 'bad_request', message: 'Некорректный ID пользователя' });
    }

    // Получаем данные пользователя
    const { rows: userRows } = await poolRO.query(`
      SELECT id, email, role, is_active, created_at, updated_at
      FROM users
      WHERE id = $1
    `, [userId]);

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Пользователь не найден' });
    }

    // Получаем список муниципалитетов пользователя
    const { rows: munisRows } = await poolRO.query(`
      SELECT municipality_id
      FROM user_municipalities
      WHERE user_id = $1
    `, [userId]);

    const user = userRows[0];
    user.municipality_ids = munisRows.map(r => r.municipality_id);

    return res.json(user);
  } catch (err) {
    console.error('[ADMIN] Error fetching user:', err);
    next(err);
  }
});

/**
 * POST /api/admin/users
 * Создание нового пользователя
 */
router.post('/users', async (req, res, next) => {
  const client = await pool.connect();

  try {
    const {
      email,
      password,
      role = 'operator',
      is_active = true,
      municipality_ids = []
    } = req.body || {};

    // Валидация
    if (!email || !password) {
      client.release();
      return res.status(400).json({
        error: 'bad_request',
        message: 'Email и пароль обязательны'
      });
    }

    if (!['admin', 'operator'].includes(role)) {
      client.release();
      return res.status(400).json({
        error: 'bad_request',
        message: 'Роль должна быть admin или operator'
      });
    }

    // Хешируем пароль
    const password_hash = await bcrypt.hash(password, 12);

    await client.query('BEGIN');

    // Создаем пользователя
    const { rows } = await client.query(`
      INSERT INTO users (email, password_hash, role, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, role, is_active, created_at
    `, [email, password_hash, role, is_active]);

    const newUser = rows[0];
    const userId = newUser.id;

    // Добавляем привязки к муниципалитетам
    if (Array.isArray(municipality_ids) && municipality_ids.length > 0) {
      const values = municipality_ids.map((munId, idx) => `($1, $${idx + 2})`).join(', ');
      const params = [userId, ...municipality_ids];

      await client.query(`
        INSERT INTO user_municipalities (user_id, municipality_id)
        VALUES ${values}
        ON CONFLICT DO NOTHING
      `, params);
    }

    await client.query('COMMIT');
    client.release();

    console.log(`[ADMIN] Создан пользователь: ${email} (${role}), муниципалитетов: ${municipality_ids.length}`);

    return res.status(201).json({
      success: true,
      user: newUser,
      municipality_ids
    });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();

    // Проверка на дублирование email
    if (err.code === '23505' && err.constraint === 'users_email_key') {
      return res.status(409).json({
        error: 'conflict',
        message: 'Пользователь с таким email уже существует'
      });
    }

    console.error('[ADMIN] Error creating user:', err);
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:id
 * Обновление пользователя (роль, активность, муниципалитеты)
 */
router.patch('/users/:id', async (req, res, next) => {
  const client = await pool.connect();

  try {
    const userId = Number(req.params.id);
    const { email, role, is_active, municipality_ids } = req.body || {};

    if (!userId) {
      client.release();
      return res.status(400).json({ error: 'bad_request', message: 'Некорректный ID' });
    }

    await client.query('BEGIN');

    // Обновляем базовые поля пользователя
    const updates = [];
    const params = [userId];
    let paramIndex = 2;

    if (email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      params.push(email);
    }

    if (role !== undefined) {
      if (!['admin', 'operator'].includes(role)) {
        client.release();
        return res.status(400).json({
          error: 'bad_request',
          message: 'Роль должна быть admin или operator'
        });
      }
      updates.push(`role = $${paramIndex++}`);
      params.push(role);
    }

    if (typeof is_active === 'boolean') {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }

    // Обновляем поля, если есть изменения
    if (updates.length > 0) {
      await client.query(`
        UPDATE users
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $1
      `, params);
    }

    // Обновляем привязки к муниципалитетам
    if (Array.isArray(municipality_ids)) {
      // Удаляем старые привязки
      await client.query(
        'DELETE FROM user_municipalities WHERE user_id = $1',
        [userId]
      );

      // Добавляем новые
      if (municipality_ids.length > 0) {
        const values = municipality_ids.map((munId, idx) => `($1, $${idx + 2})`).join(', ');
        const munParams = [userId, ...municipality_ids];

        await client.query(`
          INSERT INTO user_municipalities (user_id, municipality_id)
          VALUES ${values}
          ON CONFLICT DO NOTHING
        `, munParams);
      }
    }

    await client.query('COMMIT');
    client.release();

    console.log(`[ADMIN] Обновлен пользователь ID=${userId}`);

    return res.json({
      success: true,
      message: 'Пользователь обновлен'
    });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();

    console.error('[ADMIN] Error updating user:', err);
    next(err);
  }
});

/**
 * POST /api/admin/users/:id/password
 * Смена пароля пользователя
 */
router.post('/users/:id/password', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const { password } = req.body || {};

    if (!userId) {
      return res.status(400).json({ error: 'bad_request', message: 'Некорректный ID' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Пароль должен содержать минимум 6 символов'
      });
    }

    // Хешируем новый пароль
    const password_hash = await bcrypt.hash(password, 12);

    // Обновляем пароль
    const { rowCount } = await pool.query(`
      UPDATE users
      SET password_hash = $2, updated_at = NOW()
      WHERE id = $1
    `, [userId, password_hash]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Пользователь не найден' });
    }

    console.log(`[ADMIN] Обновлен пароль для пользователя ID=${userId}`);

    return res.json({
      success: true,
      message: 'Пароль успешно обновлен'
    });

  } catch (err) {
    console.error('[ADMIN] Error updating password:', err);
    next(err);
  }
});

/**
 * DELETE /api/admin/users/:id
 * Удаление пользователя
 */
router.delete('/users/:id', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);

    if (!userId) {
      return res.status(400).json({ error: 'bad_request', message: 'Некорректный ID' });
    }

    // Проверяем, не удаляет ли админ сам себя
    if (req.session.user.id === userId) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Нельзя удалить свою учетную запись'
      });
    }

    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Пользователь не найден' });
    }

    console.log(`[ADMIN] Удален пользователь ID=${userId}`);

    return res.json({
      success: true,
      message: 'Пользователь удален'
    });

  } catch (err) {
    console.error('[ADMIN] Error deleting user:', err);
    next(err);
  }
});

/**
 * GET /api/admin/users/:id/municipalities
 * Получить список муниципалитетов пользователя
 */
router.get('/users/:id/municipalities', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);

    if (!userId) {
      return res.status(400).json({ error: 'bad_request', message: 'Некорректный ID' });
    }

    const { rows } = await poolRO.query(`
      SELECT m.id, m.name
      FROM municipalities m
      JOIN user_municipalities um ON um.municipality_id = m.id
      WHERE um.user_id = $1
      ORDER BY m.name
    `, [userId]);

    return res.json(rows);

  } catch (err) {
    console.error('[ADMIN] Error fetching user municipalities:', err);
    next(err);
  }
});

module.exports = router;
