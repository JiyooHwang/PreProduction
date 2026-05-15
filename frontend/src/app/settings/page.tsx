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
      </main>
    </div>
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
