import type { Viewer, ViewerParticipant } from "@rp/shared";
import { getCachedGameById } from "../game-cache.js";
import type { Session } from "../session-cache.js";
import type { AuthSession } from "./session-store.js";

async function toParticipant(
  guest: Session | null,
): Promise<ViewerParticipant | null> {
  if (!guest) {
    return null;
  }
  const game = await getCachedGameById(guest.gameId);
  return { nickname: guest.nickname, gameCode: game?.code ?? null };
}

export async function buildViewer(
  auth: AuthSession | null,
  guest: Session | null,
): Promise<Viewer> {
  const participant = await toParticipant(guest);

  if (auth?.role === "manager") {
    return {
      kind: "manager",
      manager: {
        id: auth.userId,
        name: auth.profile.name ?? "",
        clubId: auth.profile.clubId ?? "",
      },
    };
  }

  if (auth?.role === "fan") {
    return {
      kind: "fan",
      fan: {
        id: auth.userId,
        nickname: auth.profile.nickname ?? "",
        email: auth.profile.email ?? "",
      },
      participant,
    };
  }

  return participant ? { kind: "guest", participant } : { kind: "anonymous" };
}
