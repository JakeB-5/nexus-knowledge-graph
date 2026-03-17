"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  avatarUrl?: string;
  createdAt: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = "nexus_token";
const USER_KEY = "nexus_user";

// Simulated API responses — replace with real API calls
async function apiLogin(email: string, _password: string): Promise<{ user: User; token: string }> {
  await new Promise((r) => setTimeout(r, 800));
  return {
    token: "mock_token_" + Math.random().toString(36).slice(2),
    user: {
      id: "u1",
      name: email.split("@")[0],
      email,
      role: "admin",
      createdAt: new Date().toISOString(),
    },
  };
}

async function apiRegister(name: string, email: string, _password: string): Promise<{ user: User; token: string }> {
  await new Promise((r) => setTimeout(r, 1000));
  return {
    token: "mock_token_" + Math.random().toString(36).slice(2),
    user: {
      id: "u_" + Math.random().toString(36).slice(2),
      name,
      email,
      role: "editor",
      createdAt: new Date().toISOString(),
    },
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Rehydrate from storage on mount
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY) ?? sessionStorage.getItem(USER_KEY);
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser) as User);
      }
    } catch {
      // Ignore parse errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  const persistSession = (user: User, token: string, remember: boolean) => {
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(TOKEN_KEY, token);
    storage.setItem(USER_KEY, JSON.stringify(user));
  };

  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  };

  const login = useCallback(async (email: string, password: string, remember = false) => {
    setIsLoading(true);
    try {
      const { user, token } = await apiLogin(email, password);
      setUser(user);
      setToken(token);
      persistSession(user, token, remember);
      router.push("/dashboard");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const { user, token } = await apiRegister(name, email, password);
      setUser(user);
      setToken(token);
      persistSession(user, token, false);
      router.push("/dashboard");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    clearSession();
    router.push("/auth/login");
  }, [router]);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates };
      // Persist updated user
      if (localStorage.getItem(TOKEN_KEY)) {
        localStorage.setItem(USER_KEY, JSON.stringify(updated));
      } else {
        sessionStorage.setItem(USER_KEY, JSON.stringify(updated));
      }
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user && !!token,
        login,
        register,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** HOC that redirects unauthenticated users to the login page */
export function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function ProtectedComponent(props: P) {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && !isAuthenticated) {
        router.replace("/auth/login");
      }
    }, [isAuthenticated, isLoading, router]);

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-nexus-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }

    if (!isAuthenticated) return null;
    return <Component {...props} />;
  };
}
