import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { CompareRssResult } from '../types';
import { Combobox } from '../components/Combobox';
import { Field } from '../components/Field';
import { RssTable } from '../components/RssTable';

interface Prefs {
  fp: string;
  branchA: string;
  envA: string;
  standA: string;
  branchB: string;
  envB: string;
  standB: string;
}

const PREFS_KEY = 'sledilo-rss-prefs';
function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
}

export function RssPage() {
  const p0 = useRef(loadPrefs()).current;

  const [fps, setFps] = useState<string[]>([]);
  const [fp, setFp] = useState(p0.fp ?? '');
  const [branchA, setBranchA] = useState(p0.branchA ?? '');
  const [branchB, setBranchB] = useState(p0.branchB ?? '');
  const [envsA, setEnvsA] = useState<string[]>([]);
  const [envsB, setEnvsB] = useState<string[]>([]);
  const [envA, setEnvA] = useState(p0.envA ?? '');
  const [envB, setEnvB] = useState(p0.envB ?? '');
  const [standsA, setStandsA] = useState<string[]>([]);
  const [standsB, setStandsB] = useState<string[]>([]);
  const [standA, setStandA] = useState(p0.standA ?? '');
  const [standB, setStandB] = useState(p0.standB ?? '');
  const [result, setResult] = useState<CompareRssResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.gitopsFps().then((x) => setFps(x.map((f) => f.name))).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ fp, branchA, envA, standA, branchB, envB, standB }));
  }, [fp, branchA, envA, standA, branchB, envB, standB]);

  const changeFp = (newFp: string) => {
    setFp(newFp);
    setBranchA('');
    setBranchB('');
    setEnvA('');
    setEnvB('');
    setStandA('');
    setStandB('');
    setResult(null);
  };

  // окружения по ветке
  useEffect(() => {
    setEnvsA([]);
    setEnvA('');
    if (fp && branchA) api.gitopsEnvs(fp, branchA).then(setEnvsA).catch((e) => setError(String(e)));
  }, [fp, branchA]);
  useEffect(() => {
    setEnvsB([]);
    setEnvB('');
    if (fp && branchB) api.gitopsEnvs(fp, branchB).then(setEnvsB).catch((e) => setError(String(e)));
  }, [fp, branchB]);

  // стенды по ветке+окружению
  useEffect(() => {
    setStandsA([]);
    setStandA('');
    if (fp && branchA && envA) api.gitopsStands(fp, branchA, envA).then(setStandsA).catch((e) => setError(String(e)));
  }, [fp, branchA, envA]);
  useEffect(() => {
    setStandsB([]);
    setStandB('');
    if (fp && branchB && envB) api.gitopsStands(fp, branchB, envB).then(setStandsB).catch((e) => setError(String(e)));
  }, [fp, branchB, envB]);

  const canCompare = Boolean(fp && branchA && envA && standA && branchB && envB && standB);

  const doCompare = async () => {
    setError('');
    setLoading(true);
    setResult(null);
    try {
      setResult(
        await api.compareRss(
          fp,
          { branch: branchA, env: envA, stand: standA },
          { branch: branchB, env: envB, stand: standB },
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const sel = (value: string, onChange: (v: string) => void, opts: string[], disabled: boolean, ph: string) => (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      <option value="">{ph}</option>
      {opts.map((o) => (
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
          <span className="side-badge a">A</span>
          <Field label="Ветка">
            <Combobox value={branchA} onChange={setBranchA} disabled={!fp} placeholder="ветка" fetchOptions={(q) => api.branches(fp, q, 'gitops')} />
          </Field>
          <Field label="Окружение">{sel(envA, setEnvA, envsA, !branchA, 'окружение')}</Field>
          <Field label="Стенд">{sel(standA, setStandA, standsA, !envA, 'стенд')}</Field>
        </div>

        <div className="side">
          <span className="side-badge b">B</span>
          <Field label="Ветка">
            <Combobox value={branchB} onChange={setBranchB} disabled={!fp} placeholder="ветка" fetchOptions={(q) => api.branches(fp, q, 'gitops')} />
          </Field>
          <Field label="Окружение">{sel(envB, setEnvB, envsB, !branchB, 'окружение')}</Field>
          <Field label="Стенд">{sel(standB, setStandB, standsB, !envB, 'стенд')}</Field>
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

      {!loading && result && <RssTable result={result} />}
    </>
  );
}
