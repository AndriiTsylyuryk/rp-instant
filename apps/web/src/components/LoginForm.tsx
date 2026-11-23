import { useState } from "react";
import type { FormEvent } from "react";
import type { AuthCollection, Viewer } from "@rp/shared";
import { isApiError } from "../api/http";
import { useAuth } from "../auth/useAuth";
import {
  completeGoogleSignup,
  loginWithGoogle,
  loginWithPassword,
  resendVerification,
  signUpFan,
} from "../auth/login";
import { GoogleButton } from "./GoogleButton";

type PendingSignup = {
  signupToken: string;
  email: string;
  suggestedNickname: string;
};

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
  const [pending, setPending] = useState<PendingSignup | null>(null);
  // email, на який надіслано лист підтвердження
  const [verifyEmail, setVerifyEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function run(action: () => Promise<Viewer | null>) {
    setBusy(true);
    setError(null);
    try {
      const viewer = await action();
      if (viewer) {
        setViewer(viewer);
        onDone(viewer);
      }
    } catch (err) {
      if (isApiError(err) && err.code === "signup_expired") setPending(null);
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  function onGoogleCredential(credential: string) {
    void run(async () => {
      const res = await loginWithGoogle(collection, credential);
      if (res.status === "ok") return res.viewer;
      setPending(res);
      setNickname(res.suggestedNickname);
      setConsent(false);
      return null;
    });
  }

  function onCompleteGoogle(e: FormEvent) {
    e.preventDefault();
    if (!pending) return;
    void run(() =>
      completeGoogleSignup(pending.signupToken, nickname, consent),
    );
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      if (mode === "signup") {
        await signUpFan(email, password, nickname, consent);
        setVerifyEmail(email);
        setResent(false);
        return null;
      }
      try {
        return await loginWithPassword(collection, email, password);
      } catch (err) {
        if (isApiError(err) && err.code === "email_not_verified") {
          setVerifyEmail(email);
          setResent(false);
          return null;
        }
        throw err;
      }
    });
  }

  async function onResend() {
    if (!verifyEmail) return;
    setBusy(true);
    setError(null);
    try {
      await resendVerification(verifyEmail);
      setResent(true);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  if (verifyEmail) {
    return (
      <div className="form">
        <h2>Check your email</h2>
        <p>
          We sent a verification link to {verifyEmail}. Open it, then log in.
        </p>
        {resent && <p>Link sent again.</p>}
        {error && <p role="alert">{error}</p>}
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void onResend()}
        >
          Resend email
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setVerifyEmail(null);
            setMode("login");
            setError(null);
          }}
        >
          Back to log in
        </button>
      </div>
    );
  }

  if (pending) {
    return (
      <form className="form" onSubmit={onCompleteGoogle}>
        <h2>Finish signing up</h2>
        <p>{pending.email}</p>
        <input
          placeholder="Nickname"
          minLength={5}
          maxLength={20}
          required
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />{" "}
          I consent to the processing of personal data
        </label>
        {error && <p role="alert">{error}</p>}
        <button className="btn primary" disabled={busy}>
          Create account
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setPending(null);
            setError(null);
          }}
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <h2>{mode === "signup" ? "Create account" : "Log in"}</h2>

      {allowOAuth && (
        <GoogleButton
          onCredential={onGoogleCredential}
          onError={() => setError("Google sign-in is unavailable.")}
        />
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
      invalid_google_token: "Could not verify Google sign-in.",
      google_unavailable: "Google is unavailable. Try again later.",
      google_not_configured: "Google sign-in is not configured.",
      no_account: "No account with this email.",
      email_not_verified: "Verify your email first.",
      signup_expired: "Sign-up expired. Continue with Google again.",
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
