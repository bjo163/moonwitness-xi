import { createContext } from 'react';
import type { LoginParams, RegisterParams, UserProfile } from '@moonwitness/client';

export interface AuthValue {
  user: UserProfile | null;
  login(params: LoginParams): Promise<void>;
  register(params: RegisterParams): Promise<void>;
  logout(): Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);
