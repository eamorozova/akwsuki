import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { CompareMode, CompareResult } from '../types';
import { CompareTable } from '../components/CompareTable';
import { Combobox } from '../components/Combobox';
import { Field } from '../components/Field';

interface Prefs {
  fp: string;
  branchA: string;
  branchB: string;
  envA: string;
  envB: string;
  mode: CompareMode;
  scope: string;
}

const PREFS_KEY = 'sledilo-prefs';
function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
}

export function ComparePage() {
  const p0 = useRef(loadPrefs()).current;

  const [fps, setFps] = useState<string[]>([]);
  const [fp, setFp] = useState(p0.fp ?? '');
  const [branchA, setBranchA] = useState(p0.branchA ?? '');
  const [branchB, setBranchB] = useState(p0.branchB ?? '');
  const [envsA, setEnvsA] = useState<string[]>([]);
  const [envsB, setEnvsB] = useState<string[]>([]);
  const [envA, setEnvA] = useState(p0.envA ?? '');
  const [envB, setEnvB] = useState(p0.envB ?? '');
  const [loadingEnvsA, setLoadingEnvsA] = useState(false);
  const [loadingEnvsB, setLoadingEnvsB] = useState(false);
  const [mode, setMode] = useState<CompareMode>(p0.mode ?? 'by_file');
  const [scopes, setScopes] = useState<string[]>([]);
  const [scope, setScope] = useState(p0.scope ?? '');
  const [loadingScopes, setLoadingScopes] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.fps().then((x) => setFps(x.map((f) => f.name))).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ fp, branchA, branchB, envA, envB, mode, scope }));
  }, [fp, branchA, branchB, envA, envB, mode, scope]);

  const changeFp = (newFp: string) => {
    setFp(newFp);
    setBranchA('');
    setBranchB('');
    setEnvA('');
    setEnvB('');
    setScope('');
    setResult(null);
  };

  useEffect(() => {
    if (!fp || !branchA) {
      setEnvsA([]);
      setEnvA('');
      return;
    }
    setLoadingEnvsA(true);
    api
      .envs(fp, branchA)
      .then((list) => {
        setEnvsA(list);
        setEnvA((cur) => (list.includes(cur) ? cur : ''));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingEnvsA(false));
  }, [fp, branchA]);

  useEffect(() => {
    if (!fp || !branchB) {
      setEnvsB([]);
      setEnvB('');
      return;
    }
    setLoadingEnvsB(true);
    api
      .envs(fp, branchB)
      .then((list) => {
        setEnvsB(list);
        setEnvB((cur) => (list.includes(cur) ? cur : ''));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingEnvsB(false));
  }, [fp, branchB]);

  useEffect(() => {
    if (!fp || !branchA || !envA) {
      setScopes([]);
      setScope('');
      return;
    }
    setLoadingScopes(true);
    api
      .scopes(fp, branchA, envA)
      .then((list) => {
        setScopes(list);
        setScope((cur) => (list.includes(cur) ? cur : ''));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingScopes(false));
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
    <>
      <section className="controls">
        <Field label="ФП">
          <select value={fp} onChange={(e) => changeFp(e.target.value)}>
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
            <Combobox value={branchA} onChange={setBranchA} disabled={!fp} placeholder="ветка" fetchOptions={(q) => api.branches(fp, q)} />
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
            <Combobox value={branchB} onChange={setBranchB} disabled={!fp} placeholder="ветка" fetchOptions={(q) => api.branches(fp, q)} />
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
                  scopes.map((sc) => (
                    <option key={sc} value={sc}>
                      {sc === '' ? '(корень / весь стенд)' : sc}
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
          <span className="spinner" /> Загрузка сравнения…
        </div>
      )}

      {!loading && result && <CompareTable result={result} />}
    </>
  );
}
