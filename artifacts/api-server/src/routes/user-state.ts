import { getAuth } from "@clerk/express";
import { GetMyStateQueryParams, GetMyStateResponse, SyncMyStateBody } from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  userDeviceProgressTable,
  userPracticeSessionsTable,
  userQuestionStatesTable,
} from "@workspace/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

async function readUserState(userId: string, deviceId: string) {
  const [questionRows, progressRows, sessionRows] = await Promise.all([
    db
      .select()
      .from(userQuestionStatesTable)
      .where(eq(userQuestionStatesTable.userId, userId)),
    db
      .select()
      .from(userDeviceProgressTable)
      .where(eq(userDeviceProgressTable.userId, userId)),
    db
      .select()
      .from(userPracticeSessionsTable)
      .where(eq(userPracticeSessionsTable.userId, userId))
      .orderBy(desc(userPracticeSessionsTable.createdAt))
      .limit(50),
  ]);

  const progress = progressRows.reduce(
    (total, row) => ({
      answered: total.answered + row.answered,
      correct: total.correct + row.correct,
      sessions: total.sessions + row.sessions,
    }),
    { answered: 0, correct: 0, sessions: 0 },
  );
  const currentDevice = progressRows.find((row) => row.deviceId === deviceId);

  return GetMyStateResponse.parse({
    questionStates: questionRows.map((row) => ({
      questionId: row.questionId,
      isFavorite: row.isFavorite,
      favoriteUpdatedAt: row.favoriteUpdatedAt,
      isRead: row.isRead,
      readUpdatedAt: row.readUpdatedAt,
    })),
    progress,
    deviceProgress: {
      deviceId,
      answered: currentDevice?.answered ?? 0,
      correct: currentDevice?.correct ?? 0,
      sessions: currentDevice?.sessions ?? 0,
    },
    sessions: sessionRows.map((row) => ({
      clientSessionId: row.clientSessionId,
      categoryId: row.categoryId,
      totalQuestions: row.totalQuestions,
      correctAnswers: row.correctAnswers,
      createdAt: row.createdAt,
    })),
  });
}

router.get("/me/state", async (req, res) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const parsedQuery = GetMyStateQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ error: "A valid deviceId is required" });
  }

  const state = await readUserState(userId, parsedQuery.data.deviceId);
  return res.json(state);
});

router.post("/me/state/sync", async (req, res) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const parsedBody = SyncMyStateBody.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: "Invalid study state" });
  }
  const state = parsedBody.data;

  if (
    state.deviceProgress.correct > state.deviceProgress.answered ||
    state.sessions.some(
      (session) => session.correctAnswers > session.totalQuestions,
    )
  ) {
    return res.status(400).json({ error: "Study counts are inconsistent" });
  }

  if (state.questionStates.length) {
    await db
      .insert(userQuestionStatesTable)
      .values(
        state.questionStates.map((question) => ({
          userId,
          questionId: question.questionId,
          isFavorite: question.isFavorite,
          favoriteUpdatedAt: question.favoriteUpdatedAt,
          isRead: question.isRead,
          readUpdatedAt: question.readUpdatedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [
          userQuestionStatesTable.userId,
          userQuestionStatesTable.questionId,
        ],
        set: {
          isFavorite: sql`CASE WHEN EXCLUDED.favorite_updated_at >= ${userQuestionStatesTable.favoriteUpdatedAt} THEN EXCLUDED.is_favorite ELSE ${userQuestionStatesTable.isFavorite} END`,
          favoriteUpdatedAt: sql`GREATEST(${userQuestionStatesTable.favoriteUpdatedAt}, EXCLUDED.favorite_updated_at)`,
          isRead: sql`${userQuestionStatesTable.isRead} OR EXCLUDED.is_read`,
          readUpdatedAt: sql`COALESCE(${userQuestionStatesTable.readUpdatedAt}, EXCLUDED.read_updated_at)`,
        },
      });
  }

  await db
    .insert(userDeviceProgressTable)
    .values({
      userId,
      deviceId: state.deviceProgress.deviceId,
      answered: state.deviceProgress.answered,
      correct: state.deviceProgress.correct,
      sessions: state.deviceProgress.sessions,
    })
    .onConflictDoUpdate({
      target: [
        userDeviceProgressTable.userId,
        userDeviceProgressTable.deviceId,
      ],
      set: {
        answered: sql`GREATEST(${userDeviceProgressTable.answered}, EXCLUDED.answered)`,
        correct: sql`GREATEST(${userDeviceProgressTable.correct}, EXCLUDED.correct)`,
        sessions: sql`GREATEST(${userDeviceProgressTable.sessions}, EXCLUDED.sessions)`,
      },
    });

  if (state.sessions.length) {
    await db
      .insert(userPracticeSessionsTable)
      .values(
        state.sessions.map((session) => ({
          userId,
          clientSessionId: session.clientSessionId,
          categoryId: session.categoryId,
          totalQuestions: session.totalQuestions,
          correctAnswers: session.correctAnswers,
        })),
      )
      .onConflictDoNothing({
        target: [
          userPracticeSessionsTable.userId,
          userPracticeSessionsTable.clientSessionId,
        ],
      });
  }

  const mergedState = await readUserState(userId, state.deviceProgress.deviceId);
  return res.json(mergedState);
});

export default router;
