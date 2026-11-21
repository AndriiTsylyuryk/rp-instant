import type { Viewer } from "@rp/shared";
import type { ServerPhase } from "../api/game";

function phaseKind(phase: ServerPhase) {
  return typeof phase === "string" ? phase : phase.type;
}

export function isAuthCtaVisible(viewer: Viewer, phase: ServerPhase): boolean {
  if (viewer.kind === "fan" || viewer.kind === "manager") {
    return false;
  }

  const kind = phaseKind(phase);
  return kind === "lobby" || kind === "final" || kind === "ended";
}

export function isGameOverPhase(phase: ServerPhase): boolean {
  const kind = phaseKind(phase);
  return kind === "final" || kind === "ended";
}
