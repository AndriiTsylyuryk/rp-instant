import { useState } from "react";
import type { FormEvent } from "react";
import type { AuthCollection, Viewer } from "@rp/shared";
import { isApiError } from "../api/http";
import { useAuth } from "../auth/useAuth";
import {
  loginWithOAuth,
  loginWithPassword,
  signUpFan,
} from "../auth/login";

type Props = {
  collection: AuthCollection;
  allowOAuth?: boolean;
  initialMode?: "login" | "signup";
  onDone: (viewer: Viewer) => void;
};

export function LoginForm({
  collection,
  allowOAuth = collection === "fans",
  initialMode = "login",
  onDone,
}: Props) {
  const { setViewer } = useAuth();
  const isFan = collection === "fans";

  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<Viewer>) {
    setBusy(true);
    setError(null);
    try {
      const viewer = await action();
      setViewer(viewer);
      onDone(viewer);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(() =>
      mode === "signup"
        ? signUpFan(email, password, nickname, consent)
        : loginWithPassword(collection, email, password),
    );
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <h2>{mode === "signup" ? "Create account" : "Log in"}</h2>

      {allowOAuth && (
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void run(() => loginWithOAuth(collection, "google"))}
        >
          Continue with Google
        </button>
      )}

      <input
        type="email"
        placeholder="Email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {mode === "signup" && (
        <input
          placeholder="Nickname"
          minLength={5}
          maxLength={20}
          required
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
      )}
      <input
        type="password"
        placeholder="Password"
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        minLength={8}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {mode === "signup" && (
        <label>
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />{" "}
          I consent to the processing of personal data
        </label>
      )}

      {error && <p role="alert">{error}</p>}

      <button className="btn primary" disabled={busy}>
        {mode === "signup" ? "Sign up" : "Log in"}
      </button>

      {isFan && (
        <button
          type="button"
          className="link"
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
        >
          {mode === "signup" ? "Already have an account? Log in" : "No account? Sign up"}
        </button>
      )}
    </form>
  );
}

function describe(err: unknown): string {
  if (isApiError(err)) {
    const known: Record<string, string> = {
      invalid_credentials: "Invalid email or password.",
      invalid_token: "Could not verify sign-in.",
      email_taken: "An account with this email already exists.",
      rate_limited: "Too many attempts. Try again later.",
      bad_request: "Check your input (password must be at least 8 characters).",
      bad_origin: "Request blocked (origin).",
      network: "No connection to the server.",
    };
    if (known[err.code]) return known[err.code];
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong.";
}
