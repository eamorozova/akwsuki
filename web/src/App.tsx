import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import type { CompareMode, CompareResult } from './types';
import { CompareTable } from './components/CompareTable';

export function App() {
  const [fps, setFps] = useState<string[]>([]);
  const [fp, setFp] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [branchA, setBranchA] = useState('');
  const [branchB, setBranchB] = useState('');
  const [envsA, setEnvsA] = useState<string[]>([]);
  const [envsB, setEnvsB] = useState<string[]>([]);
  const [envA, setEnvA] = useState('');
  const [envB, setEnvB] = useState('');
  const [mode, setMode] = useState<CompareMode>('by_file');
  const [scopes, setScopes] = useState<string[]>([]);
  const [scope, setScope] = useState('');
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.fps().then((x) => setFps(x.map((f) => f.name))).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!fp) return;
    setBranches([]);
    setBranchA('');
    setBranchB('');
    setEnvsA([]);
    setEnvsB([]);
    setEnvA('');
    setEnvB('');
    setResult(null);
    api.branches(fp).then(setBranches).catch((e) => setError(String(e)));
  }, [fp]);

  useEffect(() => {
    setEnvA('');
    setEnvsA([]);
    if (fp && branchA) api.envs(fp, branchA).then(setEnvsA).catch((e) => setError(String(e)));
  }, [fp, branchA]);

  useEffect(() => {
    setEnvB('');
    setEnvsB([]);
    if (fp && branchB) api.envs(fp, branchB).then(setEnvsB).catch((e) => setError(String(e)));
  }, [fp, branchB]);

  // области (для режима «слитый») берём со стороны A
  useEffect(() => {
    setScopes([]);
    setScope('');
    if (fp && branchA && envA) api.scopes(fp, branchA, envA).then(setScopes).catch((e) => setError(String(e)));
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
      </header>

      <section className="controls">
        <Field label="ФП">
          <Select value={fp} onChange={setFp} options={fps} placeholder="выбрать ФП" />
        </Field>

        <div className="side">
          <div className="side-title">Сторона A</div>
          <Field label="Ветка">
            <Select value={branchA} onChange={setBranchA} options={branches} disabled={!fp} placeholder="ветка" />
          </Field>
          <Field label="Окружение">
            <Select value={envA} onChange={setEnvA} options={envsA} disabled={!branchA} placeholder="окружение" />
          </Field>
        </div>

        <div className="side">
          <div className="side-title">Сторона B</div>
          <Field label="Ветка">
            <Select value={branchB} onChange={setBranchB} options={branches} disabled={!fp} placeholder="ветка" />
          </Field>
          <Field label="Окружение">
            <Select value={envB} onChange={setEnvB} options={envsB} disabled={!branchB} placeholder="окружение" />
          </Field>
        </div>

        <div className="side">
          <div className="side-title">Режим</div>
          <Field label="Сравнение">
            <select value={mode} onChange={(e) => setMode(e.target.value as CompareMode)}>
              <option value="by_file">по файлам</option>
              <option value="merged">слитый (переопределения)</option>
            </select>
          </Field>
          {mode === 'merged' && (
            <Field label="Область">
              <select value={scope} onChange={(e) => setScope(e.target.value)} disabled={!scopes.length}>
                {scopes.map((s) => (
                  <option key={s} value={s}>
                    {s === '' ? '(корень / весь стенд)' : s}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <button className="primary" disabled={!canCompare || loading} onClick={doCompare}>
          {loading ? '…' : 'Сравнить'}
        </button>
      </section>

      {error && <div className="error">{error}</div>}
      {result && <CompareTable result={result} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder ?? '—'}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
