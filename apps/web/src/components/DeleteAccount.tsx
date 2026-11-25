import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteAccountApi } from "../api/account";
import { useAuth } from "../auth/useAuth";
import { describeAccountError } from "../lib/errorMessages";
import { GoogleButton } from "./GoogleButton";

export function DeleteAccount() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(proof: { password: string } | { credential: string }) {
    setBusy(true);
    setError(null);
    try {
      await deleteAccountApi(proof);
      await refresh();
      navigate("/", { replace: true });
    } catch (err) {
      setError(describeAccountError(err));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="link" onClick={() => setOpen(true)}>
        Delete account
      </button>
    );
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        void run({ password });
      }}
    >
      <h2>Delete account</h2>
      <p>
        Your account and email will be permanently deleted. Nicknames and scores
        in past games stay in those games' results, no longer linked to you.
        Confirm with your password or with Google.
      </p>
      <input
        type="password"
        placeholder="Password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button className="btn" disabled={busy || password === ""}>
        Delete with password
      </button>
      <GoogleButton
        onCredential={(credential) => void run({ credential })}
        onError={() => setError("Google sign-in is unavailable.")}
      />
      {error && <p role="alert">{error}</p>}
      <button type="button" className="link" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
