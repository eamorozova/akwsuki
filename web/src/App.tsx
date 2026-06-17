import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ComparePage } from './pages/ComparePage';
import { ReleaseDeltaPage } from './pages/ReleaseDeltaPage';

type Theme = 'light' | 'dark';

export function App() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('sledilo-theme') as Theme) || 'light',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('sledilo-theme', theme);
  }, [theme]);

  return (
    <div className="app">
      <header>
        <h1>sledilo</h1>
        <nav className="nav">
          <NavLink to="/compare" className={({ isActive }) => (isActive ? 'active' : '')}>
            Сравнение
          </NavLink>
          <NavLink to="/release-delta" className={({ isActive }) => (isActive ? 'active' : '')}>
            Дельта релизов
          </NavLink>
        </nav>
        <button className="theme" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Тема">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </header>

      <Routes>
        <Route path="/" element={<Navigate to="/compare" replace />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/release-delta" element={<ReleaseDeltaPage />} />
        <Route path="*" element={<Navigate to="/compare" replace />} />
      </Routes>
    </div>
  );
}
