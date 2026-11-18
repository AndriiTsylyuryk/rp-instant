import type { AuthCollection, Viewer } from "@rp/shared";
import {
  exchangePbToken,
  loginWithPasswordApi,
  signUpApi,
} from "../api/auth";
import { pb } from "./pb";

export type OAuthProvider = "google";

async function finish(
  collection: AuthCollection,
  token: string,
): Promise<Viewer> {
  try {
    return await exchangePbToken(collection, token);
  } finally {
    pb.authStore.clear();
  }
}

export async function loginWithOAuth(
  collection: AuthCollection,
  provider: OAuthProvider,
): Promise<Viewer> {
  const res = await pb.collection(collection).authWithOAuth2({ provider });
  return finish(collection, res.token);
}

export function loginWithPassword(
  collection: AuthCollection,
  email: string,
  password: string,
): Promise<Viewer> {
  return loginWithPasswordApi(collection, email, password);
}

export function signUpFan(
  email: string,
  password: string,
  nickname: string,
  consent: boolean,
): Promise<Viewer> {
  return signUpApi({ email, password, nickname, consent });
}
