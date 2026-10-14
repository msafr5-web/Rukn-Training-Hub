import {
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ruknCoursesTable } from "./rukn-courses";
import { ruknUsersTable } from "./rukn-users";

export const ruknEnrollmentsTable = pgTable(
  "rukn_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => ruknUsersTable.clerkUserId, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => ruknCoursesTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"),
    progressPercentage: integer("progress_percentage").notNull().default(0),
    nextSession: timestamp("next_session", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("rukn_enrollments_user_course_idx").on(
      table.userId,
      table.courseId,
    ),
  ],
);
