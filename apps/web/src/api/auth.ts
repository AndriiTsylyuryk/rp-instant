import type { AuthCollection, AuthSessionRequest, Viewer } from "@rp/shared";
import { http } from "./http";

export async function fetchViewer(): Promise<Viewer> {
  const { data } = await http.get<{ viewer: Viewer }>("/me");
  return data.viewer;
}

export async function exchangePbToken(
  collection: AuthCollection,
  token: string,
): Promise<Viewer> {
  const body: AuthSessionRequest = { collection, token };
  const { data } = await http.post<{ viewer: Viewer }>("/auth/session", body);
  return data.viewer;
}

export async function loginWithPasswordApi(
  collection: AuthCollection,
  email: string,
  password: string,
): Promise<Viewer> {
  const { data } = await http.post<{ viewer: Viewer }>("/auth/login", {
    collection,
    email,
    password,
  });
  return data.viewer;
}

export async function signUpApi(input: {
  email: string;
  password: string;
  nickname: string;
  consent: boolean;
}): Promise<Viewer> {
  const { data } = await http.post<{ viewer: Viewer }>("/auth/signup", input);
  return data.viewer;
}

export async function logout(): Promise<void> {
  await http.post("/auth/logout");
}
