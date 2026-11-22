import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { lookupGame } from "../api/game";
import { useAuth } from "../auth/useAuth";
import { describeJoinError } from "../lib/joinErrors";
import { shouldResumeGame } from "../lib/resumeGame";

/**
 * Крок 1 входу в гру: PIN.
 * Перевіряємо PIN окремим запитом (/game/lookup), тож помилку видно одразу,
 * а не після введення нікнейма. PIN передаємо на крок 2 через стан навігації,
 * а не в URL: адреса не стає посиланням, яке "живе вічно".
 * Якщо PIN прийшов зі скану QR (?code=), перевірка робиться автоматично.
 */
export default function JoinPin() {
  const { viewer } = useAuth();
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
    [navigate],
  );

  useEffect(() => {
    if (fromLink) {
      void check(fromLink, true);
    }
  }, [fromLink, check]);

  if (viewer?.kind === "manager") {
    return <Navigate to="/admin" replace />;
  }
  // Гра ще йде (або гість не зареєструвався після кінця): повертаємо в неї.
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
