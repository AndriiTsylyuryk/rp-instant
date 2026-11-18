import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Viewer } from "@rp/shared";
import { fetchViewer, logout } from "../api/auth";
import { AuthContext } from "./AuthContext";
import type { AuthContextValue } from "./AuthContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setViewer(await fetchViewer());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await logout();
    await refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      viewer,
      loading: viewer === null && !failed,
      failed,
      refresh,
      setViewer,
      signOut,
    }),
    [viewer, failed, refresh, signOut],
  );

  if (failed && viewer === null) {
    return (
      <div className="page center">
        <p>Could not connect to the server.</p>
        <button className="btn" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
