import { useState, useEffect } from 'react';
import { municipalitiesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function LoginModal({ show, onClose }) {
  const { login, error: authError } = useAuth();
  const [municipalities, setMunicipalities] = useState([]);
  const [municipalityId, setMunicipalityId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (show) {
      loadMunicipalities();
      setPassword('');
      setError('');
    }
  }, [show]);

  const loadMunicipalities = async () => {
    try {
      const data = await municipalitiesAPI.getAll();
      setMunicipalities(data);
    } catch (err) {
      console.error('Failed to load municipalities:', err);
      setError('Ошибка загрузки муниципалитетов');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!municipalityId || !password) {
      setError('Выберите муниципалитет и введите пароль');
      return;
    }

    setLoading(true);
    const result = await login(municipalityId, password);
    setLoading(false);

    if (result.success) {
      onClose();
    } else {
      setError(result.error);
    }
  };

  if (!show) return null;

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2 style={{ marginBottom: '24px' }}>Авторизация</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="municipality">
              Муниципалитет
            </label>
            <select
              id="municipality"
              className="form-select"
              value={municipalityId}
              onChange={(e) => setMunicipalityId(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Выберите муниципалитет --</option>
              <option value="admin">Администратор</option>
              <option value="governor">Губернатор Липецкой области</option>
              {municipalities.map((mun) => (
                <option key={mun.id} value={mun.id}>
                  {mun.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Пароль
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                style={{ paddingRight: '40px' }}
              />
              <span
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </span>
            </div>
          </div>

          {(error || authError) && (
            <div className="text-danger" style={{ fontSize: '14px', marginTop: '12px' }}>
              {error || authError}
            </div>
          )}

          <button type="submit" className="btn" style={{ width: '100%', marginTop: '8px' }} disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>

          <div className="text-center" style={{ marginTop: '16px' }}>
            <a href="/change-password" style={{ fontSize: '14px' }}>
              Сменить пароль
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
