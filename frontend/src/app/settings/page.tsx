"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Header } from "@/components/Header";
import { useApi } from "@/lib/api";

export default function SettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const api = useApi();
  const { data: me, mutate } = api.me();

  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  const save = async () => {
    if (!key.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.setGeminiKey(key.trim());
      setKey("");
      setMessage("저장되었습니다.");
      await mutate();
    } catch (e: any) {
      setMessage(`저장 실패: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (status !== "authenticated") return null;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-xl font-bold mb-6">설정</h1>

        <section className="bg-white rounded-2xl shadow p-6">
          <h2 className="font-semibold mb-1">Gemini API 키</h2>
          <p className="text-sm text-slate-500 mb-4">
            샷 분석에 사용됩니다. 키는 본인 계정에만 저장되며 다른 팀원과 공유되지 않습니다.{" "}
            <a
              className="underline"
              href="https://aistudio.google.com"
              target="_blank"
              rel="noreferrer"
            >
              여기서 무료 발급
            </a>
            .
          </p>
          <div className="text-sm mb-3">
            현재 상태:{" "}
            <span className={me?.has_gemini_key ? "text-emerald-600" : "text-amber-600"}>
              {me?.has_gemini_key ? "등록됨" : "미등록"}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="AIza..."
              className="flex-1 border rounded-lg px-3 py-2 font-mono text-sm"
              type="password"
            />
            <button
              onClick={save}
              disabled={saving || !key.trim()}
              className="bg-slate-900 text-white px-5 py-2 rounded-lg disabled:opacity-50"
            >
              저장
            </button>
          </div>
          {message && <div className="mt-3 text-sm text-slate-600">{message}</div>}
        </section>

        <GradeThresholdsSection />
        <UnitPricesSection />
      </main>
    </div>
  );
}


function UnitPricesSection() {
  const api = useApi();
  const { data: me, mutate } = api.me();
  const cur = me?.unit_prices ?? null;

  // 로컬 상태 (currency + 16개 단가 + shot_unit)
  const [currency, setCurrency] = useState<string>("KRW");
  const [chars, setChars] = useState({ S: 0, AA: 0, A: 0, C: 0 });
  const [locs, setLocs] = useState({ S: 0, AA: 0, A: 0, C: 0 });
  const [props_, setProps] = useState({ S: 0, AA: 0, A: 0, C: 0 });
  const [fxs, setFxs] = useState({ S: 0, AA: 0, A: 0, C: 0 });
  const [shotUnit, setShotUnit] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!cur) return;
    setCurrency(cur.currency || "KRW");
    setChars(cur.assets.characters);
    setLocs(cur.assets.locations);
    setProps(cur.assets.props);
    setFxs(cur.assets.fx);
    setShotUnit(cur.shot_unit);
  }, [cur]);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.setUnitPrices({
        currency,
        assets: { characters: chars, locations: locs, props: props_, fx: fxs },
        shot_unit: shotUnit,
      });
      await mutate();
      setMsg("저장되었습니다.");
    } catch (e: any) {
      setMsg(`저장 실패: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!confirm("모든 단가를 0으로 초기화할까요?")) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.resetUnitPrices();
      await mutate();
      setMsg("초기화되었습니다.");
    } catch (e: any) {
      setMsg(`초기화 실패: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const fmt = (n: number) => (n ? n.toLocaleString() : "0");

  const total =
    chars.S + chars.AA + chars.A + chars.C +
    locs.S + locs.AA + locs.A + locs.C +
    props_.S + props_.AA + props_.A + props_.C +
    fxs.S + fxs.AA + fxs.A + fxs.C +
    shotUnit;

  return (
    <section className="bg-white rounded-2xl shadow p-6 mt-6">
      <h2 className="font-semibold mb-1">등급별 단가 (예산 계산용)</h2>
      <p className="text-sm text-slate-500 mb-4">
        시나리오 분석 결과의 캐릭터/장소/소품/FX 를 자동 등급(S/AA/A/C) × 단가로 곱해서 총 비용을 산정합니다.
        샷 단가는 샷 1개당 작업 비용입니다.
      </p>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-slate-600">통화:</label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="border rounded-lg px-2 py-1 text-sm"
        >
          <option value="KRW">KRW (원)</option>
          <option value="USD">USD ($)</option>
          <option value="JPY">JPY (¥)</option>
          <option value="EUR">EUR (€)</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2 border-b font-medium">에셋 종류</th>
              {(["S", "AA", "A", "C"] as const).map((g) => (
                <th key={g} className="text-left px-3 py-2 border-b font-medium">
                  {g}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <PriceRow label="캐릭터" values={chars} onChange={setChars} />
            <PriceRow label="장소/배경" values={locs} onChange={setLocs} />
            <PriceRow label="소품/에셋" values={props_} onChange={setProps} />
            <PriceRow label="특수효과 (FX)" values={fxs} onChange={setFxs} />
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <label className="text-sm text-slate-600 whitespace-nowrap">샷 단가 (1샷):</label>
        <input
          type="number"
          min={0}
          value={shotUnit}
          onChange={(e) => setShotUnit(Number(e.target.value) || 0)}
          className="border rounded-lg px-3 py-2 text-sm w-40"
        />
        <span className="text-xs text-slate-500">{fmt(shotUnit)} {currency}</span>
      </div>

      {total === 0 && (
        <div className="mt-3 text-xs text-amber-600">
          단가가 모두 0이라 예산 계산이 0으로 나옵니다. 회사 기준에 맞게 입력해주세요.
        </div>
      )}

      <div className="flex gap-2 mt-5">
        <button
          onClick={save}
          disabled={busy}
          className="bg-slate-900 text-white px-5 py-2 rounded-lg disabled:opacity-50"
        >
          저장
        </button>
        <button
          onClick={reset}
          disabled={busy}
          className="bg-slate-100 text-slate-700 px-5 py-2 rounded-lg disabled:opacity-50"
        >
          모두 0으로 초기화
        </button>
      </div>
      {msg && <div className="mt-3 text-sm text-slate-600">{msg}</div>}
    </section>
  );
}


function PriceRow({
  label,
  values,
  onChange,
}: {
  label: string;
  values: { S: number; AA: number; A: number; C: number };
  onChange: (v: { S: number; AA: number; A: number; C: number }) => void;
}) {
  return (
    <tr className="border-b">
      <td className="px-3 py-2 font-medium">{label}</td>
      {(["S", "AA", "A", "C"] as const).map((g) => (
        <td key={g} className="px-3 py-2">
          <input
            type="number"
            min={0}
            value={values[g]}
            onChange={(e) =>
              onChange({ ...values, [g]: Number(e.target.value) || 0 })
            }
            className="w-32 border rounded px-2 py-1 text-sm"
            placeholder="0"
          />
        </td>
      ))}
    </tr>
  );
}


function GradeThresholdsSection() {
  const api = useApi();
  const { data: me, mutate } = api.me();
  const defaults = { s: 0.7, aa: 0.3, a: 0.05 };
  const current = me?.grade_thresholds ?? defaults;

  // 화면에서는 %로 표시. 내부에서는 0~1 소수.
  const [s, setS] = useState<number>(Math.round(current.s * 100));
  const [aa, setAa] = useState<number>(Math.round(current.aa * 100));
  const [a, setA] = useState<number>(Math.round(current.a * 100));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setS(Math.round((me?.grade_thresholds?.s ?? defaults.s) * 100));
    setAa(Math.round((me?.grade_thresholds?.aa ?? defaults.aa) * 100));
    setA(Math.round((me?.grade_thresholds?.a ?? defaults.a) * 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.grade_thresholds?.s, me?.grade_thresholds?.aa, me?.grade_thresholds?.a]);

  const valid = s > aa && aa > a && a > 0 && s < 100;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    setMsg(null);
    try {
      await api.setGradeThresholds({ s: s / 100, aa: aa / 100, a: a / 100 });
      setMsg("저장되었습니다. 새 분석부터 적용됩니다.");
      await mutate();
    } catch (e: any) {
      setMsg(`저장 실패: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.resetGradeThresholds();
      setMsg("기본값으로 복원되었습니다.");
      await mutate();
    } catch (e: any) {
      setMsg(`복원 실패: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl shadow p-6 mt-6">
      <h2 className="font-semibold mb-1">난이도 등급 임계값</h2>
      <p className="text-sm text-slate-500 mb-4">
        시나리오 분석 후 각 캐릭터/에셋의 등급을 자동 분류하는 기준입니다. 등장 비율 (전체 샷 대비) 기준으로:
      </p>

      <div className="bg-slate-50 rounded-lg p-3 mb-4 text-xs text-slate-700 space-y-1">
        <div>
          <GradeBadge grade="S" /> 주인공: 전체 샷의{" "}
          <b>{s}%</b> 이상 등장 (또는 main 카테고리)
        </div>
        <div>
          <GradeBadge grade="AA" /> 자주 등장 조연:{" "}
          <b>
            {aa}% ~ {s}%
          </b>{" "}
          등장
        </div>
        <div>
          <GradeBadge grade="A" /> 조연:{" "}
          <b>
            {a}% ~ {aa}%
          </b>{" "}
          등장
        </div>
        <div>
          <GradeBadge grade="C" /> 엑스트라: <b>{a}%</b> 미만 (또는 extra 카테고리)
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">S (주인공) 이상 (%)</label>
          <input
            type="number"
            min={1}
            max={99}
            value={s}
            onChange={(e) => setS(Number(e.target.value))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">AA (자주 조연) 이상 (%)</label>
          <input
            type="number"
            min={1}
            max={99}
            value={aa}
            onChange={(e) => setAa(Number(e.target.value))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">A (조연) 이상 (%)</label>
          <input
            type="number"
            min={1}
            max={99}
            value={a}
            onChange={(e) => setA(Number(e.target.value))}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
      </div>

      {!valid && (
        <div className="mt-2 text-xs text-red-600">
          임계값은 S {">"} AA {">"} A {">"} 0 이고 S {"<"} 100 이어야 합니다.
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button
          onClick={save}
          disabled={!valid || busy}
          className="bg-slate-900 text-white px-5 py-2 rounded-lg disabled:opacity-50"
        >
          저장
        </button>
        <button
          onClick={reset}
          disabled={busy}
          className="bg-slate-100 text-slate-700 px-5 py-2 rounded-lg disabled:opacity-50"
        >
          기본값 (70/30/5)으로 복원
        </button>
      </div>
      {msg && <div className="mt-3 text-sm text-slate-600">{msg}</div>}
    </section>
  );
}


function GradeBadge({ grade }: { grade: string }) {
  const color =
    grade === "S"
      ? "bg-red-100 text-red-800 border-red-300"
      : grade === "AA"
        ? "bg-orange-100 text-orange-800 border-orange-300"
        : grade === "A"
          ? "bg-blue-100 text-blue-800 border-blue-300"
          : "bg-slate-100 text-slate-700 border-slate-300";
  return (
    <span
      className={`inline-block min-w-[28px] text-center text-xs font-bold px-1.5 py-0.5 rounded border ${color}`}
    >
      {grade}
    </span>
  );
}
