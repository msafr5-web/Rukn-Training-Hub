import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, ruknCoursesTable, ruknEnrollmentsTable } from "@workspace/db";
import {
  CreateCourseBody,
  CreateCourseResponse,
  DeleteCourseParams,
  EnrollInCourseParams,
  EnrollInCourseResponse,
  GetCourseParams,
  GetCourseResponse,
  ListCoursesQueryParams,
  ListCoursesResponse,
  UpdateCourseBody,
  UpdateCourseParams,
  UpdateCourseResponse,
} from "@workspace/api-zod";
import { courseToResponse, getRuknProfile, isRole } from "../lib/rukn";

const router: IRouter = Router();

router.get("/courses", async (req, res): Promise<void> => {
  const parsed = ListCoursesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const filters = [];
  const { search, category, format } = parsed.data;
  if (category) filters.push(eq(ruknCoursesTable.category, category));
  if (format) filters.push(eq(ruknCoursesTable.format, format));
  if (search) {
    const pattern = `%${search}%`;
    filters.push(
      or(
        ilike(ruknCoursesTable.title, pattern),
        ilike(ruknCoursesTable.summary, pattern),
        ilike(ruknCoursesTable.category, pattern),
      ),
    );
  }

  const rows = await db
    .select()
    .from(ruknCoursesTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(ruknCoursesTable.isFeatured), asc(ruknCoursesTable.startDate));
  res.json(ListCoursesResponse.parse(rows.map(courseToResponse)));
});

router.post("/courses", async (req, res): Promise<void> => {
  const user = await getRuknProfile(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!isRole(user.role, ["admin", "trainer"])) {
    res.status(403).json({ error: "Trainer or administrator access required" });
    return;
  }

  const parsed = CreateCourseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = {
    ...parsed.data,
    instructorName: user.role === "trainer" ? user.name : parsed.data.instructorName,
    price: parsed.data.price.toFixed(2),
    startDate: parsed.data.startDate.toISOString().slice(0, 10),
  };
  const [course] = await db
    .insert(ruknCoursesTable)
    .values(input)
    .returning();
  res.status(201).json(CreateCourseResponse.parse(courseToResponse(course)));
});

router.get("/courses/:id", async (req, res): Promise<void> => {
  const params = GetCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [course] = await db
    .select()
    .from(ruknCoursesTable)
    .where(eq(ruknCoursesTable.id, params.data.id))
    .limit(1);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  res.json(GetCourseResponse.parse(courseToResponse(course)));
});

router.patch("/courses/:id", async (req, res): Promise<void> => {
  const user = await getRuknProfile(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!isRole(user.role, ["admin", "trainer"])) {
    res.status(403).json({ error: "Trainer or administrator access required" });
    return;
  }
  const params = UpdateCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateCourseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const changes = {
    ...parsed.data,
    price: parsed.data.price?.toFixed(2),
    startDate: parsed.data.startDate?.toISOString().slice(0, 10),
  };
  const [course] = await db
    .update(ruknCoursesTable)
    .set(changes)
    .where(
      user.role === "trainer"
        ? and(
            eq(ruknCoursesTable.id, params.data.id),
            eq(ruknCoursesTable.instructorName, user.name),
          )
        : eq(ruknCoursesTable.id, params.data.id),
    )
    .returning();
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  res.json(UpdateCourseResponse.parse(courseToResponse(course)));
});

router.delete("/courses/:id", async (req, res): Promise<void> => {
  const user = await getRuknProfile(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }
  const params = DeleteCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [course] = await db
    .delete(ruknCoursesTable)
    .where(eq(ruknCoursesTable.id, params.data.id))
    .returning({ id: ruknCoursesTable.id });
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/courses/:id/enroll", async (req, res): Promise<void> => {
  const user = await getRuknProfile(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (user.role !== "trainee") {
    res.status(403).json({ error: "Trainee access required" });
    return;
  }
  const params = EnrollInCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [course] = await db
    .select()
    .from(ruknCoursesTable)
    .where(eq(ruknCoursesTable.id, params.data.id))
    .limit(1);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  if (Number(course.price) > 0) {
    res.status(402).json({
      error: "Payment integration is required before enrolling in this paid course",
    });
    return;
  }

  const [existing] = await db
    .select({ id: ruknEnrollmentsTable.id })
    .from(ruknEnrollmentsTable)
    .where(
      and(
        eq(ruknEnrollmentsTable.userId, user.clerkUserId),
        eq(ruknEnrollmentsTable.courseId, course.id),
      ),
    )
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "Already enrolled in this course" });
    return;
  }

  const enrolledCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ruknEnrollmentsTable)
    .where(
      and(
        eq(ruknEnrollmentsTable.courseId, course.id),
        sql`${ruknEnrollmentsTable.status} <> 'cancelled'`,
      ),
    );
  if ((enrolledCount[0]?.count ?? 0) >= course.seats) {
    res.status(409).json({ error: "Course is full" });
    return;
  }

  const [enrollment] = await db
    .insert(ruknEnrollmentsTable)
    .values({ userId: user.clerkUserId, courseId: course.id })
    .returning();
  await db
    .update(ruknCoursesTable)
    .set({ studentsCount: sql`${ruknCoursesTable.studentsCount} + 1` })
    .where(eq(ruknCoursesTable.id, course.id));
  res.status(201).json(
    EnrollInCourseResponse.parse({
      id: enrollment.id,
      courseId: course.id,
      courseTitle: course.title,
      status: enrollment.status,
      progressPercentage: enrollment.progressPercentage,
      durationHours: course.durationHours,
      instructorName: course.instructorName,
      nextSession: enrollment.nextSession?.toISOString() ?? null,
    }),
  );
});

export default router;
