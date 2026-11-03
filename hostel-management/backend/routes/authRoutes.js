const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../utils/validator');
const { PASSWORD_RULE } = require('../utils/password');

const router = express.Router();

// Brute-force protection: 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
});

router.post(
  '/login',
  loginLimiter,
  validate({
    identifier: { type: 'string', required: true, max: 150, label: 'Email or username' },
    password: { type: 'string', required: true, max: 100 },
  }),
  ctrl.login
);

router.use(authenticate);
router.get('/me', ctrl.me);
router.post('/logout', ctrl.logout);
router.put(
  '/profile',
  validate({ full_name: { type: 'string', required: true, max: 150 }, phone: { type: 'phone' } }),
  ctrl.updateProfile
);
router.put(
  '/change-password',
  validate({ current_password: { type: 'string', required: true, max: 100 }, new_password: PASSWORD_RULE }),
  ctrl.changePassword
);

module.exports = router;
