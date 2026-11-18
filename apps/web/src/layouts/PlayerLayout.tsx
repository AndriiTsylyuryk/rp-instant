import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export function PlayerLayout() {
  const { viewer } = useAuth();

  return (
    <div className="page">
      <header className="header">
        <Link to="/" className="brand">
          RoundPicks
        </Link>
        <nav>
          {viewer?.kind === "anonymous" && <Link to="/login">Log in</Link>}
          {viewer?.kind === "fan" && <Link to="/me">Account</Link>}
          {viewer?.kind === "manager" && <Link to="/admin">Admin</Link>}
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
