import type { FanGamesPage } from "@rp/shared";
import { http } from "./http";

export async function fetchMyGames(page: number): Promise<FanGamesPage> {
  const { data } = await http.get<FanGamesPage>("/me/games", {
    params: { page },
  });
  return data;
}

export async function updateNicknameApi(nickname: string): Promise<string> {
  const { data } = await http.patch<{ nickname: string }>("/me/nickname", {
    nickname,
  });
  return data.nickname;
}

export async function deleteAccountApi(
  proof: { password: string } | { credential: string },
): Promise<void> {
  await http.post("/me/delete", proof);
}
