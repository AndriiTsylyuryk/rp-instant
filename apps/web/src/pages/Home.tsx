import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { joinGame } from "../api/game";
import { isApiError } from "../api/http";
import { useAuth } from "../auth/useAuth";
import { shouldResumeGame } from "../lib/resumeGame";

const JOIN_ERRORS: Record<string, string> = {
  bad_nickname: "Nickname must be 5–20 characters.",
  not_found: "Game with this code was not found.",
  game_ended: "This game has already ended.",
  joining_locked: "Joining this game is closed.",
  nickname_taken: "This nickname is already taken.",
  network: "No connection to the server.",
};

export default function Home() {
  const { viewer, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [code, setCode] = useState((params.get("code") ?? "").toUpperCase());
  const [nickname, setNickname] = useState(
    viewer?.kind === "fan" ? viewer.fan.nickname : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (viewer?.kind === "manager") {
    return <Navigate to="/admin" replace />;
  }
  if (viewer && shouldResumeGame(viewer)) {
    return <Navigate to="/play" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const gameCode = code.trim().toUpperCase();
      await joinGame(gameCode, nickname);
      await refresh();
      navigate("/play");
    } catch (err) {
      setError(
        (isApiError(err) && JOIN_ERRORS[err.code]) ||
          "Could not join the game.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <h1>Join game</h1>
      <input
        placeholder="Game code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        required
      />
      <input
        placeholder="Nickname (5–20 characters)"
        minLength={5}
        maxLength={20}
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        required
      />
      {error && <p role="alert">{error}</p>}
      <button className="btn primary" disabled={busy}>
        Play
      </button>
    </form>
  );
}
