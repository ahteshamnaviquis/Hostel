/**
 * MySQL connection pool (mysql2/promise).
 *
 * Always use parameterised queries:  query('SELECT * FROM x WHERE id = ?', [id])
 * Use withTransaction() for financial and room-allocation operations.
 */
const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  connectionLimit: env.db.connectionLimit,
  timezone: env.db.timezone,
  waitForConnections: true,
  queueLimit: 0,
  dateStrings: true, // return DATE/DATETIME as strings - avoids timezone shifting of dates
  decimalNumbers: true, // return DECIMAL columns as JS numbers
  charset: 'utf8mb4',
});

// Run every session in Pakistan time so NOW(), CURDATE() and TIMESTAMP columns are PKT.
pool.pool.on('connection', (connection) => {
  connection.query('SET time_zone = ?', [env.db.timezone]);
});

/**
 * Run a parameterised query and return the rows.
 * Uses client-side escaping (pool.query) so arrays work with IN (?) and LIMIT ? accepts numbers.
 * Never concatenate user input into SQL - always pass it through params.
 */
async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

/** Returns the first row or null. */
async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

/**
 * Run a callback inside a database transaction.
 * The callback receives a dedicated connection; commit/rollback is automatic.
 */
async function withTransaction(callback) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Lightweight connectivity check used by the health endpoint. */
async function ping() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    return true;
  } finally {
    connection.release();
  }
}

module.exports = { pool, query, queryOne, withTransaction, ping };
