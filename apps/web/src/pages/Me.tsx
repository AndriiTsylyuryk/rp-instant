import { useAuth } from "../auth/useAuth";
import { DeleteAccount } from "../components/DeleteAccount";
import { NicknameForm } from "../components/NicknameForm";
import { RecentGames } from "../components/RecentGames";

export default function Me() {
  const { viewer, signOut, refresh } = useAuth();
  if (viewer?.kind !== "fan") return null;

  return (
    <section>
      <h1>{viewer.fan.nickname}</h1>
      <p>{viewer.fan.email}</p>

      <NicknameForm current={viewer.fan.nickname} onSaved={refresh} />
      <RecentGames />

      <button className="btn" onClick={() => void signOut()}>
        Log out
      </button>

      <DeleteAccount />
    </section>
  );
}
