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
          <div className="flex gap-2">
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
            <Section
              title="샷 리스트"
              items={sc.shots}
              keys={[
                "scene_number",
                "shot_size",
                "camera_movement",
                "characters",
                "location",
                "action",
                "dialogue",
                "fx",
                "notes",
              ]}
              view={view}
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
