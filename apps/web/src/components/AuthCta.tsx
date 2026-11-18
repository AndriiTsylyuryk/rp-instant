import { useState } from "react";
import type { ServerPhase } from "../api/game";
import { useAuth } from "../auth/useAuth";
import { isAuthCtaVisible } from "../lib/authCta";
import { AuthDialog } from "./AuthDialog";

export function AuthCta({ phase }: { phase: ServerPhase }) {
  const { viewer } = useAuth();
  const [dialog, setDialog] = useState<"login" | "signup" | null>(null);

  if (!viewer || !isAuthCtaVisible(viewer, phase)) {
    return null;
  }

  return (
    <div className="cta">
      <button className="btn" onClick={() => setDialog("login")}>
        Log in
      </button>
      <button className="btn primary" onClick={() => setDialog("signup")}>
        Create account
      </button>

      {dialog && (
        <AuthDialog initialMode={dialog} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
