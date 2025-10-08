import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import LoginModal from '../components/Auth/LoginModal';

export default function HomePage() {
  const { user, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
    }
  }, [isAuthenticated]);

  const getUserDisplayName = () => {
    if (user?.role === 'governor') {
      return 'Губернатор Липецкой области';
    }
    return user?.municipality_name || 'Администратор';
  };

  const getCardsForRole = () => {
    const operatorCards = [
      { title: 'Форма 1-ГМУ', desc: 'Внесение ежемесячных показателей.', href: '/form', icon: '📝' },
      { title: 'Статистика ГИБДД', desc: 'Статистика дорожно-транспортных происшествий.', href: '/gibdd', icon: '🚗' },
      { title: 'Финансы Муниципалитеты', desc: 'Финансовые показатели муниципалитетов.', href: '/finance', icon: '💰' }
    ];

    const adminCard = {
      title: 'Общий дашборд',
      desc: 'Агрегированная статистика по всем направлениям.',
      href: '/dashboard',
      icon: '📊'
    };

    if (user?.role === 'admin') {
      return [...operatorCards, adminCard];
    } else if (user?.role === 'governor') {
      return [adminCard];
    } else {
      return operatorCards;
    }
  };

  return (
    <>
      <LoginModal show={showLoginModal} onClose={() => setShowLoginModal(false)} />

      {isAuthenticated && (
        <div style={{ minHeight: '100vh' }}>
          <header className="container">
            <div className="flex-between mb-2">
              <h1>Система отчётности</h1>
              <div className="flex gap-2">
                <div className="text-secondary" style={{ fontSize: '14px', alignSelf: 'center' }}>
                  <strong style={{ color: 'var(--accent-blue-light)' }}>
                    {getUserDisplayName()}
                  </strong>
                </div>
                <button onClick={toggleTheme} className="btn-secondary">
                  {theme === 'dark' ? '🌙 Темная тема' : '☀️ Светлая тема'}
                </button>
                <button onClick={logout} className="btn-secondary">
                  Выйти
                </button>
              </div>
            </div>

            <p className="text-muted mb-2">Быстрые ссылки:</p>

            <div className="grid grid-3">
              {getCardsForRole().map((card) => (
                <div
                  key={card.href}
                  className="card"
                  onClick={() => navigate(card.href)}
                  style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden' }}
                >
                  <div
                    style={{
                      fontSize: '2.5rem',
                      marginBottom: '12px',
                      opacity: 0.9,
                      display: 'inline-block',
                      transition: 'transform 0.3s ease'
                    }}
                  >
                    {card.icon}
                  </div>
                  <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem' }}>{card.title}</h3>
                  <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', lineHeight: 1.5 }}>
                    {card.desc}
                  </p>
                  <span style={{ color: 'var(--accent-blue-light)', fontWeight: 500 }}>
                    Открыть →
                  </span>
                </div>
              ))}
            </div>
          </header>

          <footer style={{ opacity: 0.7, padding: '24px', textAlign: 'center' }}>
            <span className="text-muted">© АНО "Область Будущего"</span>
          </footer>
        </div>
      )}
    </>
  );
}
