import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  ruknCertificatesTable,
  ruknCoursesTable,
  ruknEnrollmentsTable,
  ruknUsersTable,
} from "@workspace/db";
import {
  IssueCertificateBody,
  IssueCertificateResponse,
  ListMyCertificatesResponse,
  VerifyCertificateParams,
  VerifyCertificateResponse,
} from "@workspace/api-zod";
import { getRuknProfile, isRole } from "../lib/rukn";

const router: IRouter = Router();

router.get("/certificates/mine", async (req, res): Promise<void> => {
  const user = await getRuknProfile(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const rows = await db
    .select({
      id: ruknCertificatesTable.id,
      certificateNumber: ruknCertificatesTable.certificateNumber,
      courseTitle: ruknCoursesTable.title,
      traineeName: ruknUsersTable.name,
      durationHours: ruknCoursesTable.durationHours,
      tvtcApprovalNumber: ruknCoursesTable.tvtcApprovalNumber,
      issuedAt: ruknCertificatesTable.issuedAt,
      verificationUrl: ruknCertificatesTable.verificationUrl,
    })
    .from(ruknCertificatesTable)
    .innerJoin(
      ruknCoursesTable,
      eq(ruknCertificatesTable.courseId, ruknCoursesTable.id),
    )
    .innerJoin(
      ruknUsersTable,
      eq(ruknCertificatesTable.traineeUserId, ruknUsersTable.clerkUserId),
    )
    .where(eq(ruknCertificatesTable.traineeUserId, user.clerkUserId));
  res.json(
    ListMyCertificatesResponse.parse(
      rows.map((row) => ({ ...row, issuedAt: row.issuedAt.toISOString() })),
    ),
  );
});

router.post("/certificates/issue", async (req, res): Promise<void> => {
  const user = await getRuknProfile(req);
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (!isRole(user.role, ["admin", "trainer"])) {
    res.status(403).json({ error: "Trainer or administrator access required" });
    return;
  }
  const parsed = IssueCertificateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .select({
      enrollment: ruknEnrollmentsTable,
      course: ruknCoursesTable,
      trainee: ruknUsersTable,
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
    .where(eq(ruknEnrollmentsTable.id, parsed.data.enrollmentId))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Enrollment not found" });
    return;
  }
  if (user.role === "trainer" && row.course.instructorName !== user.name) {
    res.status(403).json({ error: "This course is not assigned to you" });
    return;
  }
  if (
    row.enrollment.status !== "completed" ||
    row.enrollment.progressPercentage < 100
  ) {
    res.status(409).json({
      error: "The trainee must complete the course before certification",
    });
    return;
  }
  const [existing] = await db
    .select({ id: ruknCertificatesTable.id })
    .from(ruknCertificatesTable)
    .where(eq(ruknCertificatesTable.enrollmentId, row.enrollment.id))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "A certificate already exists" });
    return;
  }
  const certificateNumber = `RUKN-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  const verificationUrl = `/certificates/verify/${certificateNumber}`;
  const [certificate] = await db
    .insert(ruknCertificatesTable)
    .values({
      certificateNumber,
      enrollmentId: row.enrollment.id,
      traineeUserId: row.trainee.clerkUserId,
      courseId: row.course.id,
      issuedByUserId: user.clerkUserId,
      verificationUrl,
    })
    .returning();
  res.status(201).json(
    IssueCertificateResponse.parse({
      id: certificate.id,
      certificateNumber: certificate.certificateNumber,
      courseTitle: row.course.title,
      traineeName: row.trainee.name,
      durationHours: row.course.durationHours,
      tvtcApprovalNumber: row.course.tvtcApprovalNumber,
      issuedAt: certificate.issuedAt.toISOString(),
      verificationUrl: certificate.verificationUrl,
    }),
  );
});

router.get(
  "/certificates/verify/:certificateNumber",
  async (req, res): Promise<void> => {
    const params = VerifyCertificateParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .select({
        certificate: ruknCertificatesTable,
        course: ruknCoursesTable,
        trainee: ruknUsersTable,
      })
      .from(ruknCertificatesTable)
      .innerJoin(
        ruknCoursesTable,
        eq(ruknCertificatesTable.courseId, ruknCoursesTable.id),
      )
      .innerJoin(
        ruknUsersTable,
        eq(ruknCertificatesTable.traineeUserId, ruknUsersTable.clerkUserId),
      )
      .where(
        eq(
          ruknCertificatesTable.certificateNumber,
          params.data.certificateNumber,
        ),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Certificate not found" });
      return;
    }
    res.json(
      VerifyCertificateResponse.parse({
        valid: true,
        certificateNumber: row.certificate.certificateNumber,
        traineeName: row.trainee.name,
        courseTitle: row.course.title,
        durationHours: row.course.durationHours,
        tvtcApprovalNumber: row.course.tvtcApprovalNumber,
        issuedAt: row.certificate.issuedAt.toISOString(),
      }),
    );
  },
);

export default router;
