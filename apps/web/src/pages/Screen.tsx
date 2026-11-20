import { useParams } from "react-router-dom";
import { fetchScreenState, pollDelay } from "../api/game";
import { usePolling } from "../hooks/usePolling";

export default function Screen() {
  // Екран відкривається за непередбачуваним токеном, а не за кодом приєднання.
  const { token = "" } = useParams();
  const { data: state, error } = usePolling(
    () => fetchScreenState(token),
    pollDelay,
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
        </div>
      );
    case "get-ready":
      return <h1>Get ready…</h1>;
    case "question":
      return (
        <div>
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
