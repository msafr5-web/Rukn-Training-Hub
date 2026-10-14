import { Router, type IRouter } from "express";
import { and, count, eq, inArray } from "drizzle-orm";
import {
  db,
  ruknCertificatesTable,
  ruknCoursesTable,
  ruknEnrollmentsTable,
  ruknUsersTable,
} from "@workspace/db";
import {
  GetCompanyPortalResponse,
  GetMyPortalResponse,
  ListManagedEnrollmentsResponse,
  ListMyEnrollmentsResponse,
  UpdateMyEnrollmentProgressBody,
  UpdateMyEnrollmentProgressParams,
  UpdateMyEnrollmentProgressResponse,
} from "@workspace/api-zod";
import { getRuknProfile, isRole } from "../lib/rukn";

const router: IRouter = Router();

router.get("/portal/me", async (req, res): Promise<void> => {
  const user = await getRuknProfile(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const enrollments = await db
    .select({
      status: ruknEnrollmentsTable.status,
      progressPercentage: ruknEnrollmentsTable.progressPercentage,
      durationHours: ruknCoursesTable.durationHours,
    })
    .from(ruknEnrollmentsTable)
    .innerJoin(
      ruknCoursesTable,
      eq(ruknEnrollmentsTable.courseId, ruknCoursesTable.id),
    )
    .where(eq(ruknEnrollmentsTable.userId, user.clerkUserId));
  const [certificateCount] = await db
    .select({ count: count() })
    .from(ruknCertificatesTable)
    .where(eq(ruknCertificatesTable.traineeUserId, user.clerkUserId));

  const activeCourses = enrollments.filter(
    (enrollment) => enrollment.status === "active",
  ).length;
  const completedCourses = enrollments.filter(
    (enrollment) => enrollment.status === "completed",
  ).length;
  const hoursLearned = enrollments.reduce(
    (sum, enrollment) =>
      sum +
      Math.round(
        (enrollment.durationHours * enrollment.progressPercentage) / 100,
      ),
    0,
  );
  const certificates = Number(certificateCount?.count ?? 0);
  res.json(
    GetMyPortalResponse.parse({
      userName: user.name,
      role: user.role,
      activeCourses,
      completedCourses,
      certificates,
      hoursLearned,
    }),
  );
});

router.get("/portal/enrollments", async (req, res): Promise<void> => {
  const user = await getRuknProfile(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const rows = await db
    .select({
      id: ruknEnrollmentsTable.id,
      courseId: ruknCoursesTable.id,
      courseTitle: ruknCoursesTable.title,
      status: ruknEnrollmentsTable.status,
      progressPercentage: ruknEnrollmentsTable.progressPercentage,
      durationHours: ruknCoursesTable.durationHours,
      instructorName: ruknCoursesTable.instructorName,
      nextSession: ruknEnrollmentsTable.nextSession,
    })
    .from(ruknEnrollmentsTable)
    .innerJoin(
      ruknCoursesTable,
      eq(ruknEnrollmentsTable.courseId, ruknCoursesTable.id),
    )
    .where(eq(ruknEnrollmentsTable.userId, user.clerkUserId));
  res.json(
    ListMyEnrollmentsResponse.parse(
      rows.map((row) => ({
        ...row,
        nextSession: row.nextSession?.toISOString() ?? null,
      })),
    ),
  );
});

router.get("/portal/managed-enrollments", async (req, res): Promise<void> => {
  const user = await getRuknProfile(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!isRole(user.role, ["admin", "trainer"])) {
    res.status(403).json({ error: "Trainer or administrator access required" });
    return;
  }
  const rows = await db
    .select({
      id: ruknEnrollmentsTable.id,
      courseId: ruknCoursesTable.id,
      courseTitle: ruknCoursesTable.title,
      traineeName: ruknUsersTable.name,
      status: ruknEnrollmentsTable.status,
      progressPercentage: ruknEnrollmentsTable.progressPercentage,
      durationHours: ruknCoursesTable.durationHours,
      instructorName: ruknCoursesTable.instructorName,
      certificateId: ruknCertificatesTable.id,
    })
    .from(ruknEnrollmentsTable)
    .innerJoin(
      ruknCoursesTable,
      eq(ruknEnrollmentsTable.courseId, ruknCoursesTable.id),
    )
    .innerJoin(
      ruknUsersTable,
      eq(ruknEnrollmentsTable.userId, ruknUsersTable.clerkUserId),
    )
    .leftJoin(
      ruknCertificatesTable,
      eq(ruknCertificatesTable.enrollmentId, ruknEnrollmentsTable.id),
    )
    .where(
      user.role === "trainer"
        ? eq(ruknCoursesTable.instructorName, user.name)
        : undefined,
    );
  res.json(
    ListManagedEnrollmentsResponse.parse(
      rows.map(({ certificateId, ...row }) => ({
        ...row,
        hasCertificate: certificateId !== null,
      })),
    ),
  );
});

router.patch("/portal/enrollments/:id", async (req, res): Promise<void> => {
  const user = await getRuknProfile(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const params = UpdateMyEnrollmentProgressParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateMyEnrollmentProgressBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [enrollment] = await db
    .update(ruknEnrollmentsTable)
    .set({
      progressPercentage: body.data.progressPercentage,
      status: body.data.progressPercentage === 100 ? "completed" : "active",
    })
    .where(
      and(
        eq(ruknEnrollmentsTable.id, params.data.id),
        eq(ruknEnrollmentsTable.userId, user.clerkUserId),
      ),
    )
    .returning();
  if (!enrollment) {
    res.status(404).json({ error: "Enrollment not found" });
    return;
  }
  const [course] = await db
    .select()
    .from(ruknCoursesTable)
    .where(eq(ruknCoursesTable.id, enrollment.courseId))
    .limit(1);
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  res.json(
    UpdateMyEnrollmentProgressResponse.parse({
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

router.get("/portal/company", async (req, res): Promise<void> => {
  const user = await getRuknProfile(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (user.role !== "company" || !user.companyName) {
    res.status(403).json({ error: "Company access required" });
    return;
  }

  const employees = await db
    .select({
      clerkUserId: ruknUsersTable.clerkUserId,
      name: ruknUsersTable.name,
    })
    .from(ruknUsersTable)
    .where(eq(ruknUsersTable.companyName, user.companyName));
  const enrollmentRows =
    employees.length === 0
      ? []
      : await db
          .select({
            courseTitle: ruknCoursesTable.title,
            traineeName: ruknUsersTable.name,
            progressPercentage: ruknEnrollmentsTable.progressPercentage,
            status: ruknEnrollmentsTable.status,
          })
          .from(ruknEnrollmentsTable)
          .innerJoin(
            ruknCoursesTable,
            eq(ruknEnrollmentsTable.courseId, ruknCoursesTable.id),
          )
          .innerJoin(
            ruknUsersTable,
            eq(ruknEnrollmentsTable.userId, ruknUsersTable.clerkUserId),
          )
          .where(
            and(
              inArray(
                ruknEnrollmentsTable.userId,
                employees.map((employee) => employee.clerkUserId),
              ),
              eq(ruknUsersTable.companyName, user.companyName),
            ),
          );
  const completionRate =
    enrollmentRows.length === 0
      ? 0
      : enrollmentRows.reduce(
          (sum, row) => sum + row.progressPercentage,
          0,
        ) / enrollmentRows.length;
  res.json(
    GetCompanyPortalResponse.parse({
      companyName: user.companyName,
      employeeCount: employees.length,
      activeEnrollments: enrollmentRows.filter(
        (row) => row.status === "active",
      ).length,
      completionRate: Math.round(completionRate),
      enrollments: enrollmentRows,
    }),
  );
});

export default router;
