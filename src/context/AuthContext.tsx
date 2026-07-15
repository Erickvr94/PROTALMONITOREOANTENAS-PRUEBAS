import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { login as loginApi, getMe, type User } from "../services/auth";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Solo hay algo que cargar si existe un token guardado; se decide en el
  // estado inicial, así el efecto no necesita setState síncrono.
  const [loading, setLoading] = useState(() =>
    Boolean(localStorage.getItem("token")),
  );

  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    getMe()
      .then(setUser)
      .catch(() => localStorage.removeItem("token"))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { token, user } = await loginApi(username, password);
    localStorage.setItem("token", token);
    setUser(user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
