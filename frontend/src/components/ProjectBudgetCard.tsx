"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/api";
import { useApi } from "@/lib/api";


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


export function ProjectBudgetCard({
  projectId,
  project,
  shotsCount,
}: {
  projectId: number;
  project: Project;
  shotsCount: number;
}) {
  const api = useApi();
  const { data: analysis, mutate: refresh } = api.projectBudgetAnalysis(projectId, {
    refreshInterval: 0,
  });
  const [budgetInput, setBudgetInput] = useState<string>(
    project.budget != null ? String(project.budget) : "",
  );
  const [busy, setBusy] = useState(false);
  const [showAssets, setShowAssets] = useState(false);

  useEffect(() => {
    setBudgetInput(project.budget != null ? String(project.budget) : "");
  }, [project.budget]);

  const save = async () => {
    setBusy(true);
    try {
      const v = budgetInput.trim() === "" ? null : Number(budgetInput);
      if (v !== null && (Number.isNaN(v) || v < 0)) {
        alert("예산은 0 이상의 숫자여야 합니다.");
        return;
      }
      await api.setProjectBudget(projectId, v);
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
      <h2 className="font-semibold mb-3">💰 예산 분석 ({shotsCount} 샷)</h2>

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
                  return (
                    <div
                      className={`${color} h-full transition-all`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  );
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
                  <td className="px-3 py-2 text-right">
                    {fmt(analysis.total_cost)} {currency}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 제안 */}
          {analysis.suggestions.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden mb-3">
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
                  <div
                    key={i}
                    className={`${bg} px-3 py-2 text-sm border-b last:border-b-0`}
                  >
                    {s.message}
                  </div>
                );
              })}
            </div>
          )}

          {/* 집계된 에셋 펼치기 */}
          <button
            onClick={() => setShowAssets((v) => !v)}
            className="text-xs text-slate-600 hover:underline"
          >
            {showAssets ? "▲ 집계된 에셋 목록 접기" : "▼ 집계된 에셋 목록 보기 (등급별)"}
          </button>

          {showAssets && (
            <div className="mt-3 grid grid-cols-1 gap-3">
              <MergeableAssetList
                title="캐릭터"
                items={analysis.assets.characters}
                projectId={projectId}
                assetType="characters"
                onMerged={() => refresh()}
              />
              <MergeableAssetList
                title="소품"
                items={analysis.assets.props}
                projectId={projectId}
                assetType="props"
                onMerged={() => refresh()}
              />
              <MergeableAssetList
                title="FX"
                items={analysis.assets.fx}
                projectId={projectId}
                assetType="fx"
                onMerged={() => refresh()}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}


function MergeableAssetList({
  title,
  items,
  projectId,
  assetType,
  onMerged,
}: {
  title: string;
  items: { name: string; appearance_count: number; shot_codes: string[]; grade?: string }[];
  projectId: number;
  assetType: "characters" | "props" | "fx";
  onMerged: () => void;
}) {
  const api = useApi();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetName, setTargetName] = useState<string>("");
  const [merging, setMerging] = useState(false);

  if (!items || items.length === 0) {
    return (
      <div className="border border-slate-200 rounded-lg p-3 text-sm">
        <div className="font-semibold mb-2">{title}</div>
        <div className="text-xs text-slate-500">없음</div>
      </div>
    );
  }

  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
    if (next.size > 0 && !targetName) {
      // 처음 선택한 이름을 기본 target 으로
      setTargetName(Array.from(next)[0]);
    }
  };

  const doMerge = async () => {
    if (selected.size < 2) {
      alert("2개 이상 선택해야 병합 가능합니다.");
      return;
    }
    const target = targetName.trim();
    if (!target) {
      alert("통합할 이름을 입력해주세요.");
      return;
    }
    if (!confirm(`${selected.size}개를 '${target}' 으로 통합할까요?`)) return;

    setMerging(true);
    try {
      const sources = Array.from(selected);
      await api.mergeProjectAssets(projectId, assetType, sources, target);
      setSelected(new Set());
      setTargetName("");
      onMerged();
    } catch (e: any) {
      alert("병합 실패: " + (e?.message || e));
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">
          {title} <span className="text-xs text-slate-400">({items.length}명/개)</span>
        </div>
        {selected.size >= 2 && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="통합 이름"
              className="border border-slate-300 rounded px-2 py-0.5 text-xs w-32"
            />
            <button
              onClick={doMerge}
              disabled={merging}
              className="bg-purple-600 text-white text-xs px-3 py-1 rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {merging ? "병합 중..." : `🔗 ${selected.size}개 병합`}
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-slate-500 hover:underline"
            >
              선택 해제
            </button>
          </div>
        )}
      </div>
      {selected.size === 0 && (
        <div className="text-xs text-slate-500 mb-2">
          같은 인물/소품/효과를 체크박스로 골라 한 이름으로 통합할 수 있어요.
        </div>
      )}
      <ul className="space-y-1 max-h-96 overflow-y-auto">
        {items.map((it, i) => {
          const isSelected = selected.has(it.name);
          return (
            <li
              key={i}
              className={`flex items-center gap-2 text-xs px-2 py-1 rounded ${
                isSelected ? "bg-purple-50" : "hover:bg-slate-50"
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggle(it.name)}
              />
              <GradeBadge grade={it.grade} />
              <span className="font-medium">{it.name}</span>
              <span className="text-slate-500 ml-auto whitespace-nowrap">
                {it.appearance_count}샷
              </span>
            </li>
          );
        })}
      </ul>
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
  return (
    {
      characters: "캐릭터",
      locations: "장소/배경",
      props: "소품/에셋",
      fx: "특수효과",
    }[t] || t
  );
}
