"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Header } from "@/components/Header";
import { useApi } from "@/lib/api";

export default function ScenariosPage() {
  const { status } = useSession();
  const router = useRouter();
  const api = useApi();
  const { data: list, mutate } = api.scenarios({ refreshInterval: 5000 });

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") return null;

  const submit = async () => {
    if (!title.trim()) {
      setError("제목을 입력하세요.");
      return;
    }
    if (!text.trim() && !file) {
      setError("시나리오 텍스트를 붙여넣거나 파일을 업로드하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sc = await api.createScenario(title.trim(), text, file ?? undefined);
      setTitle("");
      setText("");
      setFile(null);
      await mutate();
      router.push(`/scenarios/${sc.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-bold mb-4">시나리오 분석</h1>

        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <h2 className="font-semibold mb-3">새 시나리오 분석</h2>

          <label className="block text-sm text-slate-600 mb-1">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 시즌2 EP01 시나리오"
            className="w-full border rounded-lg px-3 py-2 mb-3"
          />

          <label className="block text-sm text-slate-600 mb-1">시나리오 텍스트 (붙여넣기)</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="여기에 시나리오/대본 내용을 그대로 붙여넣으세요."
            className="w-full border rounded-lg px-3 py-2 mb-3 font-mono text-sm"
            rows={10}
          />

          <label className="block text-sm text-slate-600 mb-1">또는 텍스트 파일(.txt) 업로드</label>
          <input
            type="file"
            accept=".txt,text/plain"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block text-sm mb-3"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={submit}
              disabled={busy}
              className="bg-slate-900 text-white px-5 py-2 rounded-lg disabled:opacity-50"
            >
              {busy ? "분석 시작 중..." : "분석 시작"}
            </button>
            {error && <span className="text-red-600 text-sm">{error}</span>}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            텍스트 붙여넣기와 파일 업로드 중 하나만 사용해도 됩니다 (둘 다 있으면 파일 우선).
          </p>
        </div>

        <h2 className="font-semibold mb-3">시나리오 목록</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list?.map((s) => (
            <div
              key={s.id}
              className="relative bg-white rounded-2xl shadow p-5 hover:shadow-md transition"
            >
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!confirm(`'${s.title}' 시나리오를 삭제할까요?`)) return;
                  await api.deleteScenario(s.id);
                  await mutate();
                }}
                className="absolute top-3 right-3 text-slate-400 hover:text-red-600 text-sm"
                title="삭제"
              >
                ✕
              </button>
              <Link href={`/scenarios/${s.id}`} className="block">
                <div className="font-semibold pr-6">{s.title}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {new Date(s.created_at).toLocaleString()}
                </div>
                <div className="mt-3 text-sm text-slate-600">{statusLabel(s.status)}</div>
              </Link>
            </div>
          ))}
          {list && list.length === 0 && (
            <div className="text-slate-500 text-sm">아직 분석한 시나리오가 없습니다.</div>
          )}
        </div>
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
