import axios from 'axios';

/**
 * Shared Axios instance for all backend calls.
 * The frontend never talks to MySQL directly - everything goes through the REST API.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

// Normalise errors to a readable message: error.userMessage
api.interceptors.response.use(
  (response) => response,
  (error) => {
    error.userMessage =
      error.response?.data?.message ||
      (error.code === 'ECONNABORTED' ? 'The server took too long to respond' : null) ||
      (error.request && !error.response ? 'Cannot reach the server. Is the backend running?' : null) ||
      error.message ||
      'Something went wrong';
    return Promise.reject(error);
  }
);

// CHUNK 2 will add a request interceptor that attaches the JWT token
// and a 401 handler that logs the user out.

export default api;
