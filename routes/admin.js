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
        u.id,
        u.municipality_id,
        m.name as municipality_name,
        u.role,
        u.is_active,
        u.created_at,
        u.updated_at
      FROM users u
      LEFT JOIN municipalities m ON m.id = u.municipality_id
      ORDER BY u.created_at DESC
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
      SELECT
        u.id,
        u.municipality_id,
        m.name as municipality_name,
        u.role,
        u.is_active,
        u.created_at,
        u.updated_at
      FROM users u
      LEFT JOIN municipalities m ON m.id = u.municipality_id
      WHERE u.id = $1
    `, [userId]);

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'not_found', message: 'Пользователь не найден' });
    }

    return res.json(userRows[0]);
  } catch (err) {
    console.error('[ADMIN] Error fetching user:', err);
    next(err);
  }
});

/**
 * POST /api/admin/users
 * Создание нового пользователя
 * municipality_id = null для администратора
 * municipality_id = число для обычного пользователя
 */
router.post('/users', async (req, res, next) => {
  try {
    const {
      municipality_id,
      password,
      role = 'operator',
      is_active = true
    } = req.body || {};

    // Валидация
    if (municipality_id === undefined || municipality_id === '') {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Муниципалитет обязателен'
      });
    }

    if (!password) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Пароль обязателен'
      });
    }

    if (!['admin', 'operator'].includes(role)) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Роль должна быть admin или operator'
      });
    }

    // Хешируем пароль
    const password_hash = await bcrypt.hash(password, 12);

    // Создаем пользователя
    const { rows } = await pool.query(`
      INSERT INTO users (municipality_id, password_hash, role, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING id, municipality_id, role, is_active, created_at
    `, [municipality_id, password_hash, role, is_active]);

    const newUser = rows[0];

    console.log(`[ADMIN] Создан пользователь: municipality_id=${municipality_id} (${role})`);

    return res.status(201).json({
      success: true,
      user: newUser
    });

  } catch (err) {
    // Проверка на дублирование municipality_id
    if (err.code === '23505' && err.constraint === 'users_municipality_id_key') {
      return res.status(409).json({
        error: 'conflict',
        message: 'Пользователь для этого муниципалитета уже существует'
      });
    }

    console.error('[ADMIN] Error creating user:', err);
    next(err);
  }
});

/**
 * PATCH /api/admin/users/:id
 * Обновление пользователя (муниципалитет, роль, активность)
 */
router.patch('/users/:id', async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const { municipality_id, role, is_active } = req.body || {};

    if (!userId) {
      return res.status(400).json({ error: 'bad_request', message: 'Некорректный ID' });
    }

    // Обновляем базовые поля пользователя
    const updates = [];
    const params = [userId];
    let paramIndex = 2;

    if (municipality_id !== undefined) {
      updates.push(`municipality_id = $${paramIndex++}`);
      params.push(municipality_id);
    }

    if (role !== undefined) {
      if (!['admin', 'operator'].includes(role)) {
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
      await pool.query(`
        UPDATE users
        SET ${updates.join(', ')}, updated_at = NOW()
        WHERE id = $1
      `, params);
    }

    console.log(`[ADMIN] Обновлен пользователь ID=${userId}`);

    return res.json({
      success: true,
      message: 'Пользователь обновлен'
    });

  } catch (err) {
    // Проверка на дублирование municipality_id
    if (err.code === '23505' && err.constraint === 'users_municipality_id_key') {
      return res.status(409).json({
        error: 'conflict',
        message: 'Пользователь для этого муниципалитета уже существует'
      });
    }

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

module.exports = router;
