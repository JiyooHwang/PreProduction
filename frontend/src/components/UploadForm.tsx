"use client";

import { useState } from "react";
import { useApi } from "@/lib/api";

export function UploadForm({
  projectId,
  onSubmitted,
}: {
  projectId: number;
  onSubmitted: () => void;
}) {
  const api = useApi();
  const [file, setFile] = useState<File | null>(null);
  const [threshold, setThreshold] = useState(27);
  const [skipAnalysis, setSkipAnalysis] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadVideo(projectId, file, threshold, skipAnalysis);
      setFile(null);
      onSubmitted();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl shadow p-6 mb-6">
      <h2 className="font-semibold mb-3">영상 업로드</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div className="md:col-span-2">
          <label className="block text-sm text-slate-600 mb-1">영상 파일</label>
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">컷 감지 민감도</label>
          <input
            type="number"
            value={threshold}
            min={5}
            max={60}
            step={1}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 mt-3 text-sm">
        <input
          type="checkbox"
          checked={skipAnalysis}
          onChange={(e) => setSkipAnalysis(e.target.checked)}
        />
        AI 분석 생략 (컷 감지 + 썸네일만)
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!file || busy}
          className="bg-slate-900 text-white px-5 py-2 rounded-lg disabled:opacity-50"
        >
          {busy ? "업로드 중..." : "업로드 + 분석 시작"}
        </button>
        {error && <span className="text-red-600 text-sm">{error}</span>}
      </div>
      <p className="text-xs text-slate-500 mt-2">
        디졸브가 많으면 민감도를 22~25 정도로 낮춰 시도해 보세요. 액션이 격렬하면 30~32로 높임.
      </p>
    </section>
  );
}
