import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { db } from "@/lib/db";

/**
 * Auth.js (NextAuth v5) with GitHub OAuth.
 *
 * We use a JWT session (no DB adapter) and, on sign-in, upsert the User row with
 * their GitHub access token. The token itself is stored ONLY in the database
 * (server-side) and the JWT/session carries just the user id + username — the
 * access token never reaches the client.
 *
 * Scopes: `repo` is required to clone private repositories the user chooses to
 * scan; `read:user`/`user:email` identify the account.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      authorization: { params: { scope: "read:user user:email repo" } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Runs with `account`/`profile` only on initial sign-in.
      if (account && profile) {
        const githubId = String(profile.id);
        const username =
          (profile.login as string | undefined) ?? token.name ?? "user";
        const email =
          (profile.email as string | undefined) ?? (token.email as string | undefined) ?? null;
        const accessToken = account.access_token ?? "";

        const user = await db.user.upsert({
          where: { githubId },
          update: { username, email, accessToken },
          create: { githubId, username, email, accessToken },
        });

        token.userId = user.id;
        token.username = username;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      if (token.username) session.user.username = token.username as string;
      return session;
    },
  },
});
