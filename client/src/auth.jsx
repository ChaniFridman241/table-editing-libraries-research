import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createMongoAbility } from '@casl/ability';
import { AbilityProvider } from '@casl/react';
import { api, tokenStore } from './api.js';

const AuthContext = createContext(null);

export const ROLE_LABELS = { admin: 'מנהלת', finance: 'מנהלת כספים', editor: 'עורכת', viewer: 'צופה' };

export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const [token, setToken] = useState(tokenStore.get());

  // המשתמשת המחוברת וכללי ההרשאה שלה מהשרת. מתעדכן מדי פעם, כך ששינוי תפקיד נכנס לתוקף בלי להתנתק.
  const me = useQuery({
    queryKey: ['me', token],
    queryFn: api.me,
    enabled: !!token,
    retry: false,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (me.isError) {
      tokenStore.clear();
      setToken(null);
    }
  }, [me.isError]);

  // CASL: בונה באתר את אותן הרשאות שהשרת אוכף
  const ability = useMemo(() => createMongoAbility(me.data?.rules ?? []), [me.data]);

  const signIn = (t) => {
    tokenStore.set(t);
    setToken(t);
  };

  const login = async (username, password) => signIn((await api.login(username, password)).token);
  const register = async (username, password, displayName) =>
    signIn((await api.register(username, password, displayName)).token);

  const logout = () => {
    tokenStore.clear();
    setToken(null);
    qc.clear();
  };

  const value = {
    user: me.data?.user ?? null,
    loading: !!token && me.isLoading,
    login,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      <AbilityProvider value={ability}>{children}</AbilityProvider>
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
