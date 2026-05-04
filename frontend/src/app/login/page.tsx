"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white rounded-2xl shadow p-10 w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-2">PreProduction</h1>
        <p className="text-slate-500 mb-8">애니메이션 샷 브레이크다운 도구</p>

        {DEMO_MODE ? (
          <>
            <button
              onClick={() => signIn("demo", { callbackUrl: "/" })}
              className="w-full bg-amber-500 text-white py-3 rounded-lg hover:bg-amber-600"
            >
              Demo 시작
            </button>
            <p className="mt-6 text-xs text-amber-700 bg-amber-50 rounded p-3">
              데모 모드입니다. 모든 사용자가 하나의 공용 계정을 공유하며,
              생성한 프로젝트와 등록한 Gemini 키도 공유됩니다.
            </p>
          </>
        ) : (
          <>
            <button
              onClick={() => signIn("google", { callbackUrl: "/" })}
              className="w-full bg-slate-900 text-white py-3 rounded-lg hover:bg-slate-700"
            >
              Google 계정으로 로그인
            </button>
            <p className="mt-6 text-xs text-slate-400">
              회사 도메인 계정만 접근할 수 있습니다.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
