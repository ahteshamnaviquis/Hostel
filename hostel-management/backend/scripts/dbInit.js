/**
 * Database initialisation / migration runner.
 *
 *   npm run db:init
 *
 * 1. Creates the database (if it does not exist)
 * 2. Applies pending SQL files from database/migrations in filename order
 *    (each applied file is recorded in the schema_migrations table)
 * 3. Runs all seed files from database/seeds (seeds are idempotent)
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations');
const SEEDS_DIR = path.join(__dirname, '..', 'database', 'seeds');

const listSqlFiles = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort() : [];

async function main() {
  const { host, port, user, password, database } = env.db;

  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(`Invalid DB_NAME "${database}" - use letters, numbers and underscores only`);
  }

  console.log(`[db:init] Connecting to MySQL at ${host}:${port} as ${user} ...`);
  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    multipleStatements: true, // only used by this trusted script, never by the API
    charset: 'utf8mb4',
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await connection.query(`USE \`${database}\``);
    console.log(`[db:init] Using database "${database}"`);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       VARCHAR(255) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [appliedRows] = await connection.query('SELECT name FROM schema_migrations');
    const applied = new Set(appliedRows.map((row) => row.name));

    // Migrations
    const migrations = listSqlFiles(MIGRATIONS_DIR);
    let appliedCount = 0;
    for (const file of migrations) {
      if (applied.has(file)) continue;
      console.log(`[db:init] Applying migration ${file} ...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      // Note: MySQL DDL statements auto-commit, so a failed migration may be partially applied.
      await connection.query(sql);
      await connection.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      appliedCount += 1;
    }
    console.log(
      appliedCount
        ? `[db:init] ${appliedCount} migration(s) applied`
        : '[db:init] Schema is up to date - no pending migrations'
    );

    // Seeds
    for (const file of listSqlFiles(SEEDS_DIR)) {
      console.log(`[db:init] Running seed ${file} ...`);
      await connection.query(fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8'));
    }

    const [[{ tableCount }]] = await connection.query(
      'SELECT COUNT(*) AS tableCount FROM information_schema.tables WHERE table_schema = ?',
      [database]
    );
    console.log(`[db:init] Done. Database "${database}" has ${tableCount} tables.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(`[db:init] FAILED: ${error.code || ''} ${error.message}`);
  process.exit(1);
});
