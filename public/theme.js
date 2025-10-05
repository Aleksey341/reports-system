// Theme switcher for all pages
// This file should be included in all HTML pages

(function() {
  'use strict';

  // CSS variables for themes
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

  // Apply theme
  function applyTheme(themeName) {
    const theme = themes[themeName];
    if (!theme) return;

    const root = document.documentElement;
    Object.keys(theme).forEach(key => {
      root.style.setProperty(key, theme[key]);
    });

    document.body.classList.toggle('light-theme', themeName === 'light');
  }

  // Toggle theme
  window.toggleTheme = function() {
    const currentTheme = localStorage.getItem('theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);

    // Update button text if exists
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.innerHTML = newTheme === 'dark' ? '🌙 Темная тема' : '☀️ Светлая тема';
    }

    // Refresh dashboard charts if function exists
    if (typeof window.refreshDashboard === 'function') {
      window.refreshDashboard();
    }
  };

  // Load saved theme on page load
  const savedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(savedTheme);

  // Update button text on load
  document.addEventListener('DOMContentLoaded', function() {
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.innerHTML = savedTheme === 'dark' ? '🌙 Темная тема' : '☀️ Светлая тема';
      themeToggle.addEventListener('click', window.toggleTheme);
    }
  });
})();
