import { useState } from "react";
import { skipLogin } from "../api/game";
import type { ServerPhase } from "../api/game";
import { useAuth } from "../auth/useAuth";
import { isAuthCtaVisible, isGameOverPhase } from "../lib/authCta";
import { AuthDialog } from "./AuthDialog";

export function AuthCta({ phase }: { phase: ServerPhase }) {
  const { viewer, refresh } = useAuth();
  const [dialog, setDialog] = useState<"login" | "signup" | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState(false);

  if (!viewer || !isAuthCtaVisible(viewer, phase) || skipped) {
    return null;
  }

  const canSkip =
    viewer.kind === "guest" &&
    !viewer.participant.hasAccount &&
    isGameOverPhase(phase);

  async function skip() {
    setSkipping(true);
    setError(false);
    try {
      await skipLogin();
      setSkipped(true);
      await refresh();
    } catch {
      setError(true);
    } finally {
      setSkipping(false);
    }
  }

  return (
    <div className="cta">
      <button className="btn" onClick={() => setDialog("login")}>
        Log in
      </button>
      <button className="btn primary" onClick={() => setDialog("signup")}>
        Create account
      </button>
      {canSkip && (
        <button
          className="btn"
          disabled={skipping}
          onClick={() => void skip()}
        >
          {skipping ? "Skipping..." : "No thanks"}
        </button>
      )}
      {error && <p role="alert">Could not skip. Try again.</p>}

      {dialog && (
        <AuthDialog initialMode={dialog} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
