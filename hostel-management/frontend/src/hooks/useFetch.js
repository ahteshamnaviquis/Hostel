import { useCallback, useEffect, useRef, useState } from 'react';
import api, { cleanParams } from '../services/api';

/**
 * Loads data from the API: const { data, meta, loading, error, reload } = useFetch('/rooms', { page: 1 })
 * Stale responses (from older params) are ignored.
 */
export default function useFetch(url, params = {}, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: Boolean(url && enabled), error: null });
  const requestId = useRef(0);
  const key = JSON.stringify(params);

  const load = useCallback(async () => {
    if (!url || !enabled) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await api.get(url, { params: cleanParams(JSON.parse(key)) });
      if (id === requestId.current) setState({ data: res.data.data, meta: res.data.meta || null, loading: false, error: null });
    } catch (error) {
      if (id === requestId.current) setState((s) => ({ ...s, loading: false, error: error.userMessage }));
    }
  }, [url, key, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload: load, setData };
}
