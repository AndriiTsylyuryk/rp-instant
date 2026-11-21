import { useState } from "react";
import { Navigate } from "react-router-dom";
import { fetchPlayState, pollDelay, submitAnswer } from "../api/game";
import type { PlayStateResponse } from "../api/game";
import { isApiError } from "../api/http";
import { AuthCta } from "../components/AuthCta";
import { usePolling } from "../hooks/usePolling";

export default function Play() {
  // Гра береться з cookie rp_play (див. /play/state), а не з URL.
  const { data: state, error } = usePolling(fetchPlayState, pollDelay, []);

  if (isApiError(error) && error.status === 401) {
    return <Navigate to="/" replace />;
  }

  if (!state) {
    return <p>Loading…</p>;
  }

  return (
    <section>
      <AuthCta key={`${state.game.id}:${state.me.id}`} phase={state.phase} />
      <PhaseView state={state as PlayStateResponse} />
    </section>
  );
}

function PhaseView({ state }: { state: PlayStateResponse }) {
  const { phase } = state;

  if (typeof phase === "string") {
    return <Results state={state} />;
  }

  switch (phase.type) {
    case "lobby":
      return (
        <div>
          <h1>{state.game.title}</h1>
          <p>Waiting to start… Players: {state.players}</p>
        </div>
      );
    case "get-ready":
      return <h1>Get ready for question {phase.nextIndex + 1}</h1>;
    case "question":
      return <Question state={state} index={phase.index} />;
    case "pause":
      return (
        <div>
          <h1>Question {phase.index + 1} result</h1>
          <p>
            Your score: {state.me.score} · rank {state.me.rank}
          </p>
          {/* TODO: highlight correct answer using state.reveal */}
        </div>
      );
    case "final":
      return <Results state={state} />;
  }
}

function Question({
  state,
  index,
}: {
  state: PlayStateResponse;
  index: number;
}) {
  const question = state.question;
  const [picked, setPicked] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!question) return <p>Loading question…</p>;

  async function pick(option: number) {
    setPicked(option);
    setError(null);
    try {
      await submitAnswer(index, option);
    } catch (err) {
      setError(isApiError(err) ? err.code : "error");
    }
  }

  return (
    <div>
      <h1>{question.text}</h1>
      {question.options.map((text, i) => (
        <button
          key={i}
          className="btn"
          disabled={picked !== null}
          onClick={() => void pick(i)}
        >
          {text}
        </button>
      ))}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function Results({ state }: { state: PlayStateResponse }) {
  return (
    <div>
      <h1>Game over</h1>
      <p>
        Your score: {state.me.score} · rank {state.me.rank}
      </p>
      <ol>
        {state.top.map((row) => (
          <li key={row.rank}>
            {row.nickname}: {row.score}
          </li>
        ))}
      </ol>
      {/*  AuthCta on top, asks to save resulst */}
    </div>
  );
}
