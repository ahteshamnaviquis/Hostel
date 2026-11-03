import axios from 'axios';

/**
 * Shared Axios instance for all backend calls.
 * The frontend never talks to MySQL directly - everything goes through the REST API.
 */
const TOKEN_KEY = 'hms_token';

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token, remember = true) {
    try {
      this.clear();
      (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalise errors to a readable message: error.userMessage, error.fieldErrors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    let data = error.response?.data;
    // Blob responses (file downloads) carry JSON errors as blobs
    if (data instanceof Blob) {
      try {
        data = JSON.parse(await data.text());
      } catch {
        data = null;
      }
    }
    error.userMessage =
      data?.message ||
      (error.code === 'ECONNABORTED' ? 'The server took too long to respond' : null) ||
      (error.request && !error.response ? 'Cannot reach the server. Please check your connection.' : null) ||
      error.message ||
      'Something went wrong';
    error.fieldErrors = data?.details || {};
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      window.dispatchEvent(new CustomEvent('hms:unauthorized', { detail: error.userMessage }));
    }
    return Promise.reject(error);
  }
);

/** Removes empty values so they are not sent as query params. */
export const cleanParams = (params = {}) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined && v !== false));

/** Downloads a file from the API (with auth) and saves it. */
export async function downloadFile(url, params, fallbackName = 'download') {
  const res = await api.get(url, { params: cleanParams(params), responseType: 'blob' });
  const disposition = res.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const name = match ? match[1] : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export default api;
