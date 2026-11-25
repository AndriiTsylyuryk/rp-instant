import { useState } from "react";
import type { FormEvent } from "react";
import { updateNicknameApi } from "../api/account";
import { describeNicknameError } from "../lib/errorMessages";

type Props = {
  current: string;
  onSaved: () => Promise<void>;
};

export function NicknameForm({ current, onSaved }: Props) {
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await updateNicknameApi(value);
      setValue(saved);
      await onSaved();
    } catch (err) {
      setError(describeNicknameError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={(e) => void onSubmit(e)}>
      <h2>Nickname</h2>
      <input
        minLength={5}
        maxLength={20}
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      <button className="btn" disabled={busy || value.trim() === current}>
        Save
      </button>
    </form>
  );
}
