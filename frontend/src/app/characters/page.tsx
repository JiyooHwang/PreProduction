"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Header } from "@/components/Header";
import { CharacterDesign, useApi } from "@/lib/api";

const MAX_BYTES = 5 * 1024 * 1024;

export default function CharactersPage() {
  const { status } = useSession();
  const router = useRouter();
  const api = useApi();
  const { data: chars, mutate } = api.characters({ refreshInterval: 0 });

  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createFile, setCreateFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status !== "authenticated") return null;

  const resetCreate = () => {
    setCreating(false);
    setCreateName("");
    setCreateDesc("");
    setCreateFile(null);
    setErr(null);
  };

  const handleCreate = async () => {
    setErr(null);
    if (!createName.trim()) {
      setErr("이름을 입력하세요.");
      return;
    }
    if (!createFile) {
      setErr("이미지를 선택하세요.");
      return;
    }
    if (createFile.size > MAX_BYTES) {
      setErr("이미지는 5MB 이하만 가능합니다.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/jpg"].includes(createFile.type)) {
      setErr("PNG 또는 JPG 파일만 가능합니다.");
      return;
    }
    setBusy(true);
    try {
      await api.createCharacter(createName.trim(), createDesc.trim(), createFile);
      await mutate();
      resetCreate();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">캐릭터 라이브러리</h1>
            <div className="text-sm text-slate-500 mt-1">
              스토리보드 생성 시 같은 이름의 캐릭터가 샷에 등장하면 자동으로 이 디자인을 참조합니다.
            </div>
          </div>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
            >
              + 새 캐릭터
            </button>
          )}
        </div>

        <UsageGuide />

        {creating && (
          <div className="bg-white rounded-2xl shadow p-5 mb-6 border border-slate-200">
            <h2 className="font-semibold mb-3">새 캐릭터 추가</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  이름 <span className="text-red-500">*</span>
                  <span className="text-slate-400 ml-2">
                    (시나리오의 캐릭터 이름과 동일하게)
                  </span>
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="예: 주인공A"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">설명 (선택)</label>
                <input
                  type="text"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  placeholder="예: 20대 여성, 단발머리"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  디자인 이미지 <span className="text-red-500">*</span>
                  <span className="text-slate-400 ml-2">(PNG/JPG, 5MB 이하)</span>
                </label>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) => setCreateFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
                {createFile && (
                  <div className="text-xs text-slate-500 mt-1">
                    {createFile.name} ({(createFile.size / 1024).toFixed(0)} KB)
                  </div>
                )}
              </div>
              {err && <div className="text-sm text-red-600">{err}</div>}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreate}
                  disabled={busy}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:bg-slate-300"
                >
                  {busy ? "저장 중..." : "저장"}
                </button>
                <button
                  onClick={resetCreate}
                  disabled={busy}
                  className="bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {!chars && <div className="text-slate-500 text-sm">불러오는 중...</div>}
        {chars && chars.length === 0 && !creating && (
          <div className="bg-white rounded-2xl shadow p-8 text-center text-slate-500">
            아직 등록된 캐릭터가 없습니다. 위 [+ 새 캐릭터] 버튼으로 추가하세요.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(chars || []).map((c) => (
            <CharacterCard key={c.id} c={c} onChange={() => mutate()} />
          ))}
        </div>
      </main>
    </div>
  );
}

function UsageGuide() {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 mb-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="font-semibold text-purple-900">
          💡 캐릭터 라이브러리 사용법
        </div>
        <span className="text-purple-700 text-sm">{open ? "접기" : "펼치기"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm text-purple-900">
          <div>
            <div className="font-semibold mb-1">1. 이름 매칭</div>
            <div className="text-purple-800">
              시나리오 분석에서 추출된 캐릭터 이름과 라이브러리 이름이{" "}
              <b>대소문자 무시, 정확히 일치</b>해야 매칭됩니다.
              <ul className="list-disc ml-5 mt-1 space-y-0.5 text-purple-700">
                <li>
                  ✅ 시나리오: <code>&quot;Eun&quot;</code> / 라이브러리:{" "}
                  <code>&quot;EUN&quot;</code> → 매칭됨
                </li>
                <li>
                  ❌ 시나리오: <code>&quot;은이&quot;</code> / 라이브러리:{" "}
                  <code>&quot;Eun&quot;</code> → 매칭 안 됨
                </li>
              </ul>
              <div className="mt-1 text-purple-700">
                팁: 시나리오 분석 결과의 캐릭터 이름을 먼저 확인한 뒤, 그 이름과
                <b> 똑같이</b> 라이브러리에 등록하세요.
              </div>
            </div>
          </div>

          <div>
            <div className="font-semibold mb-1">2. 라이브러리에 없는 캐릭터</div>
            <div className="text-purple-800">
              매칭되는 항목이 없으면 그냥 텍스트 프롬프트만으로 생성됩니다 (기존
              방식과 동일). 라이브러리를 안 만들어도 스토리보드 생성은 그대로 작동.
            </div>
          </div>

          <div>
            <div className="font-semibold mb-1">3. 참조 이미지의 효과</div>
            <div className="text-purple-800">
              Gemini 가 멀티모달 입력으로 받은 이미지를 <b>스타일/외모 참조</b>로
              활용합니다. 100% 일관성은 아니고 &quot;비슷한 분위기&quot; 정도로
              생각하세요. 세부 디테일이 안 맞으면 샷 옆의 <b>🔄 재생성</b> 으로
              프롬프트 직접 수정해서 보강 가능.
            </div>
          </div>

          <div>
            <div className="font-semibold mb-1">4. 권장 이미지 가이드</div>
            <div className="text-purple-800">
              <ul className="list-disc ml-5 space-y-0.5">
                <li>정면 또는 3/4 각도의 깔끔한 캐릭터 디자인</li>
                <li>배경 단순할수록 좋음 (흰 배경/단색 추천)</li>
                <li>PNG/JPG, 5MB 이하</li>
                <li>여러 각도가 합쳐진 캐릭터 시트도 OK</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CharacterCard({
  c,
  onChange,
}: {
  c: CharacterDesign;
  onChange: () => void;
}) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [desc, setDesc] = useState(c.description ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bust, setBust] = useState(0); // cache buster for img
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setErr(null);
    if (!name.trim()) {
      setErr("이름은 비울 수 없습니다.");
      return;
    }
    setBusy(true);
    try {
      await api.updateCharacter(c.id, {
        name: name.trim(),
        description: desc.trim(),
      });
      setEditing(false);
      onChange();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const handleReplaceImage = async (file: File) => {
    if (file.size > MAX_BYTES) {
      alert("이미지는 5MB 이하만 가능합니다.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      alert("PNG 또는 JPG 파일만 가능합니다.");
      return;
    }
    setBusy(true);
    try {
      await api.replaceCharacterImage(c.id, file);
      setBust(Date.now());
      onChange();
    } catch (e: any) {
      alert("이미지 교체 실패: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`'${c.name}' 캐릭터를 삭제할까요?`)) return;
    setBusy(true);
    try {
      await api.deleteCharacter(c.id);
      onChange();
    } catch (e: any) {
      alert("삭제 실패: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow border border-slate-200 overflow-hidden">
      <div className="bg-slate-100 aspect-[4/5] relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${api.characterImageUrl(c.id)}${bust ? `?t=${bust}` : ""}`}
          alt={c.name}
          className="w-full h-full object-cover"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="absolute bottom-2 right-2 bg-white/90 text-slate-700 text-xs px-3 py-1 rounded shadow hover:bg-white"
        >
          이미지 교체
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleReplaceImage(f);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
      </div>
      <div className="p-4">
        {editing ? (
          <div className="space-y-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
            />
            <input
              type="text"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="설명"
              className="w-full border border-slate-300 rounded px-2 py-1 text-sm"
            />
            {err && <div className="text-xs text-red-600">{err}</div>}
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={busy}
                className="bg-slate-900 text-white text-xs px-3 py-1 rounded hover:bg-slate-700"
              >
                저장
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setName(c.name);
                  setDesc(c.description ?? "");
                  setErr(null);
                }}
                className="bg-slate-100 text-slate-700 text-xs px-3 py-1 rounded hover:bg-slate-200"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="font-semibold">{c.name}</div>
            {c.description && (
              <div className="text-xs text-slate-500 mt-1">{c.description}</div>
            )}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-slate-600 hover:underline"
              >
                수정
              </button>
              <button
                onClick={handleDelete}
                disabled={busy}
                className="text-xs text-red-600 hover:underline"
              >
                삭제
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
