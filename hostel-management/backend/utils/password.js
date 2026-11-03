const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

/** Password policy: 8+ characters with at least one letter and one number. */
const PASSWORD_RULE = {
  type: 'string',
  required: true,
  min: 8,
  max: 100,
  pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
  patternMessage: 'Password must contain at least one letter and one number',
};

const hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);
const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

module.exports = { hashPassword, verifyPassword, PASSWORD_RULE };
