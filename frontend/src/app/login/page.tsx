"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

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
        <button
          onClick={() => signIn("google", { callbackUrl: "/" })}
          className="w-full bg-slate-900 text-white py-3 rounded-lg hover:bg-slate-700"
        >
          Google 계정으로 로그인
        </button>
        <p className="mt-6 text-xs text-slate-400">
          회사 도메인 계정만 접근할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
