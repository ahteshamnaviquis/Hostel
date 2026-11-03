/**
 * Database access for system-level information.
 * Models contain SQL only - no HTTP/Express concerns.
 */
const { query } = require('../config/db');

/** Returns the database server version and the list of applied migrations. */
async function getDatabaseInfo() {
  const [versionRow] = await query('SELECT VERSION() AS version');
  let migrations = [];
  try {
    migrations = await query('SELECT name, applied_at FROM schema_migrations ORDER BY name');
  } catch (error) {
    if (error.code !== 'ER_NO_SUCH_TABLE') throw error; // database not initialised yet
  }
  return { version: versionRow.version, migrations };
}

module.exports = { getDatabaseInfo };
