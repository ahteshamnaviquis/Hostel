/**
 * Small, dependency-free request validator.
 *
 *   router.post('/', validate({ name: { type: 'string', required: true, max: 150 } }), handler)
 *
 * - Only fields declared in the schema are kept (prevents mass-assignment).
 * - Values are converted to the declared type; empty strings become null.
 * - Errors are returned together as 422 { details: { field: message } }.
 *
 * Rule options: type, required, min, max, enum, default, label, items (for arrays), pattern
 * Types: string, text, int, number, money, bool, date, time, month, email, phone, cnic, array, object, id
 */
const ApiError = require('./ApiError');

const PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  // Pakistani mobile (03XX-XXXXXXX / +923XXXXXXXXX) or landline (042-35761234). Lenient on separators.
  phone: /^\+?[0-9][0-9\s-]{6,18}$/,
  cnic: /^\d{5}-?\d{7}-?\d$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  time: /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
  month: /^\d{4}-(0[1-9]|1[0-2])$/,
};

const humanize = (field) => field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function isValidDate(value) {
  if (!PATTERNS.date.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Validates a single value. Returns [cleanValue, errorMessage]. */
function checkValue(rawValue, rule, label) {
  let value = rawValue;
  if (typeof value === 'string' && !['text'].includes(rule.type)) value = value.trim();
  const empty = value === undefined || value === null || value === '';

  if (empty) {
    if (rule.required) return [null, `${label} is required`];
    return [rule.default !== undefined ? rule.default : null, null];
  }

  switch (rule.type) {
    case 'id':
    case 'int': {
      const n = Number(value);
      if (!Number.isInteger(n)) return [null, `${label} must be a whole number`];
      if (rule.type === 'id' && n < 1) return [null, `${label} is invalid`];
      if (rule.min !== undefined && n < rule.min) return [null, `${label} must be at least ${rule.min}`];
      if (rule.max !== undefined && n > rule.max) return [null, `${label} must be at most ${rule.max}`];
      value = n;
      break;
    }
    case 'number':
    case 'money': {
      const n = Number(value);
      if (!Number.isFinite(n)) return [null, `${label} must be a number`];
      const min = rule.min !== undefined ? rule.min : rule.type === 'money' ? 0 : undefined;
      if (min !== undefined && n < min) return [null, `${label} must be at least ${min}`];
      if (rule.max !== undefined && n > rule.max) return [null, `${label} must be at most ${rule.max}`];
      value = rule.type === 'money' ? Math.round(n * 100) / 100 : n;
      break;
    }
    case 'bool':
      if (typeof value === 'boolean') break;
      if (['true', '1', 1, 'yes', 'on'].includes(value)) value = true;
      else if (['false', '0', 0, 'no', 'off'].includes(value)) value = false;
      else return [null, `${label} must be true or false`];
      break;
    case 'date':
      if (!isValidDate(String(value))) return [null, `${label} must be a valid date (YYYY-MM-DD)`];
      value = String(value);
      break;
    case 'time':
      if (!PATTERNS.time.test(String(value))) return [null, `${label} must be a valid time (HH:MM)`];
      value = String(value).length === 5 ? `${value}:00` : String(value);
      break;
    case 'month':
      if (!PATTERNS.month.test(String(value))) return [null, `${label} must be a valid month (YYYY-MM)`];
      break;
    case 'email':
      value = String(value).toLowerCase();
      if (!PATTERNS.email.test(value) || value.length > 150) return [null, `${label} must be a valid email address`];
      break;
    case 'phone':
      value = String(value);
      if (!PATTERNS.phone.test(value)) return [null, `${label} must be a valid phone number (e.g. 0300-1234567)`];
      break;
    case 'cnic': {
      value = String(value);
      if (!PATTERNS.cnic.test(value)) return [null, `${label} must be a valid CNIC / B-Form (12345-1234567-1)`];
      const digits = value.replace(/-/g, '');
      value = `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
      break;
    }
    case 'array': {
      let arr = value;
      if (typeof arr === 'string') {
        try {
          arr = JSON.parse(arr);
        } catch {
          arr = arr.split(',').map((v) => v.trim()).filter(Boolean);
        }
      }
      if (!Array.isArray(arr)) return [null, `${label} must be a list`];
      if (rule.max !== undefined && arr.length > rule.max) return [null, `${label} has too many items`];
      if (rule.items) {
        const cleaned = [];
        for (let i = 0; i < arr.length; i += 1) {
          if (rule.items.type === 'object') {
            const [obj, errs] = validateObject(arr[i] || {}, rule.items.schema);
            if (errs) return [null, `${label} #${i + 1}: ${Object.values(errs)[0]}`];
            cleaned.push(obj);
          } else {
            const [v, err] = checkValue(arr[i], { ...rule.items, required: true }, `${label} item`);
            if (err) return [null, err];
            cleaned.push(v);
          }
        }
        arr = cleaned;
      }
      if (rule.required && arr.length === 0) return [null, `${label} must contain at least one item`];
      value = arr;
      break;
    }
    case 'text':
    case 'string':
    default:
      value = String(value);
      if (rule.type === 'text') value = value.trim();
      if (rule.min !== undefined && value.length < rule.min) return [null, `${label} must be at least ${rule.min} characters`];
      if (value.length > (rule.max || 255)) return [null, `${label} must be at most ${rule.max || 255} characters`];
      if (rule.pattern && !rule.pattern.test(value)) return [null, rule.patternMessage || `${label} has an invalid format`];
      break;
  }

  if (rule.enum && !rule.enum.includes(value)) {
    return [null, `${label} must be one of: ${rule.enum.join(', ')}`];
  }
  return [value, null];
}

function validateObject(source, schema) {
  const clean = {};
  const errors = {};
  Object.entries(schema).forEach(([field, rule]) => {
    const label = rule.label || humanize(field);
    const [value, error] = checkValue(source[field], rule, label);
    if (error) errors[field] = error;
    else if (value !== null || source[field] !== undefined || rule.default !== undefined) clean[field] = value;
  });
  return [clean, Object.keys(errors).length ? errors : null];
}

/**
 * Express middleware. source = 'body' | 'query'.
 * Cleaned body replaces req.body; cleaned query is placed on req.q.
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  const [clean, errors] = validateObject(source === 'query' ? req.query : req.body || {}, schema);
  if (errors) return next(new ApiError(422, 'Please correct the highlighted fields', errors));
  if (source === 'query') req.q = clean;
  else req.body = clean;
  return next();
};

/** Validate route params that must be positive integer ids. */
const validateId = (...names) => (req, res, next) => {
  for (const name of names.length ? names : ['id']) {
    const n = Number(req.params[name]);
    if (!Number.isInteger(n) || n < 1) return next(ApiError.badRequest(`Invalid ${name}`));
    req.params[name] = n;
  }
  return next();
};

// Reusable query-string schema for paginated lists
const listQuery = (extra = {}) => ({
  page: { type: 'int', min: 1, default: 1 },
  limit: { type: 'int', min: 1, max: 200, default: 20 },
  search: { type: 'string', max: 100 },
  hostel_id: { type: 'id' },
  ...extra,
});

module.exports = { validate, validateId, validateObject, listQuery, PATTERNS };
