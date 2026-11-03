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

/** Run a parameterised query and return the rows. */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
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

module.exports = { pool, query, withTransaction, ping };
