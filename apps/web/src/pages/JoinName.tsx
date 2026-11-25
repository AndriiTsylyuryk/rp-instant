import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { joinGame } from "../api/game";
import { useAuth } from "../auth/useAuth";
import { AuthCta } from "../components/AuthCta";
import { describeJoinError } from "../lib/errorMessages";
import { shouldResumeGame } from "../lib/resumeGame";

type NameState = { code?: string; title?: string } | null;

export default function JoinName() {
  const { viewer, refresh } = useAuth();
  const navigate = useNavigate();
  const state = useLocation().state as NameState;

  const [typed, setTyped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const code = state?.code ?? null;

  useEffect(() => {
    if (!code || viewer?.kind !== "fan") return;
    const nick = viewer.fan.nickname.trim();
    if (!nick) return;

    let cancelled = false;
    setBusy(true);
    setError(null);
    joinGame(code, nick)
      .then(() => refresh())
      .then(() => navigate("/play", { replace: true }))
      .catch((err) => {
        if (cancelled) return;
        setError(describeJoinError(err));
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, viewer]);

  if (!code) {
    return <Navigate to="/join" replace />;
  }
  if (viewer?.kind === "manager") {
    return <Navigate to="/admin" replace />;
  }
  if (viewer && shouldResumeGame(viewer)) {
    return <Navigate to="/play" replace />;
  }

  // Фан із нікнеймом: приєднуємося, показуємо замітку замість форми.
  if (viewer?.kind === "fan" && viewer.fan.nickname.trim() && !error) {
    return (
      <div className="page center">
        <p>Приєднуємося до гри…</p>
      </div>
    );
  }

  const nickname = typed ?? (viewer?.kind === "fan" ? viewer.fan.nickname : "");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await joinGame(code!, nickname.trim());
      await refresh();
      navigate("/play");
    } catch (err) {
      setError(describeJoinError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <form className="form" onSubmit={onSubmit}>
        <h1>{state?.title ?? "Join game"}</h1>
        <input
          placeholder="Nickname (5–20 characters)"
          minLength={5}
          maxLength={20}
          autoComplete="nickname"
          value={nickname}
          onChange={(e) => setTyped(e.target.value)}
          required
        />
        {error && <p role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {viewer?.kind === "fan" ? "Play" : "Play as guest"}
        </button>
      </form>

      <AuthCta phase={{ type: "lobby" }} />
    </div>
  );
}
