import NextAuth from "next-auth";
import Email from "next-auth/providers/email";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/prisma";

function mustEnv(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

function mustNumber(key: string): number {
  const v = mustEnv(key);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid number env ${key}: ${v}`);
  return n;
}

function envBool(key: string, def: boolean): boolean {
  const v = process.env[key];
  if (!v) return def;
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
}

function pickDevDefaultTenantSlug(): string | null {
  const candidates = [
    process.env.DEV_DEFAULT_TENANT_SLUG,
    process.env.SEED_TENANT_SLUG,
    process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG,
    process.env.NEXT_PUBLIC_TENANT_SLUG_DEV,
  ]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);

  return candidates[0] ?? null;
}

async function devMaybeAssignTenant(userId: string): Promise<{ tenantId: string | null; role: string | null } | null> {
  if (process.env.NODE_ENV === "production") return null;

  const defaultSlug = pickDevDefaultTenantSlug();

  let tenantId: string | null = null;

  if (defaultSlug) {
    const t = await prisma.tenant.findUnique({
      where: { slug: defaultSlug },
      select: { id: true },
    });
    tenantId = t?.id ?? null;
  } else {
    const tenants = await prisma.tenant.findMany({ select: { id: true }, take: 2 });
    if (tenants.length === 1) tenantId = tenants[0].id;
  }

  if (!tenantId) return null;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      tenantId,
      role: "TENANT_OWNER",
      emailVerified: new Date(), // magic link = verified in dev
    },
    select: { tenantId: true, role: true },
  });

  return { tenantId: updated.tenantId ?? null, role: updated.role ?? null };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },

  providers: [
    Email({
      server: {
        host: mustEnv("EMAIL_SERVER_HOST"),
        port: mustNumber("EMAIL_SERVER_PORT"),
        secure: envBool("EMAIL_SERVER_SECURE", true),
        auth: {
          user: mustEnv("EMAIL_SERVER_USER"),
          pass: mustEnv("EMAIL_SERVER_PASSWORD"),
        },
      },
      from: mustEnv("EMAIL_FROM"),
    }),
  ],

  pages: {
    signIn: "/login",
    verifyRequest: "/login?check=1",
  },

  callbacks: {
    async jwt({ token, user }) {
      const userId = (user as any)?.id ?? (token as any).uid ?? (token as any).sub ?? null;
      if (userId) {
        (token as any).uid = userId;
        (token as any).sub = userId;
      }

      // Try to take from user if present
      if (user) {
        if ((user as any).tenantId !== undefined) (token as any).tenantId = (user as any).tenantId ?? null;
        if ((user as any).role !== undefined) (token as any).role = (user as any).role ?? null;
      }

      // Load from DB if missing
      const needsTenant = (token as any).tenantId == null;
      const needsRole = (token as any).role == null;

      if (userId && (needsTenant || needsRole)) {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { tenantId: true, role: true },
        });

        if (dbUser) {
          (token as any).tenantId = dbUser.tenantId ?? null;
          (token as any).role = dbUser.role ?? null;
        }

        // DEV auto-assign if still missing tenant
        if ((token as any).tenantId == null) {
          try {
            const assigned = await devMaybeAssignTenant(userId);
            if (assigned) {
              (token as any).tenantId = assigned.tenantId;
              (token as any).role = assigned.role;
            }
          } catch {
            // ignore
          }
        }

        if ((token as any).role == null) (token as any).role = "TENANT_OWNER";
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = (token as any).uid ?? (token as any).sub;
        (session.user as any).tenantId = (token as any).tenantId ?? null;
        (session.user as any).role = (token as any).role ?? "TENANT_OWNER";
      }
      return session;
    },
  },

  events: {
    async signIn({ user }) {
      try {
        await prisma.user.update({
          where: { id: (user as any).id },
          data: { lastLoginAt: new Date(), emailVerified: new Date() },
        });
      } catch {
        // ignore
      }
    },
  },
});
