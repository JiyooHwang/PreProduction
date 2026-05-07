"use client";

import { useSession } from "next-auth/react";
import useSWR, { SWRConfiguration } from "swr";

// 백엔드는 Next.js 서버 rewrite를 통해 같은 도메인 /api/backend/* 로 프록시됨.
// 결과적으로 브라우저는 항상 프런트 도메인만 호출 → 클라우드플레어 터널 등으로
// 프런트만 노출해도 백엔드까지 동작.
const API_URL = "/api/backend";

export type Project = {
  id: number;
  title: string;
  description: string | null;
  created_at: string;
  owner_email: string | null;
  shot_count: number;
  latest_job_status: string | null;
};

export type Job = {
  id: number;
  project_id: number;
  video_filename: string;
  status: "pending" | "running" | "done" | "failed";
  progress_done: number;
  progress_total: number;
  progress_message: string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export type Shot = {
  id: number;
  project_id: number;
  index: number;
  start_tc: string;
  end_tc: string;
  duration_seconds: number;
  duration_frames: number;
  thumbnail_path: string | null;
  shot_size: string | null;
  camera_movement: string | null;
  characters: string[] | null;
  background: string | null;
  action: string | null;
  dialogue: string | null;
  fx: string | null;
  notes: string | null;
};

export type Me = {
  id: number;
  email: string;
  name: string;
  picture: string | null;
  has_gemini_key: boolean;
};

function useToken(): string | null {
  const { data } = useSession();
  return ((data as any)?.idToken as string) ?? null;
}

async function request(token: string | null, path: string, init?: RequestInit) {
  if (!token) throw new Error("로그인이 필요합니다.");
  const res = await fetch(API_URL + path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res;
}

export function useApi() {
  const token = useToken();

  const get = async (path: string) => (await request(token, path)).json();
  const fetcher = (path: string) => get(path);

  return {
    token,
    fetcher,
    me: (config?: SWRConfiguration) => useSWR<Me>(token ? "/api/me" : null, fetcher, config),
    projects: (config?: SWRConfiguration) =>
      useSWR<Project[]>(token ? "/api/projects" : null, fetcher, config),
    project: (id: number, config?: SWRConfiguration) =>
      useSWR<Project>(token && id ? `/api/projects/${id}` : null, fetcher, config),
    latestJob: (id: number, config?: SWRConfiguration) =>
      useSWR<Job | null>(token && id ? `/api/projects/${id}/jobs/latest` : null, fetcher, config),
    shots: (id: number, config?: SWRConfiguration) =>
      useSWR<Shot[]>(token && id ? `/api/projects/${id}/shots` : null, fetcher, config),

    setGeminiKey: async (apiKey: string) =>
      (
        await request(token, "/api/me/gemini-key", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: apiKey }),
        })
      ).json(),

    createProject: async (title: string, description?: string) =>
      (
        await request(token, "/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description }),
        })
      ).json() as Promise<Project>,

    deleteProject: async (id: number) =>
      request(token, `/api/projects/${id}`, { method: "DELETE" }),

    uploadVideo: async (
      projectId: number,
      file: File,
      threshold: number,
      skipAnalysis: boolean,
    ) => {
      const fd = new FormData();
      fd.append("video", file);
      fd.append("threshold", String(threshold));
      fd.append("skip_analysis", skipAnalysis ? "true" : "false");
      const res = await request(token, `/api/projects/${projectId}/jobs`, {
        method: "POST",
        body: fd,
      });
      return res.json() as Promise<Job>;
    },

    rerunJob: async (
      projectId: number,
      threshold: number,
      skipAnalysis: boolean,
    ) => {
      const fd = new FormData();
      fd.append("threshold", String(threshold));
      fd.append("skip_analysis", skipAnalysis ? "true" : "false");
      const res = await request(token, `/api/projects/${projectId}/jobs/rerun`, {
        method: "POST",
        body: fd,
      });
      return res.json() as Promise<Job>;
    },

    updateShot: async (projectId: number, shotId: number, patch: Partial<Shot>) => {
      const res = await request(token, `/api/projects/${projectId}/shots/${shotId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      return res.json() as Promise<Shot>;
    },

    exportUrl: (projectId: number) => `${API_URL}/api/projects/${projectId}/export.xlsx`,
    thumbnailUrl: (projectId: number, shotIndex: number) =>
      `${API_URL}/api/projects/${projectId}/thumbnails/${shotIndex}`,

    cancelJob: async (projectId: number, jobId: number) =>
      request(token, `/api/projects/${projectId}/jobs/${jobId}/cancel`, { method: "POST" }),

    scenarios: (config?: SWRConfiguration) =>
      useSWR<ScenarioListItem[]>(token ? "/api/scenarios" : null, fetcher, config),
    scenario: (id: number, config?: SWRConfiguration) =>
      useSWR<ScenarioOut>(token && id ? `/api/scenarios/${id}` : null, fetcher, config),
    createScenario: async (title: string, sourceText: string, file?: File) => {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("source_text", sourceText);
      if (file) fd.append("file", file);
      const res = await request(token, "/api/scenarios", { method: "POST", body: fd });
      return res.json() as Promise<ScenarioOut>;
    },
    deleteScenario: async (id: number) =>
      request(token, `/api/scenarios/${id}`, { method: "DELETE" }),
    cancelScenario: async (id: number) =>
      request(token, `/api/scenarios/${id}/cancel`, { method: "POST" }),
  };
}

export interface ScenarioListItem {
  id: number;
  title: string;
  status: string;
  created_at: string;
  finished_at: string | null;
}

export interface ScenarioOut extends ScenarioListItem {
  error: string | null;
  characters: any[] | null;
  locations: any[] | null;
  props: any[] | null;
  fx: any[] | null;
  shots: any[] | null;
  dialogues: any[] | null;
}

export async function authedFetch(token: string, path: string, init?: RequestInit) {
  return request(token, path, init);
}
