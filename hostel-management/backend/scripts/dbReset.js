/**
 * DEVELOPMENT ONLY: deletes the whole database (all data!) and re-creates it with db:init.
 *
 *   npm run db:reset
 *
 * Use when a previous db:init failed half-way. Refuses to run when NODE_ENV=production.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function main() {
  if (env.isProduction) throw new Error('db:reset is disabled when NODE_ENV=production');
  const { host, port, user, password, database } = env.db;
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error(`Invalid DB_NAME "${database}"`);

  const conn = await mysql.createConnection({ host, port, user, password });
  try {
    console.log(`[db:reset] Dropping database "${database}" on ${host}:${port} ...`);
    await conn.query(`DROP DATABASE IF EXISTS \`${database}\``);
  } finally {
    await conn.end();
  }
  console.log('[db:reset] Re-creating with db:init ...\n');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'dbInit.js')], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

main().catch((e) => {
  console.error(`[db:reset] FAILED: ${e.code || ''} ${e.message}`);
  process.exit(1);
});
