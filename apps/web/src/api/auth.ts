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
}): Promise<{ email: string }> {
  const { data } = await http.post<{ email: string }>("/auth/signup", input);
  return data;
}

export async function verifyEmailApi(token: string): Promise<void> {
  await http.post("/auth/verify-email", { token });
}

export async function resendVerificationApi(email: string): Promise<void> {
  await http.post("/auth/resend-verification", { email });
}

export type GoogleLoginResult =
  | { status: "ok"; viewer: Viewer }
  | {
      status: "signup_required";
      email: string;
      suggestedNickname: string;
      signupToken: string;
    };

export async function googleLoginApi(
  collection: AuthCollection,
  credential: string,
): Promise<GoogleLoginResult> {
  const { data } = await http.post<GoogleLoginResult>("/auth/google", {
    collection,
    credential,
  });
  return data;
}

export async function googleCompleteApi(input: {
  signupToken: string;
  nickname: string;
  consent: boolean;
}): Promise<Viewer> {
  const { data } = await http.post<{ viewer: Viewer }>(
    "/auth/google/complete",
    input,
  );
  return data.viewer;
}

export async function logout(): Promise<void> {
  await http.post("/auth/logout");
}
