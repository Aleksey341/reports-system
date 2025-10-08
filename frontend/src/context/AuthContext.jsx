import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      setLoading(true);
      const data = await authAPI.me();

      // Handle both {user: {...}} and direct object
      const userData = data.user || data;

      // Check if password reset is required
      if (userData.password_reset_required) {
        window.location.href = '/change-password?required=true';
        return;
      }

      setUser(userData);
      setError(null);
    } catch (err) {
      console.log('[Auth] Not authenticated');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (municipalityId, password) => {
    try {
      setError(null);
      const data = await authAPI.login(municipalityId, password);

      const userData = data.user;

      // Check if password reset is required
      if (userData.password_reset_required) {
        window.location.href = '/change-password?required=true';
        return;
      }

      setUser(userData);
      return { success: true };
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Ошибка авторизации';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch (err) {
      console.error('[Auth] Logout error:', err);
    } finally {
      setUser(null);
      window.location.href = '/';
    }
  };

  const changePassword = async (oldPassword, newPassword) => {
    try {
      setError(null);
      await authAPI.changePassword(oldPassword, newPassword);
      return { success: true };
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Ошибка смены пароля';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    checkAuth,
    changePassword,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isGovernor: user?.role === 'governor',
    isOperator: user?.role === 'operator'
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
