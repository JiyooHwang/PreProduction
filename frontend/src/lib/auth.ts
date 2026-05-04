import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN?.trim() ?? "";

const providers = DEMO_MODE
  ? [
      CredentialsProvider({
        id: "demo",
        name: "Demo",
        credentials: {},
        async authorize() {
          // 데모 모드: 검증 없이 공용 demo 사용자 반환
          return {
            id: "demo",
            name: "Demo User",
            email: "demo@local",
          };
        },
      }),
    ]
  : [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      }),
    ];

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile }) {
      if (DEMO_MODE) return true;
      if (!allowedDomain) return true;
      const email = (profile as any)?.email as string | undefined;
      return !!email && email.endsWith("@" + allowedDomain);
    },
    async jwt({ token, account }) {
      if (account?.id_token) {
        token.idToken = account.id_token;
      } else if (DEMO_MODE && !token.idToken) {
        token.idToken = "demo-token";
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).idToken = token.idToken;
      return session;
    },
  },
  pages: { signIn: "/login" },
};
