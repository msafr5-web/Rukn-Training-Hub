import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const ruknCoursesTable = pgTable("rukn_courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  format: text("format").notNull(),
  level: text("level").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
  durationHours: integer("duration_hours").notNull(),
  studentsCount: integer("students_count").notNull().default(0),
  rating: numeric("rating", { precision: 2, scale: 1 }),
  instructorName: text("instructor_name").notNull(),
  imageUrl: text("image_url").notNull().default(""),
  tvtcApprovalNumber: text("tvtc_approval_number"),
  seats: integer("seats").notNull().default(20),
  startDate: date("start_date", { mode: "string" }).notNull(),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
