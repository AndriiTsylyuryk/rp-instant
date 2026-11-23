import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmailApi } from "../api/auth";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "ok" | "failed">(
    token ? "loading" : "failed",
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    verifyEmailApi(token).then(
      () => !cancelled && setStatus("ok"),
      () => !cancelled && setStatus("failed"),
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="page center">
      {status === "loading" && <p>Verifying…</p>}
      {status === "ok" && (
        <>
          <p>Email verified. You can log in now.</p>
          <Link className="btn primary" to="/login">
            Log in
          </Link>
        </>
      )}
      {status === "failed" && (
        <>
          <p>This link is invalid or expired. Log in to get a new one.</p>
          <Link className="btn" to="/login">
            Log in
          </Link>
        </>
      )}
    </div>
  );
}
