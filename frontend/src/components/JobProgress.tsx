"use client";

import type { Job } from "@/lib/api";

export function JobProgress({ job }: { job: Job | null }) {
  if (!job) return null;

  const pct =
    job.progress_total > 0
      ? Math.round((job.progress_done / job.progress_total) * 100)
      : 0;

  const statusColor: Record<Job["status"], string> = {
    pending: "bg-slate-300",
    running: "bg-blue-500",
    done: "bg-emerald-500",
    failed: "bg-red-500",
  };

  return (
    <section className="bg-white rounded-2xl shadow p-6 mb-6">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="font-semibold">{job.video_filename}</span>
          <span className="text-sm text-slate-500 ml-2">{labelOf(job.status)}</span>
        </div>
        <div className="text-sm text-slate-500">
          {job.progress_done} / {job.progress_total} ({pct}%)
        </div>
      </div>
      <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${statusColor[job.status]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {job.progress_message && (
        <div className="text-xs text-slate-500 mt-2">{job.progress_message}</div>
      )}
      {job.error && (
        <div className="text-sm text-red-600 mt-2">에러: {job.error}</div>
      )}
    </section>
  );
}

function labelOf(s: Job["status"]) {
  return { pending: "대기 중", running: "분석 중", done: "완료", failed: "실패" }[s];
}
