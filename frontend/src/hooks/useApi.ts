import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/client';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (updater: T | ((prev: T | null) => T)) => void;
}

/** Runs an async fetcher on mount and whenever `deps` change. */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (mounted.current) setDataState(result);
    } catch (err) {
      if (mounted.current) {
        if (err instanceof ApiError && err.status === 401) return;
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
  }, [run]);

  const setData = useCallback((updater: T | ((prev: T | null) => T)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | null) => T)(prev) : updater));
  }, []);

  return { data, loading, error, reload: run, setData };
}
