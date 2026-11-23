import { useEffect, useRef } from "react";
import { GOOGLE_CLIENT_ID, renderGoogleButton } from "../auth/google";

type Props = {
  onCredential: (credential: string) => void;
  onError: () => void;
};

export function GoogleButton({ onCredential, onError }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ onCredential, onError });
  latest.current = { onCredential, onError };

  useEffect(() => {
    const el = ref.current;
    if (!el || !GOOGLE_CLIENT_ID) return;

    let off: (() => void) | undefined;
    let cancelled = false;
    renderGoogleButton(el, (c) => latest.current.onCredential(c)).then(
      (dispose) => {
        if (cancelled) dispose();
        else off = dispose;
      },
      () => latest.current.onError(),
    );
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;
  return <div ref={ref} />;
}
