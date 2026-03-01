// src/auth.ts
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter"; // سيبها زي ما هي عندك
import { prisma } from "./lib/prisma";
import argon2 from "argon2";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.AUTH_SECRET,

  // ✅ مهم للـ middleware (Edge) من غير ما نعتمد على DB sessions
  session: { strategy: "jwt" },

  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toString().toLowerCase().trim();
        const password = credentials?.password?.toString();

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const ok = await argon2.verify(user.passwordHash, password);
        if (!ok) return null;

        return { id: user.id, email: user.email, role: user.role } as any;
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) (token as any).role = (user as any).role ?? "USER";
      return token;
    },
    async session({ session, token }) {
      if (session.user) (session.user as any).role = (token as any).role ?? "USER";
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
};