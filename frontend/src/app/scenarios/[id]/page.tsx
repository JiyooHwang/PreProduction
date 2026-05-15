"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Header } from "@/components/Header";
import { useApi, type BudgetAnalysis, type ScenarioOut } from "@/lib/api";

type ViewMode = "table" | "card";

export default function ScenarioDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { status } = useSession();
  const router = useRouter();
  const api = useApi();
  const { data: sc, mutate } = api.scenario(id, { refreshInterval: 2000 });

  const [view, setView] = useState<ViewMode>("table");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") return null;

  const isRunning = sc?.status === "running" || sc?.status === "pending";

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/scenarios" className="text-sm text-slate-500 hover:underline">
              ← 시나리오 목록
            </Link>
            <h1 className="text-2xl font-bold mt-1">{sc?.title ?? "..."}</h1>
            <div className="text-sm text-slate-500">
              상태: {statusLabel(sc?.status ?? "")}
              {sc?.error && <span className="text-red-600 ml-2">({sc.error})</span>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isRunning && (
              <button
                onClick={async () => {
                  if (!confirm("분석을 중단할까요?")) return;
                  await api.cancelScenario(id);
                  await mutate();
                }}
                className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700"
              >
                ⏹ 분석 중단
              </button>
            )}
            {sc?.status === "done" && (
              <>
                <a
                  href={api.scenarioExportUrl(id)}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700"
                >
                  Excel 다운로드
                </a>
                {sc.storyboard_status !== "running" && sc.storyboard_status !== "pending" && (
                  <button
                    onClick={async () => {
                      const total = (sc.shots || []).length;
                      if (!confirm(`스토리보드 이미지 ${total}장을 생성합니다. (약 ${total} 분 소요)\n계속할까요?`)) return;
                      await api.startStoryboard(id);
                      await mutate();
                    }}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
                  >
                    🎨 스토리보드 생성
                  </button>
                )}
                {(sc.storyboard_status === "running" || sc.storyboard_status === "pending") && (
                  <button
                    onClick={async () => {
                      if (!confirm("스토리보드 생성을 중단할까요?")) return;
                      await api.cancelStoryboard(id);
                      await mutate();
                    }}
                    className="bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700"
                  >
                    ⏹ 스토리보드 중단
                  </button>
                )}
              </>
            )}
            <button
              onClick={async () => {
                if (!confirm(`'${sc?.title}' 시나리오를 삭제할까요?`)) return;
                await api.deleteScenario(id);
                router.replace("/scenarios");
              }}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            >
              삭제
            </button>
          </div>
        </div>

        {isRunning && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-sm text-blue-800">
            분석 진행 중입니다. 시나리오 길이에 따라 30초~수 분 소요됩니다.
          </div>
        )}

        {sc?.storyboard_status && sc.storyboard_status !== "done" && (
          <div className={
            "border rounded-lg p-4 mb-6 text-sm " +
            (sc.storyboard_status === "failed"
              ? "bg-red-50 border-red-200 text-red-800"
              : "bg-purple-50 border-purple-200 text-purple-800")
          }>
            {sc.storyboard_status === "running" || sc.storyboard_status === "pending" ? (
              <>
                🎨 스토리보드 생성 중... ({sc.storyboard_progress_done} / {sc.storyboard_progress_total})
                <div className="mt-2 h-2 bg-purple-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-600"
                    style={{
                      width: `${sc.storyboard_progress_total > 0
                        ? Math.round((sc.storyboard_progress_done / sc.storyboard_progress_total) * 100)
                        : 0}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <>스토리보드 생성 실패: {sc.storyboard_error}</>
            )}
          </div>
        )}

        {sc?.status === "done" && <StoryboardUsageHint />}

        {sc?.status === "done" && <BudgetCard scenarioId={id} sc={sc} onChanged={() => mutate()} />}

        {sc?.status === "done" && (
          <>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setView("table")}
                className={
                  "px-4 py-2 rounded-lg text-sm " +
                  (view === "table"
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-300 text-slate-700")
                }
              >
                표 형식
              </button>
              <button
                onClick={() => setView("card")}
                className={
                  "px-4 py-2 rounded-lg text-sm " +
                  (view === "card"
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-300 text-slate-700")
                }
              >
                카드 형식
              </button>
            </div>

            <Section
              title="캐릭터"
              items={sc.characters}
              keys={["grade", "name", "category", "description", "notes", "appearance_count", "shot_codes"]}
              view={view}
              scenarioId={id}
              assetType="characters"
              onChanged={() => mutate()}
            />
            <Section
              title="장소"
              items={sc.locations}
              keys={["grade", "name", "category", "time_of_day", "description", "appearance_count", "shot_codes"]}
              view={view}
              scenarioId={id}
              assetType="locations"
              onChanged={() => mutate()}
            />
            <Section
              title="소품/에셋"
              items={sc.props}
              keys={["grade", "name", "category", "description", "appearance_count", "shot_codes"]}
              view={view}
              scenarioId={id}
              assetType="props"
              onChanged={() => mutate()}
            />
            <Section
              title="특수효과 (FX)"
              items={sc.fx}
              keys={["grade", "name", "category", "description", "appearance_count", "shot_codes"]}
              view={view}
              scenarioId={id}
              assetType="fx"
              onChanged={() => mutate()}
            />
            <ShotsSection
              items={sc.shots}
              view={view}
              imageUrl={(idx) => api.storyboardImageUrl(id, idx)}
              storyboardReady={sc.storyboard_status === "done" || (sc.storyboard_progress_done ?? 0) > 0}
              scenarioId={id}
            />
            <Section title="대사" items={sc.dialogues} keys={["scene_number", "character", "line"]} view={view} />
          </>
        )}
      </main>
    </div>
  );
}

function StoryboardUsageHint() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 mb-6 text-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="font-semibold text-purple-900">
          💡 스토리보드 생성 / 재생성 사용법
        </span>
        <span className="text-purple-700 text-xs">{open ? "접기" : "펼치기"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-purple-900">
          <div>
            <b>🎨 스토리보드 생성:</b> 분석된 모든 샷을 한 번에 이미지로 생성합니다.
            샷 N개면 약 N분 소요.
          </div>
          <div>
            <b>🔄 샷 재생성:</b> 마음에 안 드는 샷만 골라 다시 그릴 수 있어요.
            모달에서 <b>샷 사이즈/카메라 앵글/액션</b>을 빠른 편집기로 바꾸거나,
            추가 디렉션(조명, 감정 등)을 더해 프롬프트를 새로 만들 수 있습니다.
            완성된 프롬프트는 직접 더 수정도 가능.
          </div>
          <div>
            <b>🧑‍🎨 캐릭터 일관성:</b>{" "}
            <a href="/characters" className="underline font-semibold">
              캐릭터 라이브러리
            </a>{" "}
            에 캐릭터별 디자인을 등록해두면, 시나리오의 같은 이름 캐릭터가 등장하는
            샷에서 자동으로 그 디자인을 참조 이미지로 활용합니다. 이름은{" "}
            <b>대소문자 무시, 정확히 일치</b>해야 매칭됩니다.
          </div>
          <div className="text-purple-700">
            팁 1: 캐릭터 디자인이 잘 안 반영되면 재생성 시 프롬프트에 &quot;in the style of
            the reference character design&quot; 등 한 줄을 추가해보세요.
          </div>
          <div className="text-purple-700">
            <b>팁 2 (카메라 앵글 변경):</b> 캐릭터 참조 이미지가 카메라 시점도 같이 끌고 와서
            앵글 변경이 약해질 수 있어요. 재생성 모달의{" "}
            <b>&quot;캐릭터 참조 이미지 사용&quot;</b> 체크박스를 <b>끄면</b> 카메라가
            확실히 바뀝니다 (외형은 프롬프트 텍스트로만 유지).
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetCard({
  scenarioId,
  sc,
  onChanged,
}: {
  scenarioId: number;
  sc: ScenarioOut;
  onChanged: () => void;
}) {
  const api = useApi();
  const { data: analysis, mutate: refresh } = api.scenarioBudgetAnalysis(scenarioId, {
    refreshInterval: 0,
  });
  const [budgetInput, setBudgetInput] = useState<string>(
    sc.budget != null ? String(sc.budget) : "",
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBudgetInput(sc.budget != null ? String(sc.budget) : "");
  }, [sc.budget]);

  const save = async () => {
    setBusy(true);
    try {
      const v = budgetInput.trim() === "" ? null : Number(budgetInput);
      if (v !== null && (Number.isNaN(v) || v < 0)) {
        alert("예산은 0 이상의 숫자여야 합니다.");
        return;
      }
      await api.setScenarioBudget(scenarioId, v);
      onChanged();
      await refresh();
    } catch (e: any) {
      alert("저장 실패: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const fmt = (n: number | null | undefined) => {
    if (n == null) return "—";
    return Math.round(n).toLocaleString();
  };
  const currency = analysis?.currency || "KRW";

  return (
    <div className="bg-white rounded-2xl shadow p-5 mb-6">
      <h2 className="font-semibold mb-3">💰 예산 분석</h2>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">프로젝트 예산</label>
          <input
            type="number"
            min={0}
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            placeholder="예: 10000000"
            className="border rounded-lg px-3 py-2 text-sm w-48"
          />
        </div>
        <button
          onClick={save}
          disabled={busy}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          예산 저장
        </button>
        <a href="/settings" className="text-xs text-slate-500 underline ml-2">
          단가 설정 →
        </a>
      </div>

      {!analysis ? (
        <div className="text-sm text-slate-500">계산 중...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <StatBox
              label="예상 비용"
              value={fmt(analysis.total_cost) + " " + currency}
              tone="neutral"
            />
            <StatBox
              label="예산"
              value={analysis.budget != null ? fmt(analysis.budget) + " " + currency : "미설정"}
              tone="neutral"
            />
            <StatBox
              label="차액 (예산 - 비용)"
              value={
                analysis.diff == null
                  ? "—"
                  : (analysis.diff >= 0 ? "+" : "") + fmt(analysis.diff) + " " + currency
              }
              tone={analysis.diff == null ? "neutral" : analysis.diff >= 0 ? "good" : "bad"}
            />
          </div>

          {/* 진행률 바 */}
          {analysis.budget != null && analysis.budget > 0 && (
            <div className="mb-4">
              <div className="text-xs text-slate-500 mb-1">예산 대비 사용률</div>
              <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                {(() => {
                  const pct = Math.min(
                    Math.round((analysis.total_cost / analysis.budget) * 100),
                    150,
                  );
                  const color =
                    pct > 100 ? "bg-red-500" : pct > 90 ? "bg-amber-500" : "bg-emerald-500";
                  return <div className={`${color} h-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />;
                })()}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {Math.round((analysis.total_cost / analysis.budget) * 100)}%
              </div>
            </div>
          )}

          {/* 분류별 합계 */}
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2 border-b font-medium">분류</th>
                  <th className="text-right px-3 py-2 border-b font-medium">S</th>
                  <th className="text-right px-3 py-2 border-b font-medium">AA</th>
                  <th className="text-right px-3 py-2 border-b font-medium">A</th>
                  <th className="text-right px-3 py-2 border-b font-medium">C</th>
                  <th className="text-right px-3 py-2 border-b font-medium">소계</th>
                </tr>
              </thead>
              <tbody>
                {(["characters", "locations", "props", "fx"] as const).map((t) => {
                  const row = analysis.breakdown[t];
                  const totalForType = analysis.asset_totals[t];
                  return (
                    <tr key={t} className="border-b">
                      <td className="px-3 py-2 font-medium">{labelFor(t)}</td>
                      {(["S", "AA", "A", "C"] as const).map((g) => {
                        const cell = row[g];
                        return (
                          <td key={g} className="px-3 py-2 text-right">
                            {cell.count > 0 ? (
                              <span title={`${cell.count}개 × ${fmt(cell.unit_price)}`}>
                                {cell.count} × {fmt(cell.unit_price)}
                                <br />
                                <span className="text-xs text-slate-500">
                                  = {fmt(cell.subtotal)}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold">
                        {fmt(totalForType)}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-b bg-slate-50">
                  <td className="px-3 py-2 font-medium">샷</td>
                  <td colSpan={4} className="px-3 py-2 text-right">
                    {analysis.breakdown.shots.count} 샷 × {fmt(analysis.breakdown.shots.unit_price)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">
                    {fmt(analysis.breakdown.shots.subtotal)}
                  </td>
                </tr>
                <tr className="font-bold bg-slate-100">
                  <td className="px-3 py-2">합계</td>
                  <td colSpan={4}></td>
                  <td className="px-3 py-2 text-right">{fmt(analysis.total_cost)} {currency}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 제안 */}
          {analysis.suggestions.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              {analysis.suggestions.map((s, i) => {
                const bg =
                  s.type === "reduce"
                    ? "bg-red-50 text-red-900"
                    : s.type === "invest"
                      ? "bg-emerald-50 text-emerald-900"
                      : s.type === "ok"
                        ? "bg-blue-50 text-blue-900"
                        : "bg-slate-50 text-slate-700";
                return (
                  <div key={i} className={`${bg} px-3 py-2 text-sm border-b last:border-b-0`}>
                    {s.message}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad" | "neutral";
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 border-emerald-200"
      : tone === "bad"
        ? "bg-red-50 border-red-200"
        : "bg-slate-50 border-slate-200";
  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="font-semibold text-lg">{value}</div>
    </div>
  );
}

function labelFor(t: string) {
  return {
    characters: "캐릭터",
    locations: "장소/배경",
    props: "소품/에셋",
    fx: "특수효과",
  }[t] || t;
}


function statusLabel(s: string) {
  switch (s) {
    case "pending":
      return "대기 중";
    case "running":
      return "분석 중";
    case "done":
      return "완료";
    case "failed":
      return "실패/중단";
    default:
      return "—";
  }
}

function Section({
  title,
  items,
  keys,
  view,
  scenarioId,
  assetType,
  onChanged,
}: {
  title: string;
  items: any[] | null | undefined;
  keys: string[];
  view: ViewMode;
  scenarioId?: number;
  assetType?: "characters" | "locations" | "props" | "fx";
  onChanged?: () => void;
}) {
  if (!items || items.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow p-5 mb-6">
        <h2 className="font-semibold mb-2">{title}</h2>
        <div className="text-sm text-slate-500">없음</div>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl shadow p-5 mb-6">
      <h2 className="font-semibold mb-3">
        {title} <span className="text-slate-400 font-normal">({items.length})</span>
      </h2>
      {view === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-50">
              <tr>
                {keys.map((k) => (
                  <th key={k} className="text-left px-3 py-2 font-medium border-b border-slate-200">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-slate-100">
                  {keys.map((k) => (
                    <td key={k} className="px-3 py-2 align-top">
                      {k === "grade" && scenarioId && assetType ? (
                        <GradeCell
                          grade={it.grade}
                          locked={!!it.grade_locked}
                          scenarioId={scenarioId}
                          assetType={assetType}
                          assetIndex={i}
                          onChanged={onChanged}
                        />
                      ) : (
                        formatVal(it[k])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((it, i) => (
            <div key={i} className="border border-slate-200 rounded-lg p-3 text-sm">
              {keys.map((k) => {
                const val = it[k];
                if (k === "grade" && scenarioId && assetType) {
                  return (
                    <div key={k} className="mb-1 flex items-center gap-2">
                      <span className="text-slate-500">등급:</span>
                      <GradeCell
                        grade={it.grade}
                        locked={!!it.grade_locked}
                        scenarioId={scenarioId}
                        assetType={assetType}
                        assetIndex={i}
                        onChanged={onChanged}
                      />
                    </div>
                  );
                }
                if (val === undefined || val === null || val === "") return null;
                return (
                  <div key={k} className="mb-1">
                    <span className="text-slate-500">{k}: </span>
                    <span>{formatVal(val)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatVal(v: any): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

const SHOT_KEYS = [
  "code",
  "scene_number",
  "shot_size",
  "camera_movement",
  "camera_angle",
  "lens_mm",
  "time_of_day",
  "lighting",
  "characters",
  "location",
  "props_used",
  "fx_used",
  "action",
  "dialogue",
  "fx",
  "notes",
];

const GRADE_COLORS: Record<string, string> = {
  S: "bg-red-100 text-red-800 border-red-300",
  AA: "bg-orange-100 text-orange-800 border-orange-300",
  A: "bg-blue-100 text-blue-800 border-blue-300",
  C: "bg-slate-100 text-slate-700 border-slate-300",
};

function GradeBadge({ grade }: { grade: string | null | undefined }) {
  if (!grade) return <span className="text-slate-300 text-xs">—</span>;
  const cls = GRADE_COLORS[grade] || "bg-slate-100 text-slate-700 border-slate-300";
  return (
    <span
      className={`inline-block min-w-[32px] text-center text-xs font-bold px-2 py-0.5 rounded border ${cls}`}
    >
      {grade}
    </span>
  );
}

function GradeCell({
  grade,
  locked,
  scenarioId,
  assetType,
  assetIndex,
  onChanged,
}: {
  grade: string | null | undefined;
  locked: boolean;
  scenarioId: number;
  assetType: "characters" | "locations" | "props" | "fx";
  assetIndex: number;
  onChanged?: () => void;
}) {
  const api = useApi();
  const [busy, setBusy] = useState(false);

  const change = async (next: string) => {
    setBusy(true);
    try {
      const value = next === "AUTO" ? null : (next as "S" | "AA" | "A" | "C");
      await api.updateAssetGrade(scenarioId, assetType, assetIndex, value);
      onChanged?.();
    } catch (e: any) {
      alert("등급 변경 실패: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <GradeBadge grade={grade} />
      <select
        value={grade || ""}
        onChange={(e) => change(e.target.value)}
        disabled={busy}
        className="text-xs border border-slate-300 rounded px-1 py-0.5 bg-white"
        title={locked ? "수동 지정됨 (자동 분류로 되돌리려면 'AUTO' 선택)" : "자동 분류 상태"}
      >
        <option value="S">S</option>
        <option value="AA">AA</option>
        <option value="A">A</option>
        <option value="C">C</option>
        <option value="AUTO">— 자동 —</option>
      </select>
      {locked && <span className="text-xs text-amber-600" title="수동 지정">🔒</span>}
    </div>
  );
}

function shotCode(shot: any): string {
  const seq = shot?.sequence_number;
  const num = shot?.shot_number;
  if (seq == null || num == null) return "";
  const pad = (n: number) => String(n).padStart(4, "0");
  return `S${pad(seq)}_C${pad(num)}`;
}

function ShotsSection({
  items,
  view,
  imageUrl,
  storyboardReady,
  scenarioId,
}: {
  items: any[] | null | undefined;
  view: ViewMode;
  imageUrl: (shotIndex: number) => string;
  storyboardReady: boolean;
  scenarioId: number;
}) {
  const [regenIdx, setRegenIdx] = useState<number | null>(null);
  // 샷 이미지 캐시 무효화용 (재생성 후 새 이미지 보여주려고)
  const [bust, setBust] = useState<Record<number, number>>({});

  const onRegenerated = (idx: number) => {
    setBust((b) => ({ ...b, [idx]: Date.now() }));
    setRegenIdx(null);
  };

  const imgSrcFor = (i: number) => {
    const b = bust[i];
    return b ? `${imageUrl(i)}?t=${b}` : imageUrl(i);
  };

  if (!items || items.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow p-5 mb-6">
        <h2 className="font-semibold mb-2">샷 리스트</h2>
        <div className="text-sm text-slate-500">없음</div>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-2xl shadow p-5 mb-6">
      <h2 className="font-semibold mb-3">
        샷 리스트 <span className="text-slate-400 font-normal">({items.length})</span>
      </h2>
      {view === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium border-b border-slate-200">#</th>
                <th className="text-left px-3 py-2 font-medium border-b border-slate-200">스토리보드</th>
                {SHOT_KEYS.map((k) => (
                  <th key={k} className="text-left px-3 py-2 font-medium border-b border-slate-200">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-3 py-2 align-top">{i + 1}</td>
                  <td className="px-3 py-2 align-top">
                    {storyboardReady ? (
                      <div className="flex items-center gap-2">
                        <ShotImage src={imgSrcFor(i)} />
                        <button
                          onClick={() => setRegenIdx(i)}
                          className="text-xs text-purple-600 hover:underline whitespace-nowrap"
                          title="이 샷 재생성"
                        >
                          🔄 재생성
                        </button>
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  {SHOT_KEYS.map((k) => (
                    <td key={k} className="px-3 py-2 align-top">
                      {k === "code" ? (
                        <span className="font-mono text-xs">{shotCode(it)}</span>
                      ) : (
                        formatVal(it[k])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((it, i) => (
            <div key={i} className="border border-slate-200 rounded-lg overflow-hidden text-sm">
              {storyboardReady && (
                <div className="bg-slate-100 aspect-video relative">
                  <ShotImage src={imgSrcFor(i)} className="w-full h-full object-cover" />
                  <button
                    onClick={() => setRegenIdx(i)}
                    className="absolute bottom-2 right-2 bg-white/90 text-slate-700 text-xs px-2 py-1 rounded shadow hover:bg-white"
                  >
                    🔄 재생성
                  </button>
                </div>
              )}
              <div className="p-3">
                <div className="font-semibold mb-1 flex items-center justify-between">
                  <span>샷 #{i + 1}</span>
                  {shotCode(it) && (
                    <span className="font-mono text-xs text-slate-500">{shotCode(it)}</span>
                  )}
                </div>
                {SHOT_KEYS.filter((k) => k !== "code").map((k) => {
                  const val = it[k];
                  if (val === undefined || val === null || val === "") return null;
                  return (
                    <div key={k} className="mb-1">
                      <span className="text-slate-500">{k}: </span>
                      <span>{formatVal(val)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {regenIdx !== null && (
        <RegenerateModal
          scenarioId={scenarioId}
          shotIndex={regenIdx}
          shot={items[regenIdx]}
          onClose={() => setRegenIdx(null)}
          onDone={() => onRegenerated(regenIdx)}
        />
      )}
    </div>
  );
}

// 자주 쓰는 카메라 무브먼트 / 앵글 프리셋. 그룹별로 묶어 UI 에서 섹션 표시.
type CameraPreset = { label: string; value: string; hint?: string };
const CAMERA_PRESET_GROUPS: { title: string; items: CameraPreset[] }[] = [
  {
    title: "앵글 (수직축)",
    items: [
      { label: "EYE LEVEL (아이 레벨)", value: "EYE LEVEL", hint: "자연스럽고 객관적" },
      { label: "HIGH ANGLE (하이 / 부감)", value: "HIGH ANGLE", hint: "왜소·연약·고독" },
      { label: "LOW ANGLE (로우 / 앙각)", value: "LOW ANGLE", hint: "웅장·강력·영웅적" },
      { label: "BIRD'S EYE (조감 / 신의 시점)", value: "BIRD'S EYE VIEW", hint: "수직 90° 상공" },
      { label: "WORM'S EYE (웜즈 / 극앙각)", value: "WORM'S EYE VIEW", hint: "지면 시점, 압도적" },
      { label: "DUTCH (사각)", value: "DUTCH ANGLE", hint: "불안·긴장·역동" },
    ],
  },
  {
    title: "무브먼트",
    items: [
      { label: "FIX (고정)", value: "FIX" },
      { label: "PAN (좌우)", value: "PAN" },
      { label: "TILT (상하)", value: "TILT" },
      { label: "DOLLY IN", value: "DOLLY IN" },
      { label: "DOLLY OUT", value: "DOLLY OUT" },
      { label: "ZOOM IN", value: "ZOOM IN" },
      { label: "ZOOM OUT", value: "ZOOM OUT" },
      { label: "TRACKING", value: "TRACKING" },
    ],
  },
  {
    title: "시점 / 프레이밍",
    items: [
      { label: "POV (1인칭)", value: "POV" },
      { label: "OTS (어깨너머)", value: "OVER THE SHOULDER" },
    ],
  },
];

const SHOT_SIZE_PRESETS: { label: string; value: string }[] = [
  { label: "ECU (익스트림 클로즈업)", value: "ECU" },
  { label: "CU (클로즈업)", value: "CU" },
  { label: "MCU (미디엄 클로즈업)", value: "MCU" },
  { label: "MS (미디엄)", value: "MS" },
  { label: "MLS (미디엄 롱)", value: "MLS" },
  { label: "LS (롱샷)", value: "LS" },
  { label: "ELS (익스트림 롱)", value: "ELS" },
  { label: "WS (와이드)", value: "WS" },
];

// 약어 → 자연어 매핑. 백엔드 image_gen.py 와 일치해야 한다.
// 표준 촬영 용어 + 정서적/시각적 효과를 같이 적어 모델이 의도된 분위기까지 반영.
const CAMERA_DESC_MAP: Record<string, string> = {
  // === 카메라 앵글 ===
  "EYE LEVEL":
    "eye-level angle, camera placed at the subject's eye height, horizontal viewpoint giving a natural, neutral, and objective feel",
  "HIGH ANGLE":
    "high angle shot, camera positioned above the subject looking downward, making the subject appear small, vulnerable, lonely, or weak; diminishing the subject's power",
  "LOW ANGLE":
    "low angle shot, camera positioned below the subject looking upward, making the subject appear grand, powerful, dominant, heroic and imposing",
  "BIRD'S EYE":
    "bird's eye view, an extreme high angle shot from directly overhead (camera pointing straight down at 90 degrees vertical) — the 'god's view' that emphasizes layout, scale, and detachment from the scene",
  "BIRD'S EYE VIEW":
    "bird's eye view, an extreme high angle shot from directly overhead (camera pointing straight down at 90 degrees vertical) — the 'god's view' that emphasizes layout, scale, and detachment from the scene",
  "WORM'S EYE":
    "worm's eye view, an extreme low angle shot from ground level looking nearly straight up, making the subject feel overwhelming, monumental, and towering",
  "WORM'S EYE VIEW":
    "worm's eye view, an extreme low angle shot from ground level looking nearly straight up, making the subject feel overwhelming, monumental, and towering",
  DUTCH:
    "dutch angle (canted/tilted angle), camera intentionally tilted on its roll axis creating a slanted horizon; conveys unease, tension, disorientation, or dynamic energy",
  "DUTCH ANGLE":
    "dutch angle (canted/tilted angle), camera intentionally tilted on its roll axis creating a slanted horizon; conveys unease, tension, disorientation, or dynamic energy",

  // === 카메라 무브먼트 ===
  FIX: "static camera, no movement, locked-off frame",
  STATIC: "static camera, no movement, locked-off frame",
  PAN: "horizontal panning camera movement across the scene",
  "PAN LEFT": "camera panning horizontally to the left",
  "PAN RIGHT": "camera panning horizontally to the right",
  TILT: "vertical tilting camera movement",
  "TILT UP": "camera tilting upward",
  "TILT DOWN": "camera tilting downward",
  "DOLLY IN": "camera dollying in toward the subject, moving physically closer",
  "DOLLY OUT": "camera dollying away from the subject, physically pulling back",
  "ZOOM IN": "zooming in on the subject, frame tightens via lens",
  "ZOOM OUT": "zooming out from the subject, frame widens via lens",
  TRACKING: "tracking shot, camera following the subject in motion",

  // === 시점 / 프레이밍 ===
  POV: "first-person POV shot from the character's own perspective, as if seen through their eyes",
  OTS: "over-the-shoulder shot, framed from behind one character looking toward another, with the back of the foreground character's head/shoulder visible",
  "OVER THE SHOULDER":
    "over-the-shoulder shot, framed from behind one character looking toward another, with the back of the foreground character's head/shoulder visible",
};

const SHOT_SIZE_DESC_MAP: Record<string, string> = {
  ECU: "extreme close-up, framing only a small detail such as eyes or a mouth",
  CU: "close-up shot, the face fills most of the frame",
  MCU: "medium close-up, framing from the chest up to the head",
  MS: "medium shot, framing from the waist up to the head",
  MLS: "medium long shot, framing from the knees up to the head",
  LS: "long shot, the full body of the subject is visible within the surroundings",
  ELS: "extreme long shot, the subject appears small within a vast environment",
  WS: "wide shot, an expansive view of the whole scene",
};

function describeCamera(v: string | null | undefined): string {
  if (!v) return CAMERA_DESC_MAP.FIX;
  const k = v.trim().toUpperCase();
  return CAMERA_DESC_MAP[k] ?? v.trim();
}

function describeShotSize(v: string | null | undefined): string {
  if (!v) return SHOT_SIZE_DESC_MAP.MS;
  const k = v.trim().toUpperCase();
  return SHOT_SIZE_DESC_MAP[k] ?? v.trim();
}

function buildPromptFromShot(shot: any): string {
  const extras: string[] = [];
  if (shot?.fx) extras.push(`Special effects: ${shot.fx}`);
  if (shot?.notes) extras.push(`Notes: ${shot.notes}`);
  let charsStr = "no characters";
  const chars = shot?.characters;
  if (Array.isArray(chars) && chars.length > 0) {
    charsStr = chars.join(", ");
  } else if (typeof chars === "string" && chars.trim()) {
    charsStr = chars;
  }
  return (
    `Create a storyboard sketch for an animation scene with the following camera direction.\n\n` +
    `CAMERA: ${describeCamera(shot?.camera_movement)}\n` +
    `SHOT TYPE: ${describeShotSize(shot?.shot_size)}\n\n` +
    `Characters: ${charsStr}\n` +
    `Location: ${shot?.location || "unspecified"}\n` +
    `Action: ${shot?.action || "scene continues"}\n` +
    (extras.length ? extras.join("\n") + "\n" : "") +
    `\nStyle: clean storyboard sketch, black and white pencil drawing, clear composition,\n` +
    `single panel, professional pre-production storyboard. No text or labels.`
  );
}

function RegenerateModal({
  scenarioId,
  shotIndex,
  shot,
  onClose,
  onDone,
}: {
  scenarioId: number;
  shotIndex: number;
  shot: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useApi();
  const { data: characters } = api.characters({ refreshInterval: 0 });
  const [prompt, setPrompt] = useState<string>("");
  const [shotSize, setShotSize] = useState<string>(shot?.shot_size || "MS");
  const [camera, setCamera] = useState<string>(shot?.camera_movement || "FIX");
  const [action, setAction] = useState<string>(shot?.action || "");
  const [extraDirection, setExtraDirection] = useState<string>("");
  const [useReferences, setUseReferences] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 사용자가 텍스트박스를 직접 수정했으면 자동 갱신 멈춤
  const [promptManuallyEdited, setPromptManuallyEdited] = useState(false);

  // 모달 처음 열릴 때 백엔드 기본 프롬프트 1회만 가져옴
  useEffect(() => {
    let aborted = false;
    setLoading(true);
    api
      .getShotPrompt(scenarioId, shotIndex)
      .then((r) => {
        if (!aborted) {
          setPrompt(r.prompt);
          setPromptManuallyEdited(false);
        }
      })
      .catch((e) => {
        if (!aborted) setErr(String(e?.message || e));
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId, shotIndex]);

  const rebuildPrompt = () => {
    const merged = {
      ...shot,
      shot_size: shotSize,
      camera_movement: camera,
      action: action,
    };
    let p = buildPromptFromShot(merged);
    if (extraDirection.trim()) {
      // 추가 디렉션을 Style 줄 직전에 삽입
      p = p.replace(
        /\nStyle: /,
        `\nAdditional direction: ${extraDirection.trim()}\n\nStyle: `,
      );
    }
    setPrompt(p);
    setPromptManuallyEdited(false);
  };

  // 구조화 필드가 바뀌면 자동으로 프롬프트 갱신 (사용자가 직접 편집했으면 멈춤)
  useEffect(() => {
    if (loading) return;
    if (promptManuallyEdited) return;
    rebuildPrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotSize, camera, action, extraDirection, loading]);

  // 이 샷에 등장하는 캐릭터들의 라이브러리 매칭 상태 계산
  const shotChars: string[] = Array.isArray(shot?.characters)
    ? shot.characters
    : shot?.characters
      ? [String(shot.characters)]
      : [];
  const charMatches = shotChars.map((name) => {
    const found = (characters || []).find(
      (c) => c.name.toLowerCase() === String(name).trim().toLowerCase(),
    );
    return {
      name: String(name),
      registered: !!found,
      hasDescription: !!(found && found.description && found.description.trim()),
    };
  });

  const handleRegen = async (useCustom: boolean) => {
    setErr(null);
    setBusy(true);
    try {
      await api.regenerateShot(
        scenarioId,
        shotIndex,
        useCustom ? prompt : undefined,
        useReferences,
      );
      onDone();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold text-lg mb-1">샷 #{shotIndex + 1} 재생성</h3>
        <div className="text-sm text-slate-500 mb-3">
          카메라 앵글이나 샷 사이즈를 바꿔서 같은 장면을 다른 시점으로 그려보세요.
          구조화된 입력을 바꾸면 아래 프롬프트가 자동으로 갱신됩니다.
        </div>

        {/* 캐릭터 라이브러리 매칭 상태 */}
        {shotChars.length > 0 && (
          <div className="mb-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <div className="font-semibold text-slate-700 mb-1.5">
              이 샷의 캐릭터 라이브러리 매칭
            </div>
            <div className="space-y-1">
              {charMatches.map((m) => (
                <div key={m.name} className="flex items-center gap-2">
                  {m.registered && m.hasDescription ? (
                    <span className="text-green-700">✓</span>
                  ) : m.registered ? (
                    <span className="text-amber-600">!</span>
                  ) : (
                    <span className="text-red-500">✗</span>
                  )}
                  <span className="font-medium text-slate-700">{m.name}</span>
                  <span className="text-slate-500">—</span>
                  {m.registered && m.hasDescription ? (
                    <span className="text-green-700">
                      라이브러리 등록됨 + 외형 설명 있음 (외형 자동 유지)
                    </span>
                  ) : m.registered ? (
                    <span className="text-amber-700">
                      등록은 됐지만 외형 설명이 비어있음 — 카메라 바꾸면 외형이 매번 다를 수 있음.{" "}
                      <a href="/characters" className="underline">
                        라이브러리 가서 설명 채우기
                      </a>
                    </span>
                  ) : (
                    <span className="text-red-600">
                      라이브러리에 미등록 — 외형 일관성 보장 안 됨.{" "}
                      <a href="/characters" className="underline">
                        등록하기
                      </a>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-sm text-slate-500">프롬프트 불러오는 중...</div>
        ) : (
          <>
            {/* 구조화된 빠른 편집 */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-3">
              <div className="text-xs font-semibold text-slate-600 mb-2">
                빠른 편집 — 값 바꾼 뒤 아래 [📝 이 값으로 프롬프트 새로 만들기] 클릭
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    샷 사이즈
                  </label>
                  <select
                    value={shotSize}
                    onChange={(e) => setShotSize(e.target.value)}
                    className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                  >
                    {SHOT_SIZE_PRESETS.find((p) => p.value === shotSize) ? null : (
                      <option value={shotSize}>{shotSize} (현재)</option>
                    )}
                    {SHOT_SIZE_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    카메라 무브먼트 / 앵글
                  </label>
                  <input
                    type="text"
                    value={camera}
                    onChange={(e) => setCamera(e.target.value)}
                    placeholder="예: LOW ANGLE, ZOOM IN"
                    className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs text-slate-500 mb-2">
                  빠른 카메라 프리셋 — 클릭해서 위 입력란에 적용
                </label>
                <div className="space-y-2">
                  {CAMERA_PRESET_GROUPS.map((g) => (
                    <div key={g.title}>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                        {g.title}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {g.items.map((p) => (
                          <button
                            key={p.value}
                            onClick={() => setCamera(p.value)}
                            title={p.hint}
                            className={
                              "text-xs px-2 py-1 rounded border transition-colors " +
                              (camera === p.value
                                ? "bg-purple-600 text-white border-purple-600"
                                : "bg-white text-slate-700 border-slate-300 hover:bg-purple-50 hover:border-purple-300")
                            }
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs text-slate-500 mb-1">
                  액션 (선택)
                </label>
                <input
                  type="text"
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  placeholder="이 샷에서 일어나는 행동"
                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                />
              </div>

              <div className="mb-3">
                <label className="block text-xs text-slate-500 mb-1">
                  추가 디렉션 (선택) — 조명/감정/스타일 등 자유롭게
                </label>
                <input
                  type="text"
                  value={extraDirection}
                  onChange={(e) => setExtraDirection(e.target.value)}
                  placeholder="예: dramatic backlight, tense mood, rain falling"
                  className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
                />
              </div>

              <div className="text-xs text-slate-500 italic">
                위 값을 바꾸면 아래 프롬프트가 자동으로 갱신됩니다.
                {promptManuallyEdited && (
                  <span className="text-amber-700 ml-2">
                    (지금은 수동 편집 상태 — 자동 갱신 멈춤)
                  </span>
                )}
              </div>
              {promptManuallyEdited && (
                <button
                  onClick={rebuildPrompt}
                  className="text-xs bg-slate-900 text-white px-3 py-1 rounded hover:bg-slate-700 mt-2"
                >
                  📝 자동 갱신 다시 켜기 (위 값으로 프롬프트 재작성)
                </button>
              )}
            </div>

            {/* 최종 프롬프트 (직접 수정도 가능) */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                최종 프롬프트 (직접 수정 가능)
              </label>
              <textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  setPromptManuallyEdited(true);
                }}
                rows={10}
                className="w-full border border-slate-300 rounded-lg p-3 text-sm font-mono"
              />
            </div>

            {/* 캐릭터 참조 토글 — 카메라 앵글 바꿀 때 끄는 게 효과 좋음 */}
            <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useReferences}
                  onChange={(e) => setUseReferences(e.target.checked)}
                  className="mt-1"
                />
                <div className="text-sm">
                  <div className="font-semibold text-amber-900">
                    캐릭터 라이브러리 참조 이미지 사용
                  </div>
                  <div className="text-amber-800 text-xs mt-1">
                    켜기: 외형 일관성 유지 (다만 참조 이미지의 구도가 영향을 미쳐 카메라 변경 효과 약해질 수 있음).
                    <br />
                    <b>카메라 앵글을 확실히 바꾸고 싶으면 끄세요</b> (외형은 프롬프트 텍스트로만 유지).
                  </div>
                </div>
              </label>
            </div>

            {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
            <div className="flex gap-2 mt-4 justify-end flex-wrap">
              <button
                onClick={onClose}
                disabled={busy}
                className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200"
              >
                취소
              </button>
              <button
                onClick={() => handleRegen(false)}
                disabled={busy}
                className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-300"
                title="원래 프롬프트로 재생성 (위 수정사항 무시)"
              >
                기본으로 재생성
              </button>
              <button
                onClick={() => handleRegen(true)}
                disabled={busy}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-slate-300"
              >
                {busy ? "생성 중..." : "이 프롬프트로 재생성"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ShotImage({ src, className }: { src: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="storyboard" className={className ?? "h-20 w-auto rounded border border-slate-200"} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />;
}
