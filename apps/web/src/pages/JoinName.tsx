import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { joinGame } from "../api/game";
import { useAuth } from "../auth/useAuth";
import { AuthCta } from "../components/AuthCta";
import { describeJoinError } from "../lib/joinErrors";
import { shouldResumeGame } from "../lib/resumeGame";

type NameState = { code?: string; title?: string } | null;

/**
 * Крок 2 входу в гру: нікнейм або акаунт.
 * Гравець або грає як гість, або входить / створює акаунт (діалог поверх екрана,
 * без переходу), після чого нікнейм fan підставляється й приєднання в один клік.
 */
export default function JoinName() {
  const { viewer, refresh } = useAuth();
  const navigate = useNavigate();
  const state = useLocation().state as NameState;

  // null = користувач ще нічого не вводив, тоді показуємо нікнейм fan із профілю.
  const [typed, setTyped] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // F5 або пряме відкриття: PIN втрачено, повертаємось на крок 1.
  if (!state?.code) {
    return <Navigate to="/join" replace />;
  }
  if (viewer?.kind === "manager") {
    return <Navigate to="/admin" replace />;
  }
  if (viewer && shouldResumeGame(viewer)) {
    return <Navigate to="/play" replace />;
  }

  const code = state.code;
  const nickname =
    typed ?? (viewer?.kind === "fan" ? viewer.fan.nickname : "");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await joinGame(code, nickname.trim());
      await refresh(); // Viewer = guest (або fan у грі)
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
        <h1>{state.title ?? "Join game"}</h1>
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

      {/* Гість може увійти або створити акаунт ще до гри (кнопки з'являються
          для не залогінених у лоббі). Після входу нікнейм підставиться сам. */}
      <AuthCta phase={{ type: "lobby" }} />
    </div>
  );
}
