import { useCallback, useEffect, useState } from 'react';
import { getApiHealth } from '../services/healthService';

/**
 * Checks the backend health endpoint.
 * status: 'checking' | 'online' | 'degraded' | 'offline'
 */
export default function useApiHealth() {
  const [state, setState] = useState({ status: 'checking', report: null, error: null });

  const check = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'checking' }));
    try {
      const report = await getApiHealth();
      setState({ status: report.status === 'ok' ? 'online' : 'degraded', report, error: null });
    } catch (error) {
      setState({ status: 'offline', report: null, error: error.userMessage });
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { ...state, refresh: check };
}
