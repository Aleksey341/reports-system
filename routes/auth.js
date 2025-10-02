// routes/auth.js
'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const { getUserByEmail, requireAuth } = require('../middleware/auth');

/* ========== API Авторизации ========== */

/**
 * POST /api/auth/login
 * Вход в систему
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Email и пароль обязательны'
      });
    }

    // Поиск пользователя
    const user = await getUserByEmail(email);

    if (!user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Неверный email или пароль'
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
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Неверный email или пароль'
      });
    }

    // Создание сессии
    req.session.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      is_active: user.is_active
    };

    console.log(`[AUTH] Успешный вход: ${user.email} (${user.role})`);

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
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
        email: req.session.user.email,
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
      email: req.session.user.email,
      role: req.session.user.role
    }
  });
});

module.exports = router;
