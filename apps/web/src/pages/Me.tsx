import { useAuth } from "../auth/useAuth";

export default function Me() {
  const { viewer, signOut } = useAuth();
  if (viewer?.kind !== "fan") return null;

  return (
    <section>
      <h1>{viewer.fan.nickname}</h1>
      <p>{viewer.fan.email}</p>
      {/* TODO: історія ігор, статистика, перемоги (GET /me/games на бекенді). */}
      <button className="btn" onClick={() => void signOut()}>
        Log out
      </button>
    </section>
  );
}
