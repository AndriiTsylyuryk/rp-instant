import { describe, expect, it } from "vitest";
import {
  createSignupToken,
  verifySignupToken,
} from "../src/auth/signup-token.js";

const claims = { email: "a@b.co", sub: "123" };

describe("signup token", () => {
  it("round-trips", () => {
    expect(verifySignupToken(createSignupToken(claims))).toEqual(claims);
  });

  it("rejects expired tokens", () => {
    const token = createSignupToken(claims, 1_000);
    expect(verifySignupToken(token, 1_000 + 10 * 60_000 + 1)).toBeNull();
  });

  it("rejects tampered tokens", () => {
    const [body, mac] = createSignupToken(claims).split(".");
    const forged = Buffer.from(
      JSON.stringify({ e: "evil@x.co", s: "1", x: Date.now() + 1e6 }),
    ).toString("base64url");
    expect(verifySignupToken(`${forged}.${mac}`)).toBeNull();
    expect(verifySignupToken(`${body}.x`)).toBeNull();
    expect(verifySignupToken("garbage")).toBeNull();
  });
});
