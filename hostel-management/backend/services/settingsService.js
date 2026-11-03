/**
 * System settings with a short in-memory cache.
 */
const { query } = require('../config/db');

let cache = null;
let cacheTime = 0;
const TTL_MS = 30 * 1000;

const castValue = (row) => {
  if (row.value_type === 'number') return Number(row.setting_value);
  if (row.value_type === 'boolean') return row.setting_value === 'true';
  if (row.value_type === 'json') {
    try {
      return JSON.parse(row.setting_value);
    } catch {
      return null;
    }
  }
  return row.setting_value;
};

/** All global settings as a { key: value } object. */
async function getSettings() {
  if (cache && Date.now() - cacheTime < TTL_MS) return cache;
  const rows = await query('SELECT setting_key, setting_value, value_type FROM system_settings WHERE hostel_id IS NULL');
  cache = Object.fromEntries(rows.map((r) => [r.setting_key, castValue(r)]));
  cacheTime = Date.now();
  return cache;
}

async function getSetting(key, fallback = null) {
  const settings = await getSettings();
  return settings[key] !== undefined && settings[key] !== null ? settings[key] : fallback;
}

const clearCache = () => {
  cache = null;
};

module.exports = { getSettings, getSetting, clearCache, castValue };
