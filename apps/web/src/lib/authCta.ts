import type { Viewer } from "@rp/shared";
import type { ServerPhase } from "../api/game";

export function isAuthCtaVisible(viewer: Viewer, phase: ServerPhase): boolean {
  if (viewer.kind === "fan" || viewer.kind === "manager") {
    return false;
  }

  const kind = typeof phase === "string" ? phase : phase.type;
  return kind === "lobby" || kind === "final" || kind === "ended";
}
