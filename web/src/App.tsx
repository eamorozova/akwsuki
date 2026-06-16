import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import type { CompareMode, CompareResult } from './types';
import { CompareTable } from './components/CompareTable';
import { Combobox } from './components/Combobox';

type Theme = 'light' | 'dark';

export function App() {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem('sledilo-theme') as Theme) || 'light',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('sledilo-theme', theme);
  }, [theme]);

  const [fps, setFps] = useState<string[]>([]);
  const [fp, setFp] = useState('');
  const [branchA, setBranchA] = useState('');
  const [branchB, setBranchB] = useState('');
  const [envsA, setEnvsA] = useState<string[]>([]);
  const [envsB, setEnvsB] = useState<string[]>([]);
  const [envA, setEnvA] = useState('');
  const [envB, setEnvB] = useState('');
  const [loadingEnvsA, setLoadingEnvsA] = useState(false);
  const [loadingEnvsB, setLoadingEnvsB] = useState(false);
  const [mode, setMode] = useState<CompareMode>('by_file');
  const [scopes, setScopes] = useState<string[]>([]);
  const [scope, setScope] = useState('');
  const [loadingScopes, setLoadingScopes] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.fps().then((x) => setFps(x.map((f) => f.name))).catch((e) => setError(String(e)));
  }, []);

  // сброс при смене ФП
  useEffect(() => {
    setBranchA('');
    setBranchB('');
    setEnvsA([]);
    setEnvsB([]);
    setEnvA('');
    setEnvB('');
    setScopes([]);
    setScope('');
    setResult(null);
  }, [fp]);

  useEffect(() => {
    setEnvA('');
    setEnvsA([]);
    if (!fp || !branchA) return;
    setLoadingEnvsA(true);
    api.envs(fp, branchA).then(setEnvsA).catch((e) => setError(String(e))).finally(() => setLoadingEnvsA(false));
  }, [fp, branchA]);

  useEffect(() => {
    setEnvB('');
    setEnvsB([]);
    if (!fp || !branchB) return;
    setLoadingEnvsB(true);
    api.envs(fp, branchB).then(setEnvsB).catch((e) => setError(String(e))).finally(() => setLoadingEnvsB(false));
  }, [fp, branchB]);

  // области для «слитого» режима — со стороны A
  useEffect(() => {
    setScope('');
    setScopes([]);
    if (!fp || !branchA || !envA) return;
    setLoadingScopes(true);
    api.scopes(fp, branchA, envA).then(setScopes).catch((e) => setError(String(e))).finally(() => setLoadingScopes(false));
  }, [fp, branchA, envA]);

  const canCompare = Boolean(fp && branchA && envA && branchB && envB);

  const doCompare = async () => {
    setError('');
    setLoading(true);
    setResult(null);
    try {
      setResult(
        await api.compare(fp, { branch: branchA, env: envA }, { branch: branchB, env: envB }, mode, scope),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>sledilo</h1>
        <span className="sub">сверка конфигов стендов</span>
        <button className="theme" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title="Тема">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </header>

      <section className="controls">
        <Field label="ФП">
          <select value={fp} onChange={(e) => setFp(e.target.value)}>
            <option value="">выбрать ФП</option>
            {fps.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>

        <div className="side">
          <span className="side-badge a">A</span>
          <Field label="Ветка">
            <Combobox
              value={branchA}
              onChange={setBranchA}
              disabled={!fp}
              placeholder="ветка"
              fetchOptions={(q) => api.branches(fp, q)}
            />
          </Field>
          <Field label="Окружение">
            <select value={envA} disabled={!branchA || loadingEnvsA} onChange={(e) => setEnvA(e.target.value)}>
              <option value="">{loadingEnvsA ? 'загрузка…' : 'окружение'}</option>
              {envsA.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="side">
          <span className="side-badge b">B</span>
          <Field label="Ветка">
            <Combobox
              value={branchB}
              onChange={setBranchB}
              disabled={!fp}
              placeholder="ветка"
              fetchOptions={(q) => api.branches(fp, q)}
            />
          </Field>
          <Field label="Окружение">
            <select value={envB} disabled={!branchB || loadingEnvsB} onChange={(e) => setEnvB(e.target.value)}>
              <option value="">{loadingEnvsB ? 'загрузка…' : 'окружение'}</option>
              {envsB.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="side">
          <Field label="Режим">
            <select value={mode} onChange={(e) => setMode(e.target.value as CompareMode)}>
              <option value="by_file">по файлам</option>
              <option value="merged">слитый</option>
            </select>
          </Field>
          {mode === 'merged' && (
            <Field label="Область">
              <select value={scope} disabled={loadingScopes} onChange={(e) => setScope(e.target.value)}>
                {loadingScopes && <option value="">загрузка…</option>}
                {!loadingScopes &&
                  scopes.map((s) => (
                    <option key={s} value={s}>
                      {s === '' ? '(корень / весь стенд)' : s}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </div>

        <button className="primary" disabled={!canCompare || loading} onClick={doCompare}>
          {loading ? 'Сравниваю…' : 'Сравнить'}
        </button>
      </section>

      {error && <div className="error">{error}</div>}

      {loading && (
        <div className="loading-block">
          <span className="spinner" /> Загрузка сравнения… на больших стендах это может занять время
        </div>
      )}

      {!loading && result && <CompareTable result={result} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
