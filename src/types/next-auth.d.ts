import "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
      id: string;
      tenantId: string | null;
      role: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
