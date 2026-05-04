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
      </main>
    </div>
  );
}
