import api from './api';

/** GET /api/health - returns the health report (also when the DB is down / 503). */
export async function getApiHealth() {
  try {
    const { data } = await api.get('/health');
    return data.data;
  } catch (error) {
    if (error.response?.data?.data) return error.response.data.data;
    throw error;
  }
}
