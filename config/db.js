// config/db.js — Pool de connexions MySQL (promesses)
const mysql = require('mysql2/promise');
require('dotenv').config();

let pool;

function getPool() {
  if (pool) return pool;

  // Support URL complète (Render / Railway / PlanetScale)
  if (process.env.DATABASE_URL) {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : undefined,
    });
  } else {
    pool = mysql.createPool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '3306'),
      user:     process.env.DB_USER     || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME     || 'autofranchise',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
      timezone: '+00:00',
    });
  }

  return pool;
}

// ── Tester la connexion ──────────────────────────────────────────
async function testConnection() {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT 1 AS ok');
    console.log('✅ MySQL connecté avec succès');
    return true;
  } catch (err) {
    console.error('❌ Erreur connexion MySQL :', err.message);
    return false;
  }
}

// ── Helper : exécuter une requête ────────────────────────────────
async function query(sql, params = []) {
  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// ── Helper : récupérer un seul enregistrement ────────────────────
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// ── Helper : transaction ─────────────────────────────────────────
async function transaction(callback) {
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { getPool, testConnection, query, queryOne, transaction };
