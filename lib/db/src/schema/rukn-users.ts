import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const ruknUsersTable = pgTable("rukn_users", {
  clerkUserId: text("clerk_user_id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  role: text("role").notNull().default("trainee"),
  companyName: text("company_name"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
