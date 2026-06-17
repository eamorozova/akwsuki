import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { CompareReleaseDeltaResult } from '../types';
import { Combobox } from '../components/Combobox';
import { Field } from '../components/Field';
import { ReleaseDeltaTable } from '../components/ReleaseDeltaTable';

interface Prefs {
  fp: string;
  branchR1: string;
  branchR2: string;
  env1: string;
  env2: string;
}

const PREFS_KEY = 'sledilo-rd-prefs';
function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
}

export function ReleaseDeltaPage() {
  const p0 = useRef(loadPrefs()).current;

  const [fps, setFps] = useState<string[]>([]);
  const [fp, setFp] = useState(p0.fp ?? '');
  const [branchR1, setBranchR1] = useState(p0.branchR1 ?? '');
  const [branchR2, setBranchR2] = useState(p0.branchR2 ?? '');
  const [envs, setEnvs] = useState<string[]>([]);
  const [loadingEnvs, setLoadingEnvs] = useState(false);
  const [env1, setEnv1] = useState(p0.env1 ?? '');
  const [env2, setEnv2] = useState(p0.env2 ?? '');
  const [result, setResult] = useState<CompareReleaseDeltaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.fps().then((x) => setFps(x.map((f) => f.name))).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ fp, branchR1, branchR2, env1, env2 }));
  }, [fp, branchR1, branchR2, env1, env2]);

  const changeFp = (newFp: string) => {
    setFp(newFp);
    setBranchR1('');
    setBranchR2('');
    setEnv1('');
    setEnv2('');
    setResult(null);
  };

  // окружения берём из релиза1 (имена окружений общие для веток)
  useEffect(() => {
    if (!fp || !branchR1) {
      setEnvs([]);
      setEnv1('');
      setEnv2('');
      return;
    }
    setLoadingEnvs(true);
    api
      .envs(fp, branchR1)
      .then((list) => {
        setEnvs(list);
        setEnv1((cur) => (list.includes(cur) ? cur : ''));
        setEnv2((cur) => (list.includes(cur) ? cur : ''));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingEnvs(false));
  }, [fp, branchR1]);

  const canCompare = Boolean(fp && branchR1 && branchR2 && env1 && env2);

  const doCompare = async () => {
    setError('');
    setLoading(true);
    setResult(null);
    try {
      setResult(await api.compareReleaseDelta(fp, env1, env2, branchR1, branchR2));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const envSelect = (value: string, onChange: (v: string) => void) => (
    <select value={value} disabled={!branchR1 || loadingEnvs} onChange={(e) => onChange(e.target.value)}>
      <option value="">{loadingEnvs ? 'загрузка…' : 'окружение'}</option>
      {envs.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );

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
          <span className="side-badge r1">Р1</span>
          <Field label="Ветка 1">
            <Combobox value={branchR1} onChange={setBranchR1} disabled={!fp} placeholder="ветка" fetchOptions={(q) => api.branches(fp, q)} />
          </Field>
        </div>

        <div className="side">
          <span className="side-badge r2">Р2</span>
          <Field label="Ветка 2">
            <Combobox value={branchR2} onChange={setBranchR2} disabled={!fp} placeholder="ветка" fetchOptions={(q) => api.branches(fp, q)} />
          </Field>
        </div>

        <div className="side">
          <span className="side-badge a">1</span>
          <Field label="Окружение 1">{envSelect(env1, setEnv1)}</Field>
        </div>

        <div className="side">
          <span className="side-badge b">2</span>
          <Field label="Окружение 2">{envSelect(env2, setEnv2)}</Field>
        </div>

        <button className="primary" disabled={!canCompare || loading} onClick={doCompare}>
          {loading ? 'Сравниваю…' : 'Сравнить'}
        </button>
      </section>

      {error && <div className="error">{error}</div>}

      {loading && (
        <div className="loading-block">
          <span className="spinner" /> Загрузка сравнения… (читаются 4 стенда)
        </div>
      )}

      {!loading && result && <ReleaseDeltaTable result={result} />}
    </>
  );
}
