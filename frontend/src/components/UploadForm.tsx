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

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-slate-600 hover:text-slate-900 font-medium">
          📖 컷 감지 민감도 가이드 (클릭해서 펼치기)
        </summary>
        <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
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
            기본값 27부터 시작해 결과 보고 조절하세요.
          </p>
        </div>
      </details>
    </section>
  );
}
