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

        <div className="bg-white rounded-2xl shadow p-6 mb-8">
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

        <h2 className="font-semibold mb-3">프로젝트</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects?.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="bg-white rounded-2xl shadow p-5 hover:shadow-md transition"
            >
              <div className="font-semibold">{p.title}</div>
              <div className="text-xs text-slate-500 mt-1">{p.owner_email}</div>
              <div className="mt-3 flex justify-between text-sm text-slate-600">
                <span>{p.shot_count}컷</span>
                <span>{statusLabel(p.latest_job_status)}</span>
              </div>
            </Link>
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
