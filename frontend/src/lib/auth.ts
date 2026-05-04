import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN?.trim() ?? "";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile }) {
      if (!allowedDomain) return true;
      const email = (profile as any)?.email as string | undefined;
      return !!email && email.endsWith("@" + allowedDomain);
    },
    async jwt({ token, account }) {
      // Google ID 토큰을 백엔드 인증용으로 보존
      if (account?.id_token) {
        token.idToken = account.id_token;
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
