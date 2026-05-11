"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";

export function Header() {
  const { data } = useSession();
  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-7xl px-6 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg">
          PreProduction · 샷 브레이크다운
        </Link>
        {data?.user && (
          <div className="flex items-center gap-3 text-sm">
            <Link href="/" className="text-slate-600 hover:underline">
              영상 분석
            </Link>
            <Link href="/scenarios" className="text-slate-600 hover:underline">
              시나리오 분석
            </Link>
            <Link href="/characters" className="text-slate-600 hover:underline">
              캐릭터 라이브러리
            </Link>
            <Link href="/settings" className="text-slate-600 hover:underline">
              설정
            </Link>
            <span className="text-slate-700">{data.user.name}</span>
            {data.user.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.user.image} alt="" className="h-7 w-7 rounded-full" />
            )}
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-slate-600 hover:underline"
            >
              로그아웃
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
