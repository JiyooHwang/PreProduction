"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Header } from "@/components/Header";
import { useApi } from "@/lib/api";

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

            <Section title="캐릭터" items={sc.characters} keys={["name", "description", "notes"]} view={view} />
            <Section title="장소" items={sc.locations} keys={["name", "time_of_day", "description"]} view={view} />
            <Section title="소품/에셋" items={sc.props} keys={["name", "description"]} view={view} />
            <Section title="특수효과 (FX)" items={sc.fx} keys={["name", "description"]} view={view} />
            <ShotsSection
              items={sc.shots}
              view={view}
              imageUrl={(idx) => api.storyboardImageUrl(id, idx)}
              storyboardReady={sc.storyboard_status === "done" || (sc.storyboard_progress_done ?? 0) > 0}
            />
            <Section title="대사" items={sc.dialogues} keys={["scene_number", "character", "line"]} view={view} />
          </>
        )}
      </main>
    </div>
  );
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
}: {
  title: string;
  items: any[] | null | undefined;
  keys: string[];
  view: ViewMode;
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
                      {formatVal(it[k])}
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
  "scene_number",
  "shot_size",
  "camera_movement",
  "characters",
  "location",
  "action",
  "dialogue",
  "fx",
  "notes",
];

function ShotsSection({
  items,
  view,
  imageUrl,
  storyboardReady,
}: {
  items: any[] | null | undefined;
  view: ViewMode;
  imageUrl: (shotIndex: number) => string;
  storyboardReady: boolean;
}) {
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
                      <ShotImage src={imageUrl(i)} />
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                  {SHOT_KEYS.map((k) => (
                    <td key={k} className="px-3 py-2 align-top">
                      {formatVal(it[k])}
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
                <div className="bg-slate-100 aspect-video">
                  <ShotImage src={imageUrl(i)} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="p-3">
                <div className="font-semibold mb-1">샷 #{i + 1}</div>
                {SHOT_KEYS.map((k) => {
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
    </div>
  );
}

function ShotImage({ src, className }: { src: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="storyboard" className={className ?? "h-20 w-auto rounded border border-slate-200"} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />;
}
