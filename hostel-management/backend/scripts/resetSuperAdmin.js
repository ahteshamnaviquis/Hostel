/**
 * Creates the Super Admin, or resets its password, from the values in .env:
 *   SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD
 *
 *   npm run admin:reset
 *
 * Use this if you cannot log in as Super Admin. The account is also re-activated.
 */
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const env = require('../config/env');

async function main() {
  const { name, email, password } = env.superAdmin;
  const conn = await mysql.createConnection({
    host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password, database: env.db.database,
  });
  try {
    const [[role]] = await conn.query("SELECT id FROM roles WHERE name = 'super_admin'");
    if (!role) throw new Error('Tables are missing. Run "npm run db:init" first.');
    const hash = await bcrypt.hash(password, 12);
    const [[user]] = await conn.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (user) {
      await conn.query(
        `UPDATE users SET password_hash = ?, role_id = ?, status = 'active', deleted_at = NULL, password_changed_at = NOW() WHERE id = ?`,
        [hash, role.id, user.id]
      );
      console.log(`[admin:reset] Password reset for ${email}`);
    } else {
      await conn.query(
        `INSERT INTO users (role_id, full_name, email, password_hash, status) VALUES (?, ?, ?, ?, 'active')`,
        [role.id, name, email.toLowerCase(), hash]
      );
      console.log(`[admin:reset] Super Admin created: ${email}`);
    }
    console.log('[admin:reset] Log in with the email and password from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD in .env');
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(`[admin:reset] FAILED: ${e.code || ''} ${e.message}`);
  process.exit(1);
});
