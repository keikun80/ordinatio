import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '../api/client';

const AuthContext = createContext(null);

const SESSION_TIMEOUT_SECONDS = 30 * 60; // 30 minutes (Financial Security Standard)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('aiorche_token'));
  const [isLoading, setIsLoading] = useState(true);
  const [sessionRemaining, setSessionRemaining] = useState(SESSION_TIMEOUT_SECONDS);
  const [logoutReason, setLogoutReason] = useState(null);

  const lastActivityRef = useRef(Date.now());
  const timerIntervalRef = useRef(null);

  // Validate existing token on initial application mount
  useEffect(() => {
    async function initAuth() {
      const storedToken = localStorage.getItem('aiorche_token');
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const me = await apiClient.getMe();
        setUser(me);
        setToken(storedToken);
        lastActivityRef.current = Date.now();
        setSessionRemaining(SESSION_TIMEOUT_SECONDS);
      } catch (err) {
        console.warn('Initial session validation failed:', err);
        localStorage.removeItem('aiorche_token');
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  // Logout handler
  const logout = useCallback(async (reason = null) => {
    try {
      await apiClient.logout();
    } catch (e) {
      // Ignore network errors on logout
    }
    localStorage.removeItem('aiorche_token');
    setToken(null);
    setUser(null);
    setLogoutReason(reason);
  }, []);

  // Sliding session activity reset handler (throttled)
  const resetActivityTimer = useCallback(() => {
    const now = Date.now();
    // Only refresh if at least 5 seconds elapsed to avoid excessive re-renders
    if (now - lastActivityRef.current > 5000) {
      lastActivityRef.current = now;
      setSessionRemaining(SESSION_TIMEOUT_SECONDS);
    }
  }, []);

  // Inactivity countdown & auto-logout ticker
  useEffect(() => {
    if (!user || !token) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      return;
    }

    timerIntervalRef.current = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, SESSION_TIMEOUT_SECONDS - elapsedSeconds);
      setSessionRemaining(remaining);

      if (remaining <= 0) {
        clearInterval(timerIntervalRef.current);
        logout('inactivity');
      }
    }, 1000);

    // Activity event listeners
    const handleActivity = () => resetActivityTimer();
    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('click', handleActivity, { passive: true });
    window.addEventListener('scroll', handleActivity, { passive: true });

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('scroll', handleActivity);
    };
  }, [user, token, logout, resetActivityTimer]);

  // Login handler
  const login = async (username, password) => {
    setLogoutReason(null);
    const data = await apiClient.login(username, password);
    localStorage.setItem('aiorche_token', data.access_token);
    setToken(data.access_token);
    setUser(data.user);
    lastActivityRef.current = Date.now();
    setSessionRemaining(SESSION_TIMEOUT_SECONDS);
    return data.user;
  };

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isTenantAdmin = user?.role === 'TENANT_ADMIN';
  const isViewer = user?.role === 'VIEWER';

  const hasRole = (...roles) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user && !!token,
        isLoading,
        sessionRemaining,
        logoutReason,
        login,
        logout,
        resetActivityTimer,
        isSuperAdmin,
        isTenantAdmin,
        isViewer,
        hasRole
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
