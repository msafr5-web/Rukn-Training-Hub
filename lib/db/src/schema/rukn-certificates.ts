import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ruknCoursesTable } from "./rukn-courses";
import { ruknEnrollmentsTable } from "./rukn-enrollments";
import { ruknUsersTable } from "./rukn-users";

export const ruknCertificatesTable = pgTable(
  "rukn_certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    certificateNumber: text("certificate_number").notNull().unique(),
    enrollmentId: uuid("enrollment_id")
      .notNull()
      .references(() => ruknEnrollmentsTable.id, { onDelete: "cascade" }),
    traineeUserId: text("trainee_user_id")
      .notNull()
      .references(() => ruknUsersTable.clerkUserId, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => ruknCoursesTable.id, { onDelete: "cascade" }),
    issuedByUserId: text("issued_by_user_id")
      .notNull()
      .references(() => ruknUsersTable.clerkUserId, { onDelete: "restrict" }),
    verificationUrl: text("verification_url").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("rukn_certificates_enrollment_idx").on(table.enrollmentId),
  ],
);
