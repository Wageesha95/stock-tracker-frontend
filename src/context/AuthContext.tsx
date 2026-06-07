import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthUser } from '../types';
import { login as apiLogin, signup as apiSignup, logout as apiLogout, getMe, clearAllCache } from '../api';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  isReadMode: boolean;
  dividendPayoutsEnabled: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    // Restore user from localStorage immediately to prevent flash
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then(u => {
        // Preserve readMode from localStorage since /me doesn't return it
        const saved = localStorage.getItem('user');
        const savedUser = saved ? JSON.parse(saved) : {};
        const authUser = { ...u, readMode: savedUser.readMode ?? false, dividendPayoutsEnabled: u.dividendPayoutsEnabled ?? false };
        setUser(authUser);
        localStorage.setItem('user', JSON.stringify(authUser));
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    clearAllCache();
    const u = await apiLogin(username, password);
    const authUser = { id: u.id, username: u.username, role: u.role, readMode: u.readMode, dividendPayoutsEnabled: (u as any).dividendPayoutsEnabled ?? false };
    localStorage.setItem('user', JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const signup = useCallback(async (username: string, password: string) => {
    clearAllCache();
    const u = await apiSignup(username, password);
    const authUser = { id: u.id, username: u.username, role: u.role, readMode: u.readMode, dividendPayoutsEnabled: (u as any).dividendPayoutsEnabled ?? false };
    localStorage.setItem('user', JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const logout = useCallback(async () => {
    clearAllCache();
    await apiLogout().catch(() => {});
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin: user?.role === 'ADMIN', isReadMode: user?.readMode ?? false, dividendPayoutsEnabled: user?.dividendPayoutsEnabled ?? false, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
