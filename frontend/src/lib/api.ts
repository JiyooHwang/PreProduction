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
  budget: number | null;
};

export type ProjectBudgetAnalysis = BudgetAnalysis & {
  assets: {
    characters: { name: string; appearance_count: number; shot_codes: string[]; grade?: string }[];
    locations: { name: string; appearance_count: number; shot_codes: string[]; grade?: string }[];
    props: { name: string; appearance_count: number; shot_codes: string[]; grade?: string }[];
    fx: { name: string; appearance_count: number; shot_codes: string[]; grade?: string }[];
  };
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
  sequence_number: number | null;
  shot_number: number | null;
  start_tc: string;
  end_tc: string;
  duration_seconds: number;
  duration_frames: number;
  thumbnail_path: string | null;
  shot_size: string | null;
  camera_movement: string | null;
  camera_angle: string | null;
  lens_mm: string | null;
  time_of_day: string | null;
  lighting: string | null;
  characters: string[] | null;
  background: string | null;
  props_used: string[] | null;
  fx_used: string[] | null;
  action: string | null;
  dialogue: string | null;
  fx: string | null;
  notes: string | null;
};

export function formatShotCode(
  seq: number | null | undefined,
  num: number | null | undefined,
): string {
  if (seq == null || num == null) return "";
  const pad = (n: number) => String(n).padStart(4, "0");
  return `S${pad(seq)}_C${pad(num)}`;
}

export type UnitPrices = {
  currency: string;
  assets: {
    characters: { S: number; AA: number; A: number; C: number };
    locations: { S: number; AA: number; A: number; C: number };
    props: { S: number; AA: number; A: number; C: number };
    fx: { S: number; AA: number; A: number; C: number };
  };
  shot_unit: number;
};

export type BudgetAnalysis = {
  currency: string;
  budget: number | null;
  total_cost: number;
  diff: number | null;
  breakdown: {
    characters: Record<string, { count: number; unit_price: number; subtotal: number }>;
    locations: Record<string, { count: number; unit_price: number; subtotal: number }>;
    props: Record<string, { count: number; unit_price: number; subtotal: number }>;
    fx: Record<string, { count: number; unit_price: number; subtotal: number }>;
    shots: { count: number; unit_price: number; subtotal: number };
  };
  asset_totals: { characters: number; locations: number; props: number; fx: number };
  suggestions: { type: string; message: string }[];
};

export type Me = {
  id: number;
  email: string;
  name: string;
  picture: string | null;
  has_gemini_key: boolean;
  grade_thresholds: { s: number; aa: number; a: number } | null;
  unit_prices: UnitPrices | null;
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

    setGradeThresholds: async (thresholds: { s: number; aa: number; a: number }) =>
      (
        await request(token, "/api/me/grade-thresholds", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(thresholds),
        })
      ).json() as Promise<Me>,

    resetGradeThresholds: async () =>
      (await request(token, "/api/me/grade-thresholds", { method: "DELETE" })).json() as Promise<Me>,

    setUnitPrices: async (prices: UnitPrices) =>
      (
        await request(token, "/api/me/unit-prices", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(prices),
        })
      ).json() as Promise<Me>,

    resetUnitPrices: async () =>
      (await request(token, "/api/me/unit-prices", { method: "DELETE" })).json() as Promise<Me>,

    setScenarioBudget: async (scenarioId: number, budget: number | null) =>
      (
        await request(token, `/api/scenarios/${scenarioId}/budget`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ budget }),
        })
      ).json() as Promise<ScenarioOut>,

    scenarioBudgetAnalysis: (id: number, config?: SWRConfiguration) =>
      useSWR<BudgetAnalysis>(
        token && id ? `/api/scenarios/${id}/budget-analysis` : null,
        fetcher,
        config,
      ),

    setProjectBudget: async (projectId: number, budget: number | null) =>
      (
        await request(token, `/api/projects/${projectId}/budget`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ budget }),
        })
      ).json() as Promise<Project>,

    projectBudgetAnalysis: (id: number, config?: SWRConfiguration) =>
      useSWR<ProjectBudgetAnalysis>(
        token && id ? `/api/projects/${id}/budget-analysis` : null,
        fetcher,
        config,
      ),

    mergeProjectAssets: async (
      projectId: number,
      assetType: "characters" | "props" | "fx",
      sourceNames: string[],
      targetName: string,
    ) =>
      (
        await request(token, `/api/projects/${projectId}/merge-assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset_type: assetType,
            source_names: sourceNames,
            target_name: targetName,
          }),
        })
      ).json() as Promise<{ ok: boolean; affected_shots: number; merged: number; target: string }>,

    mergeScenarioAssets: async (
      scenarioId: number,
      assetType: "characters" | "locations" | "props" | "fx",
      sourceNames: string[],
      targetName: string,
    ) =>
      (
        await request(token, `/api/scenarios/${scenarioId}/merge-assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset_type: assetType,
            source_names: sourceNames,
            target_name: targetName,
          }),
        })
      ).json() as Promise<ScenarioOut>,

    updateAssetGrade: async (
      scenarioId: number,
      assetType: "characters" | "locations" | "props" | "fx",
      assetIndex: number,
      grade: "S" | "AA" | "A" | "C" | null,
    ) =>
      (
        await request(
          token,
          `/api/scenarios/${scenarioId}/assets/${assetType}/${assetIndex}/grade`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ grade }),
          },
        )
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
    startStoryboard: async (id: number) => {
      const res = await request(token, `/api/scenarios/${id}/storyboard`, { method: "POST" });
      return res.json() as Promise<ScenarioOut>;
    },
    cancelStoryboard: async (id: number) =>
      request(token, `/api/scenarios/${id}/storyboard/cancel`, { method: "POST" }),
    storyboardImageUrl: (id: number, shotIndex: number) =>
      `${API_URL}/api/scenarios/${id}/storyboard/${shotIndex}`,
    scenarioExportUrl: (id: number) => `${API_URL}/api/scenarios/${id}/export.xlsx`,

    // 샷 재생성 (커스텀 프롬프트 가능)
    getShotPrompt: async (scenarioId: number, shotIndex: number) =>
      (
        await request(token, `/api/scenarios/${scenarioId}/storyboard/${shotIndex}/prompt`)
      ).json() as Promise<{ prompt: string }>,
    regenerateShot: async (
      scenarioId: number,
      shotIndex: number,
      customPrompt?: string,
      useReferences: boolean = true,
    ) => {
      const res = await request(
        token,
        `/api/scenarios/${scenarioId}/storyboard/${shotIndex}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: customPrompt || null,
            use_references: useReferences,
          }),
        },
      );
      return res.json() as Promise<{ ok: boolean; shot_index: number; prompt: string }>;
    },

    // 캐릭터 라이브러리
    characters: (config?: SWRConfiguration) =>
      useSWR<CharacterDesign[]>(token ? "/api/me/characters" : null, fetcher, config),
    characterImageUrl: (id: number) => `${API_URL}/api/me/characters/${id}/image`,
    createCharacter: async (name: string, description: string, file: File) => {
      const fd = new FormData();
      fd.append("name", name);
      fd.append("description", description);
      fd.append("image", file);
      const res = await request(token, "/api/me/characters", {
        method: "POST",
        body: fd,
      });
      return res.json() as Promise<CharacterDesign>;
    },
    updateCharacter: async (
      id: number,
      patch: { name?: string; description?: string },
    ) => {
      const res = await request(token, `/api/me/characters/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      return res.json() as Promise<CharacterDesign>;
    },
    replaceCharacterImage: async (id: number, file: File) => {
      const fd = new FormData();
      fd.append("image", file);
      const res = await request(token, `/api/me/characters/${id}/image`, {
        method: "PUT",
        body: fd,
      });
      return res.json() as Promise<CharacterDesign>;
    },
    deleteCharacter: async (id: number) =>
      request(token, `/api/me/characters/${id}`, { method: "DELETE" }),
  };
}

export interface CharacterDesign {
  id: number;
  name: string;
  description: string | null;
  image_mime: string;
  created_at: string;
  updated_at: string;
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
  storyboard_status: string | null;
  storyboard_progress_done: number;
  storyboard_progress_total: number;
  storyboard_error: string | null;
  budget: number | null;
}

export async function authedFetch(token: string, path: string, init?: RequestInit) {
  return request(token, path, init);
}
