"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Header } from "@/components/Header";
import { useApi } from "@/lib/api";

export default function HomePage() {
  const { status } = useSession();
  const router = useRouter();
  const api = useApi();
  const { data: me } = api.me();
  const { data: projects, mutate } = api.projects({ refreshInterval: 5000 });

  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") return null;

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    try {
      await api.createProject(title.trim());
      setTitle("");
      await mutate();
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-6 py-8">
        {me && !me.has_gemini_key && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
            Gemini API 키가 등록되지 않았습니다.{" "}
            <Link href="/settings" className="font-semibold text-amber-700 underline">
              설정
            </Link>
            에서 키를 입력해야 분석이 동작합니다. (
            <a
              href="https://aistudio.google.com"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              무료 키 발급
            </a>
            )
          </div>
        )}

        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <h2 className="font-semibold mb-3">새 프로젝트 만들기</h2>
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="작품/에피소드 제목 (예: 시즌2 EP01)"
              className="flex-1 border rounded-lg px-3 py-2"
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
            <button
              onClick={create}
              disabled={creating || !title.trim()}
              className="bg-slate-900 text-white px-5 py-2 rounded-lg disabled:opacity-50"
            >
              만들기
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-6 mb-8">
          <h2 className="font-semibold mb-3">📖 컷 감지 민감도 가이드</h2>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">영상 종류</th>
                  <th className="text-left px-4 py-2 font-medium">추천 값</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-2">디졸브 많음 (광고, MV)</td>
                  <td className="px-4 py-2 font-mono">22~25</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">일반 애니메이션</td>
                  <td className="px-4 py-2 font-mono">27~30</td>
                </tr>
                <tr className="bg-amber-50">
                  <td className="px-4 py-2">컷이 자주 잡힘 → 줄이기</td>
                  <td className="px-4 py-2 font-mono">30~35 ⭐</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">액션, 흔들림 많음</td>
                  <td className="px-4 py-2 font-mono">32~38</td>
                </tr>
              </tbody>
            </table>
            <p className="text-xs text-slate-500 px-4 py-2 bg-slate-50">
              값이 <strong>낮을수록 민감</strong>(컷 많이 잡힘), <strong>높을수록 둔감</strong>(컷 적게 잡힘).
              기본값 27부터 시작해 결과 보고 조절하세요. 영상 업로드 후 같은 영상으로 재분석도 가능합니다.
            </p>
          </div>
        </div>

        <h2 className="font-semibold mb-3">프로젝트</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects?.map((p) => (
            <div
              key={p.id}
              className="relative bg-white rounded-2xl shadow p-5 hover:shadow-md transition"
            >
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!confirm(`'${p.title}' 프로젝트를 삭제할까요? (업로드된 영상과 분석 결과가 모두 사라집니다)`)) return;
                  await api.deleteProject(p.id);
                  await mutate();
                }}
                className="absolute top-3 right-3 text-slate-400 hover:text-red-600 text-sm"
                title="프로젝트 삭제"
              >
                ✕
              </button>
              <Link href={`/projects/${p.id}`} className="block">
                <div className="font-semibold pr-6">{p.title}</div>
                <div className="text-xs text-slate-500 mt-1">{p.owner_email}</div>
                <div className="mt-3 flex justify-between text-sm text-slate-600">
                  <span>{p.shot_count}컷</span>
                  <span>{statusLabel(p.latest_job_status)}</span>
                </div>
              </Link>
            </div>
          ))}
          {projects && projects.length === 0 && (
            <div className="text-slate-500 text-sm">아직 프로젝트가 없습니다.</div>
          )}
        </div>
      </main>
    </div>
  );
}

function statusLabel(s: string | null) {
  switch (s) {
    case "pending":
      return "대기 중";
    case "running":
      return "분석 중";
    case "done":
      return "완료";
    case "failed":
      return "실패";
    default:
      return "—";
  }
}
