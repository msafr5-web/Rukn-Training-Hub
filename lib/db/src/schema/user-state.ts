import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const userQuestionStatesTable = pgTable(
  "user_question_states",
  {
    userId: text("user_id").notNull(),
    questionId: text("question_id").notNull(),
    isFavorite: boolean("is_favorite").notNull().default(false),
    favoriteUpdatedAt: timestamp("favorite_updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    isRead: boolean("is_read").notNull().default(false),
    readUpdatedAt: timestamp("read_updated_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({
      name: "user_question_states_pk",
      columns: [table.userId, table.questionId],
    }),
  ],
);

export const userDeviceProgressTable = pgTable(
  "user_device_progress",
  {
    userId: text("user_id").notNull(),
    deviceId: text("device_id").notNull(),
    answered: integer("answered").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    sessions: integer("sessions").notNull().default(0),
  },
  (table) => [
    primaryKey({
      name: "user_device_progress_pk",
      columns: [table.userId, table.deviceId],
    }),
  ],
);

export const userPracticeSessionsTable = pgTable(
  "user_practice_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    clientSessionId: text("client_session_id").notNull(),
    categoryId: text("category_id").notNull(),
    totalQuestions: integer("total_questions").notNull(),
    correctAnswers: integer("correct_answers").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_practice_sessions_user_session_idx").on(
      table.userId,
      table.clientSessionId,
    ),
  ],
);
