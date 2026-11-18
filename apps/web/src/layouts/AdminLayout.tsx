import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../auth/useAuth";

export default function AdminLayout() {
  const { viewer, signOut } = useAuth();
  const name = viewer?.kind === "manager" ? viewer.manager.name : "";

  return (
    <div className="admin">
      <aside className="sidebar">
        <strong>RoundPicks Admin</strong>
        <nav>
          <Link to="/admin">Quizzes</Link>
          {/* TODO: Ігри, Питання, Налаштування клубу */}
        </nav>
        <div>
          <p>{name}</p>
          <button className="btn" onClick={() => void signOut()}>
            Log out
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
