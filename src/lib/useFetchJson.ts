"use client";

import { useCallback, useEffect, useState } from "react";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useFetchJson<T>(url: string): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url, { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Erreur ${res.status}`);
        if (!cancelled) setData(body as T);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [url, reloadToken]);

  return { data, loading, error, refresh };
}
