import { useCallback, useEffect, useRef, useState } from "react";
import { isApiError } from "../api/http";

type PollingState<T> = { data: T | null; error: unknown };

export type PollTiming = { sentAt: number; receivedAt: number };

const ERROR_RETRY_MS = 3000;

export function usePolling<T>(
  fetcher: () => Promise<T>,
  nextDelay: (data: T) => number | null,
  deps: unknown[],
  onResult?: (data: T, timing: PollTiming) => void,
): PollingState<T> & { pollNow: () => void } {
  const [state, setState] = useState<PollingState<T>>({
    data: null,
    error: null,
  });
  const fetcherRef = useRef(fetcher);
  const nextDelayRef = useRef(nextDelay);
  const onResultRef = useRef(onResult);
  const tickRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    fetcherRef.current = fetcher;
    nextDelayRef.current = nextDelay;
    onResultRef.current = onResult;
  });

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (ms: number | null) => {
      if (!cancelled && ms !== null) {
        timer = setTimeout(() => void tick(), ms);
      }
    };

    const tick = async () => {
      if (running) return;
      running = true;
      clearTimeout(timer);

      const sentAt = Date.now();
      try {
        const data = await fetcherRef.current();
        if (cancelled) return;
        onResultRef.current?.(data, { sentAt, receivedAt: Date.now() });
        setState({ data, error: null });
        schedule(nextDelayRef.current(data));
      } catch (error) {
        if (cancelled) return;
        setState((prev) => ({ data: prev.data, error }));

        const fatal =
          isApiError(error) && [401, 404, 410].includes(error.status);
        schedule(fatal ? null : ERROR_RETRY_MS);
      } finally {
        running = false;
      }
    };

    tickRef.current = tick;
    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      tickRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const pollNow = useCallback(() => {
    void tickRef.current?.();
  }, []);

  return { ...state, pollNow };
}
