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

/**
 * Получить пользователя по ID муниципалитета
 * @param {number|null} municipalityId - ID муниципалитета или null для администратора
 */
async function getUserByMunicipalityId(municipalityId) {
  try {
    let query, params;

    if (municipalityId === null) {
      // Администратор
      query = `
        SELECT u.id, u.municipality_id, u.password_hash, u.role, u.is_active, NULL as municipality_name
        FROM users u
        WHERE u.municipality_id IS NULL
      `;
      params = [];
    } else {
      // Обычный пользователь
      query = `
        SELECT u.id, u.municipality_id, u.password_hash, u.role, u.is_active, m.name as municipality_name
        FROM users u
        LEFT JOIN municipalities m ON m.id = u.municipality_id
        WHERE u.municipality_id = $1
      `;
      params = [municipalityId];
    }

    const { rows } = await poolRO.query(query, params);
    return rows[0] || null;
  } catch (err) {
    console.error('getUserByMunicipalityId error:', err);
    return null;
  }
}

async function getUserById(id) {
  try {
    const { rows } = await poolRO.query(
      `SELECT u.id, u.municipality_id, u.role, u.is_active, m.name as municipality_name
       FROM users u
       LEFT JOIN municipalities m ON m.id = u.municipality_id
       WHERE u.id = $1`,
      [id]
    );
    return rows[0] || null;
  } catch (err) {
    console.error('getUserById error:', err);
    return null;
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
 * Оператор - только к своему муниципалитету
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
    const requestedMunicipalityId = Number(req.body?.municipality_id) || Number(req.query?.municipality_id);

    if (!requestedMunicipalityId) {
      return res.status(400).json({ error: 'bad_request', message: 'Не указан municipality_id' });
    }

    // Проверяем, что оператор работает со своим муниципалитетом
    if (user.municipality_id !== requestedMunicipalityId) {
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
  getUserByMunicipalityId,
  getUserById,
  requireAuth,
  requireAdmin,
  requireRole,
  requireMunicipalityAccess
};
