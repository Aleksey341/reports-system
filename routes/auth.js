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
      // Администратор: municipality_id = NULL
      user = await getUserByMunicipalityId(null);
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
      is_active: user.is_active
    };

    console.log(`[AUTH] Успешный вход: ${user.municipality_name || 'Администратор'} (${user.role})`);

    return res.json({
      success: true,
      user: {
        id: user.id,
        municipality_id: user.municipality_id,
        municipality_name: user.municipality_name,
        role: user.role
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

module.exports = router;
