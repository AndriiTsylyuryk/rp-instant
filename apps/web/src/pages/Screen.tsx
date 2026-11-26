import { useParams } from "react-router-dom";
import { fetchScreenState } from "../api/game";
import { GameTimer } from "../components/GameTimer";
import { useGameState } from "../hooks/useGameState";
import { QUESTION_TIME_S } from "@rp/shared";

export default function Screen() {
  // Екран відкривається за непередбачуваним токеном, а не за кодом приєднання.
  const { token = "" } = useParams();
  const { state, error } = useGameState(
    (opts) => fetchScreenState(token, opts),
    [token],
  );

  if (error && !state) return <h1>Game not found</h1>;
  if (!state) return <h1>…</h1>;

  const { phase } = state;
  const joinUrl = `${window.location.origin}/join?code=${state.joinCode}`;

  if (typeof phase === "string") {
    return (
      <div>
        <h1>Winner</h1>
        {/* TODO BE: public GET /game/results?code= з final_top  */}
      </div>
    );
  }

  switch (phase.type) {
    case "lobby":
      return (
        <div>
          <h1>{state.game.title}</h1>
          <p>Code: {state.joinCode}</p>
          <p>{joinUrl}</p>
          {/* TODO: QR-code (qrcode.react → <QRCodeSVG value={joinUrl} />) */}
          <p>Players: {state.players}</p>
          {state.nextBoundaryAt !== null && (
            <GameTimer
              key={`lobby:${state.nextBoundaryAt}`}
              targetAt={state.nextBoundaryAt}
              serverNow={state.serverNow}
              totalSeconds={(state.game.lobbyMinutes ?? 0) * 60}
              size={240}
              clock
            />
          )}
        </div>
      );
    case "get-ready":
      return <h1>Get ready…</h1>;
    case "question":
      return (
        <div>
          {state.nextBoundaryAt !== null && (
            <GameTimer
              key={`q:${phase.index}`}
              targetAt={state.nextBoundaryAt}
              serverNow={state.serverNow}
              totalSeconds={QUESTION_TIME_S}
              size={200}
              urgency
            />
          )}
          <h1>{state.question?.text}</h1>
          <ol>
            {state.question?.options.map((option, i) => (
              <li key={i}>{option}</li>
            ))}
          </ol>
        </div>
      );
    case "pause":
      return (
        <div>
          <h1>{state.question?.text}</h1>
          {/* TODO: show state.reveal.counts and correct answer */}
        </div>
      );
    case "final":
      return (
        <div>
          <h1>Winner</h1>
          {/* TODO: look above, public endpont needed for results */}
        </div>
      );
  }
}
