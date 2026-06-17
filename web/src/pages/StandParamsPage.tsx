import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { CompareStandsResult, StandInfo } from '../types';
import { Combobox } from '../components/Combobox';
import { Field } from '../components/Field';
import { StandParamsTable } from '../components/StandParamsTable';

interface Prefs {
  fp: string;
  branch1: string;
  branch2: string;
  stand1: string;
  stand2: string;
}

const PREFS_KEY = 'sledilo-sp-prefs';
function loadPrefs(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<Prefs>;
  } catch {
    return {};
  }
}

export function StandParamsPage() {
  const p0 = useRef(loadPrefs()).current;

  const [fps, setFps] = useState<string[]>([]);
  const [fp, setFp] = useState(p0.fp ?? '');
  const [branch1, setBranch1] = useState(p0.branch1 ?? '');
  const [branch2, setBranch2] = useState(p0.branch2 ?? '');
  const [stands1, setStands1] = useState<StandInfo[]>([]);
  const [stands2, setStands2] = useState<StandInfo[]>([]);
  const [stand1, setStand1] = useState(p0.stand1 ?? '');
  const [stand2, setStand2] = useState(p0.stand2 ?? '');
  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [result, setResult] = useState<CompareStandsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.fps().then((x) => setFps(x.map((f) => f.name))).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ fp, branch1, branch2, stand1, stand2 }));
  }, [fp, branch1, branch2, stand1, stand2]);

  const changeFp = (newFp: string) => {
    setFp(newFp);
    setBranch1('');
    setBranch2('');
    setStand1('');
    setStand2('');
    setResult(null);
  };

  useEffect(() => {
    if (!fp || !branch1) {
      setStands1([]);
      setStand1('');
      return;
    }
    setLoading1(true);
    api
      .stands(fp, branch1)
      .then((list) => {
        setStands1(list);
        setStand1((cur) => (list.some((s) => s.alias === cur) ? cur : ''));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading1(false));
  }, [fp, branch1]);

  useEffect(() => {
    if (!fp || !branch2) {
      setStands2([]);
      setStand2('');
      return;
    }
    setLoading2(true);
    api
      .stands(fp, branch2)
      .then((list) => {
        setStands2(list);
        setStand2((cur) => (list.some((s) => s.alias === cur) ? cur : ''));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading2(false));
  }, [fp, branch2]);

  const canCompare = Boolean(fp && branch1 && branch2 && stand1 && stand2);

  const doCompare = async () => {
    setError('');
    setLoading(true);
    setResult(null);
    try {
      setResult(await api.compareStands(fp, branch1, stand1, branch2, stand2));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const standSelect = (
    stands: StandInfo[],
    value: string,
    onChange: (v: string) => void,
    branch: string,
    loadingStands: boolean,
  ) => (
    <select value={value} disabled={!branch || loadingStands} onChange={(e) => onChange(e.target.value)}>
      <option value="">{loadingStands ? 'загрузка…' : 'стенд'}</option>
      {stands.map((s) => (
        <option key={s.alias} value={s.alias}>
          {s.alias}
          {s.env ? ` · ${s.env}` : ''}
        </option>
      ))}
    </select>
  );

  return (
    <>
      <p className="page-hint">
        Сравнение параметров стендов из <code>vars/get_stand_params.groovy</code> — двух стендов на
        произвольных ветках.
      </p>

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
          <Field label="Ветка 1">
            <Combobox value={branch1} onChange={setBranch1} disabled={!fp} placeholder="ветка" fetchOptions={(q) => api.branches(fp, q)} />
          </Field>
          <Field label="Стенд 1">{standSelect(stands1, stand1, setStand1, branch1, loading1)}</Field>
        </div>

        <div className="side">
          <span className="side-badge b">B</span>
          <Field label="Ветка 2">
            <Combobox value={branch2} onChange={setBranch2} disabled={!fp} placeholder="ветка" fetchOptions={(q) => api.branches(fp, q)} />
          </Field>
          <Field label="Стенд 2">{standSelect(stands2, stand2, setStand2, branch2, loading2)}</Field>
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

      {!loading && result && <StandParamsTable result={result} />}
    </>
  );
}
