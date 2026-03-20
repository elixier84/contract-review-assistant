import { useEffect, useRef, useCallback, useState } from "react";

/**
 * Polls a URL at the given interval and returns the parsed JSON data.
 * Pauses polling when the document is hidden (tab not active).
 */
export function usePolling<T>(
  url: string,
  interval: number = 30000,
  extract?: (data: unknown) => T,
): { data: T | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(() => {
    fetch(url)
      .then(r => r.json())
      .then(d => setData(extract ? extract(d) : d))
      .catch(() => { /* silently ignore polling errors */ });
  }, [url, extract]);

  useEffect(() => {
    fetchData(); // initial fetch

    timerRef.current = setInterval(() => {
      if (!document.hidden) {
        fetchData();
      }
    }, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchData, interval]);

  return { data, refresh: fetchData };
}
