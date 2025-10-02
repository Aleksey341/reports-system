// middleware/auth.js
'use strict';

const { pool, poolRO } = require('../config/database');

/* ========== Вспомогательные функции для работы с пользователями ========== */

async function getUserByEmail(email) {
  try {
    const { rows } = await poolRO.query(
      'SELECT id, email, password_hash, role, is_active FROM users WHERE email = $1',
      [email]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('getUserByEmail error:', err);
    return null;
  }
}

async function getUserById(id) {
  try {
    const { rows } = await poolRO.query(
      'SELECT id, email, role, is_active FROM users WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('getUserById error:', err);
    return null;
  }
}

async function getUserMunicipalities(userId) {
  try {
    const { rows } = await poolRO.query(
      'SELECT municipality_id FROM user_municipalities WHERE user_id = $1',
      [userId]
    );
    return rows.map(r => r.municipality_id);
  } catch (err) {
    console.error('getUserMunicipalities error:', err);
    return [];
  }
}

/* ========== Middleware для защиты роутов ========== */

/**
 * Проверка авторизации пользователя
 * Требует наличие активной сессии
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.user && req.session.user.is_active !== false) {
    return next();
  }
  return res.status(401).json({ error: 'unauthorized', message: 'Требуется авторизация' });
}

/**
 * Проверка роли администратора
 * Должна вызываться после requireAuth
 */
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Требуется авторизация' });
  }

  if (req.session.user.role === 'admin') {
    return next();
  }

  return res.status(403).json({ error: 'forbidden', message: 'Доступ запрещен. Требуется роль администратора' });
}

/**
 * Проверка роли (гибкая версия)
 * @param {string} role - требуемая роль
 */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Требуется авторизация' });
    }

    const userRole = req.session.user.role;

    // Админ имеет доступ везде
    if (userRole === 'admin') {
      return next();
    }

    // Проверяем требуемую роль
    if (userRole === role) {
      return next();
    }

    return res.status(403).json({ error: 'forbidden', message: `Доступ запрещен. Требуется роль: ${role}` });
  };
}

/**
 * Проверка доступа к муниципалитету
 * Администратор имеет доступ ко всем муниципалитетам
 * Оператор - только к назначенным ему
 */
async function requireMunicipalityAccess(req, res, next) {
  try {
    const user = req.session?.user;

    if (!user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Требуется авторизация' });
    }

    // Админ имеет доступ ко всем муниципалитетам
    if (user.role === 'admin') {
      return next();
    }

    // Получаем municipality_id из body или query
    const municipalityId = Number(req.body?.municipality_id) || Number(req.query?.municipality_id);

    if (!municipalityId) {
      return res.status(400).json({ error: 'bad_request', message: 'Не указан municipality_id' });
    }

    // Проверяем доступ оператора к муниципалитету
    const { rows } = await poolRO.query(
      'SELECT 1 FROM user_municipalities WHERE user_id = $1 AND municipality_id = $2',
      [user.id, municipalityId]
    );

    if (rows.length === 0) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'У вас нет доступа к этому муниципалитету'
      });
    }

    return next();
  } catch (err) {
    console.error('requireMunicipalityAccess error:', err);
    return res.status(500).json({ error: 'internal', message: 'Ошибка проверки доступа' });
  }
}

module.exports = {
  getUserByEmail,
  getUserById,
  getUserMunicipalities,
  requireAuth,
  requireAdmin,
  requireRole,
  requireMunicipalityAccess
};
