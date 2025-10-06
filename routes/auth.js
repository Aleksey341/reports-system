// routes/auth.js
'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const { getUserByEmail, getUserByMunicipalityId, requireAuth } = require('../middleware/auth');

/* ========== API Авторизации ========== */

/**
 * POST /api/auth/login
 * Вход в систему (municipality_id + password)
 * municipality_id = "admin" для администратора
 * municipality_id = число для обычного пользователя
 */
router.post('/login', async (req, res, next) => {
  try {
    console.log('[AUTH] Login attempt:', { municipality_id: req.body?.municipality_id, hasPassword: !!req.body?.password });

    const { municipality_id, password } = req.body || {};

    if (!municipality_id || !password) {
      console.log('[AUTH] Missing credentials');
      return res.status(400).json({
        error: 'bad_request',
        message: 'Муниципалитет и пароль обязательны'
      });
    }

    // Поиск пользователя
    let user;
    if (municipality_id === 'admin') {
      console.log('[AUTH] Looking for admin user');
      // Администратор: municipality_id = NULL, role = 'admin'
      user = await getUserByMunicipalityId(null);
      // Дополнительная проверка роли
      if (user && user.role !== 'admin') {
        user = null;
      }
    } else if (municipality_id === 'governor') {
      console.log('[AUTH] Looking for governor user');
      // Губернатор: municipality_id = NULL, role = 'governor'
      const { pool } = require('../config/database');
      const result = await pool.query(
        `SELECT u.id, u.municipality_id, u.password_hash, u.role,
                u.is_active, 'Губернатор Липецкой области' as municipality_name
         FROM users u
         WHERE u.role = 'governor'`
      );
      user = result.rows[0] || null;
    } else {
      // Обычный пользователь: municipality_id = число
      const munId = Number(municipality_id);
      console.log('[AUTH] Looking for user with municipality_id:', munId);
      if (isNaN(munId)) {
        return res.status(400).json({
          error: 'bad_request',
          message: 'Неверный формат ID муниципалитета'
        });
      }
      user = await getUserByMunicipalityId(munId);
    }

    console.log('[AUTH] User found:', user ? `ID=${user.id}, role=${user.role}` : 'NOT FOUND');

    if (!user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Неверный муниципалитет или пароль'
      });
    }

    // Проверка активности
    if (!user.is_active) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Учетная запись заблокирована'
      });
    }

    // Проверка пароля
    console.log('[AUTH] Checking password...');
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    console.log('[AUTH] Password match:', passwordMatch);

    if (!passwordMatch) {
      console.log('[AUTH] Password mismatch - login failed');
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Неверный муниципалитет или пароль'
      });
    }

    // Создание сессии
    req.session.user = {
      id: user.id,
      municipality_id: user.municipality_id,
      municipality_name: user.municipality_name,
      role: user.role,
      is_active: user.is_active,
      password_reset_required: user.password_reset_required || false
    };

    console.log(`[AUTH] Успешный вход: ${user.municipality_name || 'Администратор'} (${user.role})`);

    return res.json({
      success: true,
      user: {
        id: user.id,
        municipality_id: user.municipality_id,
        municipality_name: user.municipality_name,
        role: user.role,
        password_reset_required: user.password_reset_required || false
      }
    });

  } catch (err) {
    console.error('[AUTH] Login error:', err);
    next(err);
  }
});

/**
 * POST /api/auth/logout
 * Выход из системы
 */
router.post('/logout', (req, res) => {
  const userEmail = req.session?.user?.email || 'unknown';

  req.session.destroy((err) => {
    if (err) {
      console.error('[AUTH] Logout error:', err);
      return res.status(500).json({
        error: 'internal',
        message: 'Ошибка при выходе'
      });
    }

    console.log(`[AUTH] Выход: ${userEmail}`);

    res.clearCookie('sid'); // sid - имя cookie из настроек сессии

    return res.json({
      success: true,
      message: 'Вы успешно вышли из системы'
    });
  });
});

/**
 * GET /api/auth/me
 * Получение информации о текущем пользователе
 */
router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({
      user: {
        id: req.session.user.id,
        municipality_id: req.session.user.municipality_id,
        municipality_name: req.session.user.municipality_name,
        role: req.session.user.role
      }
    });
  }

  return res.status(401).json({
    error: 'unauthorized',
    message: 'Не авторизован'
  });
});

/**
 * POST /api/auth/check-session
 * Проверка валидности сессии (для периодических проверок на фронте)
 */
router.post('/check-session', requireAuth, (req, res) => {
  return res.json({
    valid: true,
    user: {
      id: req.session.user.id,
      municipality_id: req.session.user.municipality_id,
      municipality_name: req.session.user.municipality_name,
      role: req.session.user.role
    }
  });
});

/**
 * POST /api/auth/change-password
 * Смена собственного пароля
 */
router.post('/change-password', requireAuth, async (req, res, next) => {
  const { pool } = require('../config/database');

  try {
    const { current_password, new_password } = req.body || {};
    const userId = req.session.user.id;

    console.log(`[AUTH] Password change attempt for user ID=${userId}`);

    // Валидация
    if (!current_password || !new_password) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Текущий и новый пароль обязательны'
      });
    }

    if (new_password.length < 6) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Новый пароль должен содержать минимум 6 символов'
      });
    }

    if (current_password === new_password) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Новый пароль должен отличаться от текущего'
      });
    }

    // Получаем текущий хеш пароля
    const { rows } = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Пользователь не найден'
      });
    }

    // Проверяем текущий пароль
    const passwordMatch = await bcrypt.compare(current_password, rows[0].password_hash);

    if (!passwordMatch) {
      console.log(`[AUTH] Current password mismatch for user ID=${userId}`);
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Текущий пароль неверен'
      });
    }

    // Хешируем новый пароль
    const newPasswordHash = await bcrypt.hash(new_password, 12);

    // Обновляем пароль и сбрасываем флаг принудительной смены
    await pool.query(`
      UPDATE users
      SET password_hash = $1,
          password_reset_required = FALSE,
          last_password_change = NOW(),
          updated_at = NOW()
      WHERE id = $2
    `, [newPasswordHash, userId]);

    console.log(`[AUTH] Password successfully changed for user ID=${userId}`);

    return res.json({
      success: true,
      message: 'Пароль успешно изменён'
    });

  } catch (err) {
    console.error('[AUTH] Change password error:', err);
    next(err);
  }
});

/**
 * POST /api/auth/generate-hash
 * Временный endpoint для генерации bcrypt хеша
 * УДАЛИТЬ ПОСЛЕ НАСТРОЙКИ!
 */
router.post('/generate-hash', async (req, res) => {
  try {
    const { password } = req.body || {};

    if (!password) {
      return res.status(400).json({ error: 'Пароль обязателен' });
    }

    const hash = await bcrypt.hash(password, 12);

    console.log(`[HASH] Generated hash for password: ${password}`);
    console.log(`[HASH] Hash: ${hash}`);

    return res.json({
      password: password,
      hash: hash,
      sql: `UPDATE users SET password_hash = '${hash}', updated_at = NOW() WHERE municipality_id IS NULL;`
    });

  } catch (err) {
    console.error('[HASH] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
