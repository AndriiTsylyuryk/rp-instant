import type { AuthCollection, Viewer } from "@rp/shared";
import {
  googleCompleteApi,
  googleLoginApi,
  loginWithPasswordApi,
  resendVerificationApi,
  signUpApi,
} from "../api/auth";
import type { GoogleLoginResult } from "../api/auth";

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
): Promise<{ email: string }> {
  return signUpApi({ email, password, nickname, consent });
}

export const resendVerification = resendVerificationApi;

export function loginWithGoogle(
  collection: AuthCollection,
  credential: string,
): Promise<GoogleLoginResult> {
  return googleLoginApi(collection, credential);
}

export function completeGoogleSignup(
  signupToken: string,
  nickname: string,
  consent: boolean,
): Promise<Viewer> {
  return googleCompleteApi({ signupToken, nickname, consent });
}
