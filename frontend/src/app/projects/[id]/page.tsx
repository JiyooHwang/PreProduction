"use client";

import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";

import { Header } from "@/components/Header";
import { UploadForm } from "@/components/UploadForm";
import { JobProgress } from "@/components/JobProgress";
import { ShotTable } from "@/components/ShotTable";
import { useApi } from "@/lib/api";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { status } = useSession();
  const router = useRouter();
  const api = useApi();

  const { data: project } = api.project(id);
  const { data: job, mutate: refreshJob } = api.latestJob(id, { refreshInterval: 2000 });
  const { data: shots, mutate: refreshShots } = api.shots(id);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  useEffect(() => {
    if (job?.status === "done") refreshShots();
  }, [job?.status, refreshShots]);

  if (status !== "authenticated") return null;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/" className="text-sm text-slate-500 hover:underline">
              ← 프로젝트 목록
            </Link>
            <h1 className="text-2xl font-bold mt-1">{project?.title ?? "..."}</h1>
            <div className="text-sm text-slate-500">{project?.owner_email}</div>
          </div>
          <div className="flex gap-2">
            {shots && shots.length > 0 && (
              <a
                href={api.exportUrl(id)}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700"
              >
                Excel 다운로드
              </a>
            )}
            <button
              onClick={async () => {
                if (!confirm(`'${project?.title ?? "이 프로젝트"}'를 삭제할까요? (업로드된 영상과 분석 결과가 모두 사라집니다)`)) return;
                await api.deleteProject(id);
                router.replace("/");
              }}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            >
              프로젝트 삭제
            </button>
          </div>
        </div>

        <UploadForm
          projectId={id}
          onSubmitted={() => refreshJob()}
          hasExistingVideo={!!job}
        />

        <JobProgress job={job ?? null} />

        <ShotTable
          projectId={id}
          shots={shots ?? []}
          onChanged={refreshShots}
        />
      </main>
    </div>
  );
}
