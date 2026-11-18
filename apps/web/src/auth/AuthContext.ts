import { createContext } from "react";
import type { Viewer } from "@rp/shared";

export type AuthContextValue = {
  viewer: Viewer | null;
  loading: boolean;
  failed: boolean;
  refresh: () => Promise<void>;
  setViewer: (viewer: Viewer) => void;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
