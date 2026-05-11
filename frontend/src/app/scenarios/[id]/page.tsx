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

        {sc?.status === "done" && <StoryboardUsageHint />}

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
            <b>🔄 샷 재생성:</b> 마음에 안 드는 샷만 골라 다시 그릴 수 있어요. 버튼을 누르면
            현재 프롬프트가 표시되며, 그대로 다시 그리거나 수정 후 재생성 가능.
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
            팁: 캐릭터 디자인이 잘 안 반영되면 재생성 시 프롬프트에 &quot;in the style of
            the reference character design&quot; 등 한 줄을 추가해보세요.
          </div>
        </div>
      )}
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

      {regenIdx !== null && (
        <RegenerateModal
          scenarioId={scenarioId}
          shotIndex={regenIdx}
          onClose={() => setRegenIdx(null)}
          onDone={() => onRegenerated(regenIdx)}
        />
      )}
    </div>
  );
}

function RegenerateModal({
  scenarioId,
  shotIndex,
  onClose,
  onDone,
}: {
  scenarioId: number;
  shotIndex: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const api = useApi();
  const [prompt, setPrompt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    api
      .getShotPrompt(scenarioId, shotIndex)
      .then((r) => {
        if (!aborted) setPrompt(r.prompt);
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

  const handleRegen = async (useCustom: boolean) => {
    setErr(null);
    setBusy(true);
    try {
      await api.regenerateShot(scenarioId, shotIndex, useCustom ? prompt : undefined);
      onDone();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6">
        <h3 className="font-semibold text-lg mb-1">샷 #{shotIndex + 1} 재생성</h3>
        <div className="text-sm text-slate-500 mb-4">
          프롬프트를 수정하거나, 그대로 두고 기본 재생성하세요. 캐릭터 라이브러리에
          등록된 캐릭터는 자동으로 참조 이미지로 사용됩니다.
        </div>
        {loading ? (
          <div className="text-sm text-slate-500">프롬프트 불러오는 중...</div>
        ) : (
          <>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={10}
              className="w-full border border-slate-300 rounded-lg p-3 text-sm font-mono"
            />
            {err && <div className="text-sm text-red-600 mt-2">{err}</div>}
            <div className="flex gap-2 mt-4 justify-end">
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
                title="원래 프롬프트로 재생성 (입력란 수정사항 무시)"
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
