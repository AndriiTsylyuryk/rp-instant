import { useEffect, useRef, useState } from "react";

type PollingState<T> = { data: T | null; error: unknown };

const ERROR_RETRY_MS = 3000;

export function usePolling<T>(
  fetcher: () => Promise<T>,
  nextDelay: (data: T) => number | null,
  deps: unknown[],
): PollingState<T> {
  const [state, setState] = useState<PollingState<T>>({
    data: null,
    error: null,
  });
  const fetcherRef = useRef(fetcher);
  const nextDelayRef = useRef(nextDelay);

  useEffect(() => {
    fetcherRef.current = fetcher;
    nextDelayRef.current = nextDelay;
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (ms: number | null) => {
      if (!cancelled && ms !== null) {
        timer = setTimeout(() => void tick(), ms);
      }
    };

    const tick = async () => {
      try {
        const data = await fetcherRef.current();
        if (cancelled) return;
        setState({ data, error: null });
        schedule(nextDelayRef.current(data));
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({ data: prev.data, error }));
        schedule(ERROR_RETRY_MS);
      }
    };

    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
