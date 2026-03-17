import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { getMe, AuthUser } from "../utils/auth";

interface AuthContextValue {
  me: AuthUser | null;
  loading: boolean;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  me: null,
  loading: true,
  refreshMe: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const user = await getMe();
    setMe(user);
  }, []);

  useEffect(() => {
    getMe()
      .then((user) => {
        setMe(user);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <AuthContext.Provider value={{ me, loading, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
