import type {
  PracticeSessionInput,
  UserQuestionState,
} from "@workspace/api-client-react";

export type LocalPracticeSession = PracticeSessionInput & {
  createdAt?: string;
};

export type LocalStudyState = {
  questionStates: UserQuestionState[];
  deviceProgress: {
    answered: number;
    correct: number;
    sessions: number;
  };
  sessions: LocalPracticeSession[];
};

const GUEST_STATE_KEY = "health-bank-guest-state-v2";
const ACCOUNT_STATE_PREFIX = "health-bank-account-state-v2:";
const DEVICE_ID_KEY = "health-bank-device-id-v1";
const LEGACY_FAVORITES_KEY = "health-bank-favorites-v1";
const LEGACY_PROGRESS_KEY = "health-bank-progress-v1";

function emptyState(): LocalStudyState {
  return {
    questionStates: [],
    deviceProgress: { answered: 0, correct: 0, sessions: 0 },
    sessions: [],
  };
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the current session usable when browser storage is unavailable.
  }
}

function validTimestamp(value: unknown, fallback: string): string {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return fallback;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function normalizeState(value: unknown): LocalStudyState {
  if (!value || typeof value !== "object") return emptyState();
  const source = value as Partial<LocalStudyState>;
  const now = new Date().toISOString();
  const questionStates = Array.isArray(source.questionStates)
    ? source.questionStates.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const state = item as Partial<UserQuestionState>;
        if (state.questionId == null) return [];
        return [{
          questionId: String(state.questionId),
          isFavorite: Boolean(state.isFavorite),
          favoriteUpdatedAt: validTimestamp(
            state.favoriteUpdatedAt,
            "1970-01-01T00:00:00.000Z",
          ),
          isRead: Boolean(state.isRead),
          readUpdatedAt: state.readUpdatedAt
            ? validTimestamp(state.readUpdatedAt, now)
            : null,
        }];
      })
    : [];
  const sessions = Array.isArray(source.sessions)
    ? source.sessions.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const session = item as Partial<LocalPracticeSession>;
        if (
          !session.clientSessionId ||
          !session.categoryId ||
          typeof session.totalQuestions !== "number" ||
          typeof session.correctAnswers !== "number"
        ) {
          return [];
        }
        return [{
          clientSessionId: String(session.clientSessionId),
          categoryId: String(session.categoryId),
          totalQuestions: count(session.totalQuestions),
          correctAnswers: count(session.correctAnswers),
          ...(session.createdAt
            ? { createdAt: validTimestamp(session.createdAt, now) }
            : {}),
        }];
      })
    : [];

  return {
    questionStates,
    deviceProgress: {
      answered: count(source.deviceProgress?.answered),
      correct: count(source.deviceProgress?.correct),
      sessions: count(source.deviceProgress?.sessions),
    },
    sessions: sessions.slice(0, 100),
  };
}

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return "temporary-device";
  }
}

export function loadStudyState(userId: string | null): LocalStudyState {
  const key = userId
    ? `${ACCOUNT_STATE_PREFIX}${userId}`
    : GUEST_STATE_KEY;
  const existing = safeRead<unknown>(key, null);
  if (existing) return normalizeState(existing);

  if (userId) return emptyState();

  const legacyFavorites = safeRead<Array<string | number>>(
    LEGACY_FAVORITES_KEY,
    [],
  );
  const legacyProgress = safeRead<{
    answered?: number;
    correct?: number;
    sessions?: number;
  }>(LEGACY_PROGRESS_KEY, {});
  const migratedAt = new Date().toISOString();
  return {
    questionStates: Array.isArray(legacyFavorites)
      ? [...new Set(legacyFavorites.map(String))].map((questionId) => ({
          questionId,
          isFavorite: true,
          favoriteUpdatedAt: migratedAt,
          isRead: false,
          readUpdatedAt: null,
        }))
      : [],
    deviceProgress: {
      answered: count(legacyProgress.answered),
      correct: count(legacyProgress.correct),
      sessions: count(legacyProgress.sessions),
    },
    sessions: [],
  };
}

export function saveStudyState(
  userId: string | null,
  state: LocalStudyState,
) {
  const key = userId
    ? `${ACCOUNT_STATE_PREFIX}${userId}`
    : GUEST_STATE_KEY;
  const normalized = normalizeState(state);
  safeWrite(key, normalized);

  if (!userId) {
    safeWrite(
      LEGACY_FAVORITES_KEY,
      normalized.questionStates
        .filter((item) => item.isFavorite)
        .map((item) => item.questionId),
    );
    safeWrite(LEGACY_PROGRESS_KEY, normalized.deviceProgress);
  }
}

export function mergeQuestionStates(
  ...groups: UserQuestionState[][]
): UserQuestionState[] {
  const merged = new Map<string, UserQuestionState>();
  for (const group of groups) {
    for (const incoming of group) {
      const previous = merged.get(incoming.questionId);
      const incomingTime = Date.parse(incoming.favoriteUpdatedAt);
      const previousTime = previous
        ? Date.parse(previous.favoriteUpdatedAt)
        : Number.NEGATIVE_INFINITY;
      const newestFavorite = !previous || incomingTime >= previousTime;
      merged.set(incoming.questionId, {
        questionId: incoming.questionId,
        isFavorite: newestFavorite
          ? incoming.isFavorite
          : previous.isFavorite,
        favoriteUpdatedAt: newestFavorite
          ? incoming.favoriteUpdatedAt
          : previous.favoriteUpdatedAt,
        isRead: Boolean(previous?.isRead || incoming.isRead),
        readUpdatedAt:
          previous?.readUpdatedAt ?? incoming.readUpdatedAt ?? null,
      });
    }
  }
  return [...merged.values()];
}

export function mergeSessions(
  ...groups: LocalPracticeSession[][]
): LocalPracticeSession[] {
  const merged = new Map<string, LocalPracticeSession>();
  for (const group of groups) {
    for (const session of group) {
      const previous = merged.get(session.clientSessionId);
      merged.set(session.clientSessionId, {
        ...previous,
        ...session,
      });
    }
  }
  return [...merged.values()]
    .sort(
      (left, right) =>
        Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? ""),
    )
    .slice(0, 100);
}

export function addProgress(
  left: LocalStudyState["deviceProgress"],
  right: LocalStudyState["deviceProgress"],
) {
  return {
    answered: left.answered + right.answered,
    correct: left.correct + right.correct,
    sessions: left.sessions + right.sessions,
  };
}

export function maxProgress(
  left: LocalStudyState["deviceProgress"],
  right: LocalStudyState["deviceProgress"],
) {
  return {
    answered: Math.max(left.answered, right.answered),
    correct: Math.max(left.correct, right.correct),
    sessions: Math.max(left.sessions, right.sessions),
  };
}

export function apiQuestionStates(
  states: UserQuestionState[],
): UserQuestionState[] {
  return states.map((state) => ({
    ...state,
    favoriteUpdatedAt: new Date(state.favoriteUpdatedAt).toISOString(),
    readUpdatedAt: state.readUpdatedAt
      ? new Date(state.readUpdatedAt).toISOString()
      : null,
  }));
}
