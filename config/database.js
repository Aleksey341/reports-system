// config/database.js
'use strict';
const { Pool } = require('pg');

const ssl =
  String(process.env.DB_SSL || '').toLowerCase() === 'true'
    ? { rejectUnauthorized: false }
    : false;

const pool = new Pool({
  host: process.env.DB_HOST,            // <— из переменных
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl,
});

const poolRO = new Pool({
  host: process.env.DB_HOST_RO || process.env.DB_HOST, // <— fallback на DB_HOST
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl,
});

module.exports = { pool, poolRO };
