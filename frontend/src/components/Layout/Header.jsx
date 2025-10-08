import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Button from '../UI/Button';

export default function Header({ title }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const getUserDisplayName = () => {
    if (user?.role === 'governor') {
      return 'Губернатор Липецкой области';
    }
    return user?.municipality_name || 'Администратор';
  };

  return (
    <header style={{ borderBottom: '1px solid var(--border)', padding: '16px 0', marginBottom: '24px' }}>
      <div className="container">
        <div className="flex-between">
          <div>
            <h1 style={{ margin: 0, fontSize: '24px' }}>{title || 'Система отчётности'}</h1>
            {user && (
              <p className="text-secondary" style={{ margin: '4px 0 0 0', fontSize: '14px' }}>
                <strong style={{ color: 'var(--accent-blue-light)' }}>
                  {getUserDisplayName()}
                </strong>
              </p>
            )}
          </div>

          {user && (
            <div className="flex gap-2">
              <Button variant="secondary" size="small" onClick={toggleTheme}>
                {theme === 'dark' ? '🌙 Темная тема' : '☀️ Светлая тема'}
              </Button>
              <Button variant="secondary" size="small" onClick={logout}>
                Выйти
              </Button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
