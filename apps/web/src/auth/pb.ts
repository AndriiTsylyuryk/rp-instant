import PocketBase, { BaseAuthStore } from "pocketbase";

export const pb = new PocketBase(
  `${window.location.origin}/pb`,
  new BaseAuthStore(),
);
