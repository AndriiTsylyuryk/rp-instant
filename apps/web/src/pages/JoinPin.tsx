import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { joinGame, lookupGame } from "../api/game";
import { useAuth } from "../auth/useAuth";
import { describeJoinError } from "../lib/errorMessages";
import { shouldResumeGame } from "../lib/resumeGame";

export default function JoinPin() {
  const { viewer, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const fromLink = (params.get("code") ?? "").trim().toUpperCase();
  const [code, setCode] = useState(fromLink);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(
    async (value: string, replace: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const pin = value.trim().toUpperCase();
        const game = await lookupGame(pin);
        
        if (viewer?.kind === "fan") {
          const nick = viewer.fan.nickname.trim();
          if (nick) {
            await joinGame(pin, nick);
            await refresh();
            navigate("/play", { replace: true });
            return;
          }
        }

        navigate("/join/name", {
          state: { code: pin, title: game.title },
          replace,
        });
      } catch (err) {
        setError(describeJoinError(err));
      } finally {
        setBusy(false);
      }
    },
    [navigate, viewer, refresh],
  );

  useEffect(() => {
    if (fromLink) {
      void check(fromLink, true);
    }
  }, [fromLink, check]);

  if (viewer?.kind === "manager") {
    return <Navigate to="/admin" replace />;
  }
  if (viewer && shouldResumeGame(viewer)) {
    return <Navigate to="/play" replace />;
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void check(code, false);
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <h1>Join game</h1>
      <input
        placeholder="Game code"
        autoComplete="off"
        autoCapitalize="characters"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        required
      />
      {error && <p role="alert">{error}</p>}
      <button className="btn primary" disabled={busy}>
        Continue
      </button>
    </form>
  );
}
