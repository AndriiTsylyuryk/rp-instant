import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { Viewer } from "@rp/shared";
import { useAuth } from "./useAuth";

type Role = Extract<Viewer["kind"], "fan" | "manager">;

type Props = {
  roles: Role[];
  redirectTo?: string;
  children: ReactNode;
};

export function RequireRole({ roles, redirectTo = "/login", children }: Props) {
  const { viewer, loading } = useAuth();
  const location = useLocation();

  if (loading || !viewer) {
    return <div className="page center">Loading…</div>;
  }

  if ((roles as string[]).includes(viewer.kind)) {
    return <>{children}</>;
  }

  if (viewer.kind === "anonymous" || viewer.kind === "guest") {
    return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="page center">
      <h1>403</h1>
      <p>You do not have access to this page.</p>
    </div>
  );
}
