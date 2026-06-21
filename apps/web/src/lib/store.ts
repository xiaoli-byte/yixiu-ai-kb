import { create } from "zustand";

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  setAuth: (a: { accessToken: string; refreshToken: string; user: User }) => void;
  setUser: (u: User) => void;
  logout: () => void;
}

const ACCESS_KEY = "accessToken";
const REFRESH_KEY = "refreshToken";
const USER_KEY = "authUser";

function readTokens(): Pick<AuthState, "accessToken" | "refreshToken" | "user"> {
  if (typeof window === "undefined") return { accessToken: null, refreshToken: null, user: null };
  try {
    return {
      accessToken: localStorage.getItem(ACCESS_KEY),
      refreshToken: localStorage.getItem(REFRESH_KEY),
      user: (() => {
        const raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
      })(),
    };
  } catch {
    return { accessToken: null, refreshToken: null, user: null };
  }
}

export const useAuth = create<AuthState>((set) => {
  const stored = readTokens();
  return {
    ...stored,
    setAuth: ({ accessToken, refreshToken, user }) => {
      localStorage.setItem(ACCESS_KEY, accessToken);
      localStorage.setItem(REFRESH_KEY, refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ accessToken, refreshToken, user });
    },
    setUser: (user) => {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      set({ user });
    },
    logout: () => {
      localStorage.removeItem(ACCESS_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
      set({ accessToken: null, refreshToken: null, user: null });
    },
  };
});
