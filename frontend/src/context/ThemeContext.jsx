import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

const themes = {
  dark: {
    '--bg-primary': '#0f1115',
    '--bg-secondary': '#1a1d24',
    '--bg-tertiary': '#232a36',
    '--border': '#2b3444',
    '--text-primary': '#e8eef7',
    '--text-secondary': '#9fb0c9',
    '--text-muted': '#6a7789',
    '--accent-blue': '#2563eb',
    '--accent-blue-light': '#8ab4ff',
    '--success': '#10b981',
    '--danger': '#ef4444',
    '--warning': '#f59e0b'
  },
  light: {
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#f8f9fa',
    '--bg-tertiary': '#e9ecef',
    '--border': '#dee2e6',
    '--text-primary': '#212529',
    '--text-secondary': '#495057',
    '--text-muted': '#6c757d',
    '--accent-blue': '#0d6efd',
    '--accent-blue-light': '#0d6efd',
    '--success': '#198754',
    '--danger': '#dc3545',
    '--warning': '#ffc107'
  }
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const applyTheme = (themeName) => {
    const themeColors = themes[themeName];
    if (!themeColors) return;

    const root = document.documentElement;
    Object.keys(themeColors).forEach(key => {
      root.style.setProperty(key, themeColors[key]);
    });

    document.body.classList.toggle('light-theme', themeName === 'light');
    localStorage.setItem('theme', themeName);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const value = {
    theme,
    toggleTheme,
    isDark: theme === 'dark'
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
