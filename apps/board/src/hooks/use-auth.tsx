import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LoginParams, RegisterParams, UserProfile } from '@moonwitness/client';
import { client } from '@/lib/client';

interface AuthValue {
  user: UserProfile | null;
  login(params: LoginParams): Promise<void>;
  register(params: RegisterParams): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState(client.currentUser);
  const queryClient = useQueryClient();
  const userId = useRef(client.currentUser?.id ?? null);

  useEffect(
    () =>
      client.onSessionChange((next) => {
        const nextUserId = next?.id ?? null;
        if (userId.current !== nextUserId) queryClient.clear();
        userId.current = nextUserId;
        setUser(next);
      }),
    [queryClient]
  );

  const value: AuthValue = {
    user,
    login: async (params) => void (await client.login(params)),
    register: async (params) => void (await client.register(params)),
    logout: () => client.logout(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
