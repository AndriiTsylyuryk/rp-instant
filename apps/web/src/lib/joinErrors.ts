import { isApiError } from "../api/http";

const JOIN_ERRORS: Record<string, string> = {
  bad_nickname: "Nickname must be 5–20 characters.",
  not_found: "Game with this code was not found.",
  game_ended: "This game has already ended.",
  joining_locked: "Joining this game is closed.",
  nickname_taken: "This nickname is already taken.",
  network: "No connection to the server.",
};

/** Текст помилки для кроків входу в гру (перевірка PIN і /join). */
export function describeJoinError(err: unknown): string {
  if (isApiError(err)) {
    // rate-limit відповідає 429 без нашого коду помилки
    if (err.status === 429) {
      return "Too many attempts. Try again in a minute.";
    }
    return JOIN_ERRORS[err.code] ?? "Could not join the game.";
  }
  return "Could not join the game.";
}
