/**
 * Small shared helpers: pagination, document numbers, dates, money.
 */
const crypto = require('crypto');

/** Parses page/limit from the validated query and returns SQL pieces + meta builder. */
function paginate(q = {}) {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(q.limit) || 20));
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    meta: (total) => ({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }),
  };
}

/** Temporary unique value used before the real, id-based number is assigned. */
const tempNumber = () => `TMP-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`;

/**
 * Assigns a readable document number based on the row id, e.g. RCP-000042.
 * table/column/prefix are code constants.
 */
async function assignNumber(conn, table, column, prefix, id) {
  const number = `${prefix}-${String(id).padStart(6, '0')}`;
  await conn.query(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [number, id]);
  return number;
}

/** Today's date in Pakistan time as YYYY-MM-DD. */
function today() {
  return new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Current month in Pakistan time as YYYY-MM. */
const currentMonth = () => today().slice(0, 7);

/** Adds days to a YYYY-MM-DD date. */
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** First and last day of a YYYY-MM month. */
function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}

/** Rounds to 2 decimals (money). */
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

module.exports = { paginate, tempNumber, assignNumber, today, currentMonth, addDays, monthRange, money };
