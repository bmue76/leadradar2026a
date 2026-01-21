import NextAuth from "next-auth";
import Email from "next-auth/providers/email";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/server/prisma";

type AnyRecord = Record<string, unknown>;

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null;
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function readStringKey(obj: unknown, key: string): string | undefined {
  if (!isRecord(obj)) return undefined;
  return readString(obj[key]);
}

function readNullableStringKey(obj: unknown, key: string): string | null | undefined {
  if (!isRecord(obj)) return undefined;
  const v = obj[key];
  if (v === null) return null;
  return readString(v);
}

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
      // token is a mutable object in Auth.js callbacks
      const t = token as AnyRecord;

      const userIdFromUser = readStringKey(user, "id");
      const userIdFromToken = readStringKey(t, "uid") ?? readStringKey(t, "sub");
      const userId = userIdFromUser ?? userIdFromToken ?? null;

      if (userId) {
        t.uid = userId;
        t.sub = userId;
      }

      // Try to take from user if present
      if (user) {
        const tenantId = readNullableStringKey(user, "tenantId");
        const role = readNullableStringKey(user, "role");

        if (tenantId !== undefined) t.tenantId = tenantId;
        if (role !== undefined) t.role = role;
      }

      // Load from DB if missing
      const needsTenant = t.tenantId == null;
      const needsRole = t.role == null;

      if (userId && (needsTenant || needsRole)) {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { tenantId: true, role: true },
        });

        if (dbUser) {
          t.tenantId = dbUser.tenantId ?? null;
          t.role = dbUser.role ?? null;
        }

        // DEV auto-assign if still missing tenant
        if (t.tenantId == null) {
          try {
            const assigned = await devMaybeAssignTenant(userId);
            if (assigned) {
              t.tenantId = assigned.tenantId;
              t.role = assigned.role;
            }
          } catch {
            // ignore
          }
        }

        if (t.role == null) t.role = "TENANT_OWNER";
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        const u = session.user as unknown as AnyRecord;
        const t = token as AnyRecord;

        u.id = readStringKey(t, "uid") ?? readStringKey(t, "sub") ?? null;
        u.tenantId = readNullableStringKey(t, "tenantId") ?? null;
        u.role = readStringKey(t, "role") ?? "TENANT_OWNER";
      }
      return session;
    },
  },

  events: {
    async signIn({ user }) {
      try {
        const userId = readStringKey(user, "id");
        if (!userId) return;

        await prisma.user.update({
          where: { id: userId },
          data: { lastLoginAt: new Date(), emailVerified: new Date() },
        });
      } catch {
        // ignore
      }
    },
  },
});
