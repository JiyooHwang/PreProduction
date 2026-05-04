"use client";

import { useState } from "react";
import type { Shot } from "@/lib/api";
import { useApi } from "@/lib/api";

const FIELDS: {
  key: keyof Shot;
  label: string;
  width: string;
  multiline?: boolean;
}[] = [
  { key: "shot_size", label: "샷사이즈", width: "w-24" },
  { key: "camera_movement", label: "카메라 무빙", width: "w-32" },
  { key: "characters", label: "캐릭터", width: "w-48", multiline: true },
  { key: "background", label: "배경", width: "w-56", multiline: true },
  { key: "action", label: "액션/연기", width: "w-64", multiline: true },
  { key: "dialogue", label: "대사", width: "w-56", multiline: true },
  { key: "fx", label: "FX", width: "w-32", multiline: true },
  { key: "notes", label: "비고", width: "w-40", multiline: true },
];

export function ShotTable({
  projectId,
  shots,
  onChanged,
}: {
  projectId: number;
  shots: Shot[];
  onChanged: () => void;
}) {
  const api = useApi();

  if (shots.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow p-10 text-center text-slate-500">
        아직 샷이 없습니다. 영상을 업로드하면 자동으로 채워집니다.
      </div>
    );
  }

  const save = async (shot: Shot, key: keyof Shot, value: any) => {
    if ((shot as any)[key] === value) return;
    await api.updateShot(projectId, shot.id, { [key]: value } as any);
    onChanged();
  };

  return (
    <div className="bg-white rounded-2xl shadow overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            <th className="px-3 py-2 text-left w-14">컷#</th>
            <th className="px-3 py-2 text-left w-28">시작 TC</th>
            <th className="px-3 py-2 text-left w-28">끝 TC</th>
            <th className="px-3 py-2 text-left w-20">길이</th>
            <th className="px-3 py-2 text-left w-40">썸네일</th>
            {FIELDS.map((f) => (
              <th key={f.key} className={`px-3 py-2 text-left ${f.width}`}>
                {f.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shots.map((s) => (
            <tr key={s.id} className="border-t align-top">
              <td className="px-3 py-2 font-mono">{s.index}</td>
              <td className="px-3 py-2 font-mono text-xs">{s.start_tc}</td>
              <td className="px-3 py-2 font-mono text-xs">{s.end_tc}</td>
              <td className="px-3 py-2 text-xs">
                {s.duration_seconds.toFixed(2)}초<br />
                <span className="text-slate-500">{s.duration_frames}f</span>
              </td>
              <td className="px-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={api.thumbnailUrl(projectId, s.index)}
                  alt={`shot ${s.index}`}
                  className="w-36 h-20 object-cover rounded border"
                />
              </td>
              {FIELDS.map((f) => (
                <td key={f.key} className="px-2 py-1">
                  <EditableCell
                    shot={s}
                    field={f.key}
                    multiline={!!f.multiline}
                    onSave={save}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditableCell({
  shot,
  field,
  multiline,
  onSave,
}: {
  shot: Shot;
  field: keyof Shot;
  multiline: boolean;
  onSave: (s: Shot, k: keyof Shot, v: any) => void | Promise<void>;
}) {
  const initial = formatValue((shot as any)[field]);
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);

  const commit = async () => {
    if (value === initial) return;
    setSaving(true);
    try {
      const parsed = field === "characters" ? splitChars(value) : value || null;
      await onSave(shot, field, parsed);
    } finally {
      setSaving(false);
    }
  };

  const cls =
    "w-full bg-transparent focus:bg-yellow-50 outline-none rounded px-1 py-0.5 text-sm leading-snug";

  return multiline ? (
    <textarea
      value={value}
      rows={2}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      className={cls + " resize-y"}
      disabled={saving}
    />
  ) : (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      className={cls}
      disabled={saving}
    />
  );
}

function formatValue(v: any): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function splitChars(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
