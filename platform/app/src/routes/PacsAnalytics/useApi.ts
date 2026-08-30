import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from './api';

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  errorBody: any;
  reload: () => void;
}

/**
 * Hook di fetch GET con gestione di loading/errore e cancellazione soft
 * (ignora risposte tardive quando cambiano le dipendenze).
 */
export function useApi<T = any>(
  path: string | null,
  params?: Record<string, any>,
  deps: any[] = []
): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const [error, setError] = useState<string | null>(null);
  const [errorBody, setErrorBody] = useState<any>(null);
  const reqId = useRef(0);

  const run = useCallback(() => {
    if (!path) {
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    setErrorBody(null);
    apiGet<T>(path, params)
      .then(res => {
        if (id === reqId.current) {
          setData(res);
          setLoading(false);
        }
      })
      .catch(err => {
        if (id === reqId.current) {
          setError(err.message || 'Errore di rete');
          setErrorBody(err.body || null);
          setLoading(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, JSON.stringify(params)]);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps]);

  return { data, loading, error, errorBody, reload: run };
}
