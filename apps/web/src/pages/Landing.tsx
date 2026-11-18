import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

/**
 * Public landing page. Existing player, screen and admin routes stay unchanged;
 * the join form lives at /join.
 */
export default function Landing() {
  const { viewer } = useAuth();
  const [params] = useSearchParams();
  const code = params.get("code");

  if (code) {
    return <Navigate to={`/join?code=${encodeURIComponent(code)}`} replace />;
  }

  const inGame =
    viewer && "participant" in viewer ? viewer.participant : null;

  return (
    <main className="landing">
      <p className="landing-eyebrow">Live quiz nights</p>
      <h1>
        Play together.
        <br />
        Win the room.
      </h1>
      <p className="landing-lead">
        Join a live quiz from your phone, answer fast, and see your name at the
        top.
      </p>

      <div className="landing-actions">
        {inGame?.gameCode ? (
          <Link className="btn primary" to={`/play/${inGame.gameCode}`}>
            Continue game
          </Link>
        ) : (
          <Link className="btn primary" to="/join">
            Join a game
          </Link>
        )}

        {viewer?.kind === "anonymous" && (
          <>
            <Link className="btn" to="/login">
              Log in
            </Link>
            <Link className="btn" to="/login?mode=signup">
              Create account
            </Link>
          </>
        )}
        {viewer?.kind === "fan" && (
          <Link className="btn" to="/me">
            My account
          </Link>
        )}
        {viewer?.kind === "manager" && (
          <Link className="btn" to="/admin">
            Admin
          </Link>
        )}
      </div>

      <div className="landing-steps">
        <article>
          <strong>1</strong>
          <h2>Get the code</h2>
          <p>Find the game code on the big screen.</p>
        </article>
        <article>
          <strong>2</strong>
          <h2>Join the game</h2>
          <p>Enter a nickname and jump in.</p>
        </article>
        <article>
          <strong>3</strong>
          <h2>Climb the board</h2>
          <p>Answer fast and beat the room.</p>
        </article>
      </div>

      <p className="landing-admin">
        <Link to="/admin/login">Hosting a quiz?</Link>
      </p>
    </main>
  );
}
