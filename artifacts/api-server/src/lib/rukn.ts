import { getAuth } from "@clerk/express";
import type { Request } from "express";
import { db, ruknUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type RuknRole = "admin" | "trainer" | "trainee" | "company";

export async function getRuknProfile(req: Request) {
  const auth = getAuth(req);
  if (!auth.userId) return null;

  const [existing] = await db
    .select()
    .from(ruknUsersTable)
    .where(eq(ruknUsersTable.clerkUserId, auth.userId))
    .limit(1);
  if (existing) return existing;

  const claims = auth.sessionClaims as Record<string, unknown> | null;
  const firstName = typeof claims?.first_name === "string" ? claims.first_name : "";
  const lastName = typeof claims?.last_name === "string" ? claims.last_name : "";
  const claimName = typeof claims?.name === "string" ? claims.name : "";
  const claimEmail =
    typeof claims?.email === "string"
      ? claims.email
      : typeof claims?.email_address === "string"
        ? claims.email_address
        : "";
  const [created] = await db
    .insert(ruknUsersTable)
    .values({
      clerkUserId: auth.userId,
      name: claimName || `${firstName} ${lastName}`.trim() || "متدرب جديد",
      email: claimEmail,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;
  const [concurrent] = await db
    .select()
    .from(ruknUsersTable)
    .where(eq(ruknUsersTable.clerkUserId, auth.userId))
    .limit(1);
  return concurrent ?? null;
}

export function isRole(
  role: string,
  allowed: readonly RuknRole[],
): boolean {
  return allowed.includes(role as RuknRole);
}

export function courseToResponse(course: {
  id: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  format: string;
  level: string;
  price: string;
  durationHours: number;
  studentsCount: number;
  rating: string | null;
  instructorName: string;
  imageUrl: string;
  tvtcApprovalNumber: string | null;
  seats: number;
  startDate: string;
  isFeatured: boolean;
}) {
  return {
    ...course,
    price: Number(course.price),
    rating: course.rating === null ? null : Number(course.rating),
  };
}
