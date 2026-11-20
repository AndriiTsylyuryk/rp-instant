import type { Viewer } from "@rp/shared";

export function shouldResumeGame(viewer: Viewer): boolean {
  if (!("participant" in viewer) || !viewer.participant) {
    return false;
  }
  if (viewer.participant.gameStatus !== "ended") {
    return true;
  }
  return viewer.kind === "guest";
}
