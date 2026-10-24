import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { SessionHistory } from '@/components/session-history';
import { getMyState, syncMyState } from '@workspace/api-client-react';
import type {
  MyStateResponse,
  UserQuestionState,
  UserStateSyncInput,
} from '@workspace/api-client-react';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { arSA } from '@clerk/localizations';
import { shadcn } from '@clerk/themes';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import {
  ArrowLeft, ArrowRight, BookOpen, Bookmark, BookmarkCheck, Check, ChevronLeft,
  CircleHelp, CircleCheck, ClipboardCheck, Cloud, CloudCheck, CloudOff, Heart,
  LibraryBig, LogOut, RotateCcw, Search, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import source from './data/questions.json';
import {
  addProgress,
  apiQuestionStates,
  getDeviceId,
  loadStudyState,
  maxProgress,
  mergeQuestionStates,
  mergeSessions,
  saveStudyState,
} from './lib/user-state';
import { trackEvent } from './lib/analytics';
import type { LocalPracticeSession, LocalStudyState } from './lib/user-state';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#1c5a50',
    colorForeground: '#183b38',
    colorMutedForeground: '#6c827b',
    colorDanger: '#b3483f',
    colorBackground: '#fffdf8',
    colorInput: '#fbfaf7',
    colorInputForeground: '#183b38',
    colorNeutral: '#d9e4df',
    fontFamily: '"IBM Plex Sans Arabic", sans-serif',
    borderRadius: '14px',
  },
};

type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline';

type Choice = { label: string; text: string };
type Question = {
  id: number | string;
  categoryId: number | string;
  number: number;
  question: string;
  choices: Choice[];
  correctIndex: number;
  explanation: string;
};
type Category = { id: number | string; name: string; title: string; count: number };
type SessionChoice = Choice & { sourceIndex: number; displayLabel: string };
type SessionQuestion = Question & { shuffledChoices: SessionChoice[] };
type View = 'browse' | 'quiz' | 'results';
const LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
const UNSET_FAVORITE_AT = '1970-01-01T00:00:00.000Z';

function emptyStudyState(): LocalStudyState {
  return {
    questionStates: [],
    deviceProgress: { answered: 0, correct: 0, sessions: 0 },
    sessions: [],
  };
}

function nextTimestamp(previous?: string | null): string {
  const previousTime = previous ? Date.parse(previous) : 0;
  return new Date(Math.max(Date.now(), previousTime + 1)).toISOString();
}

function createSyncInput(
  state: LocalStudyState,
  deviceId: string,
): UserStateSyncInput {
  return {
    questionStates: apiQuestionStates(state.questionStates),
    deviceProgress: { deviceId, ...state.deviceProgress },
    sessions: state.sessions.map(
      ({ createdAt: _createdAt, ...session }) => session,
    ),
  };
}

function mergeServerState(
  current: LocalStudyState,
  server: MyStateResponse,
): LocalStudyState {
  return {
    questionStates: mergeQuestionStates(
      current.questionStates,
      server.questionStates,
    ),
    deviceProgress: maxProgress(current.deviceProgress, server.deviceProgress),
    sessions: mergeSessions(current.sessions, server.sessions),
  };
}

function AccountControls({
  syncStatus,
  progress,
  children,
}: {
  syncStatus: SyncStatus;
  progress: { answered: number; correct: number; sessions: number };
  children?: ReactNode;
}) {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const statusLabel = !isLoaded
    ? 'جاهز للتصفح'
    : !user
      ? `محفوظ محليًا · ${progress.answered} إجابة`
      : syncStatus === 'synced'
        ? `مزامنة الحساب · ${progress.answered} إجابة`
        : syncStatus === 'offline'
          ? 'سيُزامَن عند الاتصال'
          : 'جارٍ مزامنة التقدّم';
  const StatusIcon = !user
    ? Cloud
    : syncStatus === 'synced'
      ? CloudCheck
      : syncStatus === 'offline'
        ? CloudOff
        : Cloud;

  return (
    <div className="top-actions">
      <div className={`device-pill ${syncStatus === 'offline' ? 'offline' : ''}`} aria-live="polite">
        <span className="status-dot" />
        <StatusIcon size={14} aria-hidden="true" />
        {statusLabel}
      </div>
      {isLoaded && user ? (
        <div className="account-actions">
          <span className="account-name">{user.fullName || 'حسابي'}</span>
          <button
            className="account-action account-logout"
            type="button"
            onClick={() => void signOut({ redirectUrl: basePath || '/' })}
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
          >
            <LogOut size={15} />
          </button>
        </div>
      ) : (
        <button
          className="account-action"
          type="button"
          onClick={() => setLocation('/sign-in')}
          aria-label="مزامنة التقدّم بين الأجهزة"
          title="مزامنة التقدّم بين الأجهزة"
        >
          <Cloud size={15} />
          مزامنة التقدّم
        </button>
      )}
      {children}
    </div>
  );
}

function uniqueQuestions(items: Question[]) {
  const unique = new Map<string, Question>();
  for (const item of items) {
    const normalizedQuestion = item.question
      .replace(/\s*\(نموذج\s+\d+-\d+\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const choices = item.choices.map((choice) =>
      choice.text.replace(/\s+/g, ' ').trim(),
    );
    const explanation = item.explanation.replace(/\s+/g, ' ').trim();
    const key = JSON.stringify([
      normalizedQuestion,
      choices,
      item.correctIndex,
      explanation,
    ]);
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

function Home() {
  const categories = source.categories as Category[];
  const questions = source.questions as Question[];
  const { user, isLoaded: clerkLoaded } = useUser();
  const [, setLocation] = useLocation();
  const userId = user?.id ?? null;
  const deviceId = useMemo(getDeviceId, []);
  const [view, setView] = useState<View>('browse');
  const [tab, setTab] = useState<'all' | 'favorites' | 'history'>('all');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [count, setCount] = useState('10');
  const [studyState, setStudyState] = useState<LocalStudyState>(() =>
    loadStudyState(null),
  );
  const studyStateRef = useRef(studyState);
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;
  const [activeScope, setActiveScope] = useState('guest');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [remoteProgress, setRemoteProgress] = useState({
    answered: 0,
    correct: 0,
    sessions: 0,
  });
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [session, setSession] = useState<SessionQuestion[]>([]);
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [missed, setMissed] = useState<SessionQuestion[]>([]);
  const [lastMissed, setLastMissed] = useState<SessionQuestion[]>([]);
  const [sessionScore, setSessionScore] = useState(0);
  const [sessionCategory, setSessionCategory] = useState('all');
  const completionHandledRef = useRef(false);
  const currentScope = userId ? `user:${userId}` : 'guest';
  const isStateReady = activeScope === currentScope;
  const favorites = useMemo(
    () =>
      isStateReady
        ? studyState.questionStates
            .filter((item) => item.isFavorite)
            .map((item) => item.questionId)
        : [],
    [isStateReady, studyState.questionStates],
  );
  const readQuestionIds = useMemo(
    () =>
      new Set(
        isStateReady
          ? studyState.questionStates
              .filter((item) => item.isRead)
              .map((item) => item.questionId)
          : [],
      ),
    [isStateReady, studyState.questionStates],
  );
  const progressForDisplay = userId
    ? isStateReady
      ? remoteProgress
      : { answered: 0, correct: 0, sessions: 0 }
    : studyState.deviceProgress;
  const recentSessions = useMemo(
    () =>
      [...studyState.sessions]
        .sort(
          (left, right) =>
            Date.parse(right.createdAt ?? '') -
            Date.parse(left.createdAt ?? ''),
        )
        .slice(0, 30),
    [studyState.sessions],
  );
  const sessionSectorName = (id: string) =>
    id === 'all'
      ? 'كل القطاعات'
      : categories.find((category) => String(category.id) === id)?.name ??
        'قطاع آخر';

  const applyServerResponse = (ownerId: string, response: MyStateResponse) => {
    if (userIdRef.current !== ownerId) return;
    const next = mergeServerState(studyStateRef.current, response);
    studyStateRef.current = next;
    setStudyState(next);
    saveStudyState(ownerId, next);
    setRemoteProgress(response.progress);
    setSyncStatus('synced');
  };

  const enqueueCloudSync = (ownerId: string, snapshot: LocalStudyState) => {
    syncQueueRef.current = syncQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (userIdRef.current !== ownerId) return;
        setSyncStatus('syncing');
        try {
          const response = await syncMyState(
            createSyncInput(snapshot, deviceId),
            { credentials: 'same-origin' },
          );
          applyServerResponse(ownerId, response);
        } catch {
          if (userIdRef.current === ownerId) setSyncStatus('offline');
        }
      });
  };

  const commitStudyState = (
    next: LocalStudyState,
    shouldSync = true,
  ) => {
    if (!isStateReady) return;
    studyStateRef.current = next;
    setStudyState(next);
    saveStudyState(userId, next);
    if (userId && shouldSync) enqueueCloudSync(userId, next);
  };

  useEffect(() => {
    if (!clerkLoaded) return;
    let cancelled = false;
    const scope = userId ? `user:${userId}` : 'guest';
    const local = loadStudyState(userId);
    let initialState = local;

    if (userId) {
      const guest = loadStudyState(null);
      initialState = {
        questionStates: mergeQuestionStates(
          local.questionStates,
          guest.questionStates,
        ),
        deviceProgress: addProgress(
          local.deviceProgress,
          guest.deviceProgress,
        ),
        sessions: mergeSessions(local.sessions, guest.sessions),
      };
      saveStudyState(userId, initialState);
      saveStudyState(null, emptyStudyState());
    } else {
      saveStudyState(null, local);
    }

    studyStateRef.current = initialState;
    setStudyState(initialState);
    setActiveScope(scope);
    setRemoteProgress(initialState.deviceProgress);
    setSyncStatus(userId ? 'syncing' : 'local');

    if (userId) {
      void (async () => {
        try {
          const serverState = await getMyState(
            { deviceId },
            { credentials: 'same-origin' },
          );
          if (cancelled || userIdRef.current !== userId) return;

          const merged = mergeServerState(studyStateRef.current, serverState);
          studyStateRef.current = merged;
          setStudyState(merged);
          saveStudyState(userId, merged);
          setRemoteProgress(serverState.progress);

          const synced = await syncMyState(
            createSyncInput(merged, deviceId),
            { credentials: 'same-origin' },
          );
          if (!cancelled) applyServerResponse(userId, synced);
        } catch {
          if (!cancelled && userIdRef.current === userId) {
            setSyncStatus('offline');
          }
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [clerkLoaded, userId, deviceId]);

  useEffect(() => {
    if (!userId || !isStateReady) return;
    let lastRefresh = 0;
    const refreshFromServer = async () => {
      if (userIdRef.current !== userId || Date.now() - lastRefresh < 10_000) {
        return;
      }
      lastRefresh = Date.now();
      setSyncStatus('syncing');
      try {
        const serverState = await getMyState(
          { deviceId },
          { credentials: 'same-origin' },
        );
        if (userIdRef.current !== userId) return;
        const merged = mergeServerState(studyStateRef.current, serverState);
        commitStudyState(merged, false);
        setRemoteProgress(serverState.progress);
        enqueueCloudSync(userId, merged);
      } catch {
        if (userIdRef.current === userId) setSyncStatus('offline');
      }
    };
    window.addEventListener('focus', refreshFromServer);
    window.addEventListener('online', refreshFromServer);
    return () => {
      window.removeEventListener('focus', refreshFromServer);
      window.removeEventListener('online', refreshFromServer);
    };
  }, [userId, isStateReady, deviceId]);

  const updateQuestionState = (
    id: number | string,
    update: (previous: UserQuestionState | undefined) => UserQuestionState,
  ) => {
    const questionId = String(id);
    const currentState = studyStateRef.current;
    const previous = currentState.questionStates.find(
      (item) => item.questionId === questionId,
    );
    const updated = update(previous);
    const next: LocalStudyState = {
      ...currentState,
      questionStates: [
        ...currentState.questionStates.filter(
          (item) => item.questionId !== questionId,
        ),
        updated,
      ],
    };
    commitStudyState(next);
  };

  const categoryName = (id: number | string) =>
    categories.find((category) => String(category.id) === String(id))?.title ??
    categories.find((category) => String(category.id) === String(id))?.name ?? 'عام';
  const toggleFavorite = (id: number | string) => {
    updateQuestionState(id, (previous) => ({
      questionId: String(id),
      isFavorite: !previous?.isFavorite,
      favoriteUpdatedAt: nextTimestamp(previous?.favoriteUpdatedAt),
      isRead: Boolean(previous?.isRead),
      readUpdatedAt: previous?.readUpdatedAt ?? null,
    }));
  };
  const markQuestionRead = (id: number | string) => {
    updateQuestionState(id, (previous) => ({
      questionId: String(id),
      isFavorite: Boolean(previous?.isFavorite),
      favoriteUpdatedAt: previous?.favoriteUpdatedAt ?? UNSET_FAVORITE_AT,
      isRead: true,
      readUpdatedAt: previous?.readUpdatedAt ?? nextTimestamp(),
    }));
  };
  const isFavorite = (id: number | string) =>
    favorites.includes(String(id));
  const isRead = (id: number | string) =>
    readQuestionIds.has(String(id));

  const filtered = useMemo(() => {
    if (tab === 'history') return [];
    const normalized = search.trim().toLocaleLowerCase('ar');
    return questions.filter((question) => {
      const matchesTab =
        tab === 'all' || (tab === 'favorites' && isFavorite(question.id));
      const matchesCategory = categoryId === 'all' || String(question.categoryId) === categoryId;
      const matchesSearch = !normalized || [
        question.question, question.explanation, ...question.choices.map((choice) => choice.text),
        categoryName(question.categoryId),
      ].some((text) => text.toLocaleLowerCase('ar').includes(normalized));
      return matchesTab && matchesCategory && matchesSearch;
    });
  }, [questions, favorites, tab, categoryId, search, categories]);

  const beginSession = (items: Question[], category: string) => {
    const distinctItems = uniqueQuestions(items);
    const requestedCount = count === 'all' ? distinctItems.length : Number(count);
    const selectedQuestions = [...distinctItems].sort(() => Math.random() - 0.5).slice(0, requestedCount);
    const shuffled = selectedQuestions.map((question) => {
      // Each answer retains its source index; correctness is checked against that identity,
      // never the choice's new display position. Source data is never mutated.
      const shuffledChoices = question.choices
        .map((choice, sourceIndex) => ({ ...choice, sourceIndex }))
        .sort(() => Math.random() - 0.5)
        .map((choice, index) => ({ ...choice, displayLabel: LETTERS[index] ?? String(index + 1) }));
      return { ...question, shuffledChoices };
    });
    setSession(shuffled);
    setSessionCategory(category);
    completionHandledRef.current = false;
    setStep(0);
    setSelected(null);
    setAnswered(false);
    setMissed([]);
    setSessionScore(0);
    setView('quiz');
  };
  const startPractice = () => {
    const pool = categoryId === 'all' ? questions : questions.filter((item) => String(item.categoryId) === categoryId);
    if (pool.length) beginSession(pool, categoryId);
  };
  const current = session[step];
  const isCorrect = current && selected !== null
    ? current.shuffledChoices[selected]?.sourceIndex === current.correctIndex
    : false;
  const chooseAnswer = (index: number) => {
    if (answered || !current) return;
    const correct = current.shuffledChoices[index]?.sourceIndex === current.correctIndex;
    setSelected(index);
    setAnswered(true);
    if (correct) setSessionScore((value) => value + 1);
    else setMissed((value) => [...value, current]);
    const latest = studyStateRef.current;
    const questionId = String(current.id);
    const previous = latest.questionStates.find(
      (item) => item.questionId === questionId,
    );
    const readAt = new Date().toISOString();
    const questionStates = [
      ...latest.questionStates.filter((item) => item.questionId !== questionId),
      {
        questionId,
        isFavorite: Boolean(previous?.isFavorite),
        favoriteUpdatedAt: previous?.favoriteUpdatedAt ?? UNSET_FAVORITE_AT,
        isRead: true,
        readUpdatedAt: previous?.readUpdatedAt ?? readAt,
      },
    ];
    const nextState: LocalStudyState = {
      ...latest,
      questionStates,
      deviceProgress: {
        ...latest.deviceProgress,
        answered: latest.deviceProgress.answered + 1,
        correct: latest.deviceProgress.correct + (correct ? 1 : 0),
      },
    };
    commitStudyState(nextState);
  };
  const advance = () => {
    if (step + 1 >= session.length) {
      if (completionHandledRef.current) return;
      completionHandledRef.current = true;

      const latest = studyStateRef.current;
      const completedSession: LocalPracticeSession = {
        clientSessionId: crypto.randomUUID(),
        categoryId: sessionCategory,
        totalQuestions: session.length,
        correctAnswers: sessionScore,
        createdAt: new Date().toISOString(),
      };
      const nextState: LocalStudyState = {
        ...latest,
        deviceProgress: {
          ...latest.deviceProgress,
          sessions: latest.deviceProgress.sessions + 1,
        },
        sessions: mergeSessions(latest.sessions, [completedSession]),
      };
      commitStudyState(nextState);
      const sector =
        sessionCategory === 'all'
          ? 'كل القطاعات'
          : categories.find(
              (category) => String(category.id) === sessionCategory,
            )?.name ?? 'غير محدد';
      trackEvent('practice_session_completed', {
        sector,
        question_count: session.length,
        correct_answers: sessionScore,
      });
      setLastMissed(missed);
      setView('results');
    } else {
      setStep((value) => value + 1);
      setSelected(null);
      setAnswered(false);
    }
  };
  const retryMissed = () => {
    if (lastMissed.length) beginSession(lastMissed, sessionCategory);
  };
  const switchToBrowse = () => setView('browse');

  const renderQuestionCard = (question: Question, index: number) => (
    <article className="question-card" key={question.id} data-testid={`card-question-${question.id}`} style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
      <div className="question-meta">
        <span className="category-tag">{categoryName(question.categoryId)}</span>
        <span className="question-no">سؤال {question.number}</span>
      </div>
      <h3 className="question-text">{question.question}</h3>
      <div className="choices-preview">
        {question.choices.map((choice) => (
          <div className="choice-preview" key={`${question.id}-${choice.label}`}>
            <span className="choice-letter">{choice.label}</span><span>{choice.text}</span>
          </div>
        ))}
      </div>
      <div className="card-footer">
        <button className="text-action" onClick={() => beginSession([question], String(question.categoryId))} data-testid={`button-practice-${question.id}`}>
          <CircleHelp size={15} /> تدرّب على هذا السؤال
        </button>
        <div className="card-state-actions">
          <button
            className={`read-btn ${isRead(question.id) ? 'read' : ''}`}
            type="button"
            aria-label={isRead(question.id) ? 'تمت قراءة السؤال' : 'علّم السؤال كمقروء'}
            aria-pressed={isRead(question.id)}
            onClick={() => markQuestionRead(question.id)}
            disabled={isRead(question.id)}
            data-testid={`button-read-${question.id}`}
          >
            {isRead(question.id) ? <CircleCheck size={15} /> : <Check size={15} />}
            {isRead(question.id) ? 'مقروء' : 'علّم كمقروء'}
          </button>
          <button className={`bookmark-btn ${isFavorite(question.id) ? 'saved' : ''}`} aria-label={isFavorite(question.id) ? 'إزالة من المحفوظات' : 'إضافة إلى المحفوظات'} aria-pressed={isFavorite(question.id)} onClick={() => toggleFavorite(question.id)} data-testid={`button-favorite-${question.id}`}>
            {isFavorite(question.id) ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
        </div>
      </div>
    </article>
  );

  if (view === 'quiz' && current) {
    return (
      <main className="app-shell" dir="rtl">
        <header className="topbar">
          <div className="brand"><div className="brand-mark"><LibraryBig size={21} /></div><div><div className="brand-title">بنك المعرفة الصحية</div><div className="brand-subtitle">مرجعك للتعلّم والممارسة</div></div></div>
          <AccountControls syncStatus={syncStatus} progress={progressForDisplay} />
        </header>
        <div className="page-wrap quiz-shell">
          <button className="back-link" onClick={switchToBrowse} data-testid="button-exit-quiz"><ArrowRight size={16} /> العودة إلى المكتبة</button>
          <div className="quiz-head"><span>{categoryName(current.categoryId)}</span><span>السؤال {step + 1} من {session.length}</span></div>
          <div className="quiz-progress" role="progressbar" aria-label="تقدم الاختبار" aria-valuenow={step + 1} aria-valuemin={0} aria-valuemax={session.length}><span style={{ width: `${((step + 1) / session.length) * 100}%` }} /></div>
          <section className="quiz-card" aria-live="polite">
            <div className="question-meta"><span className="category-tag">سؤال {current.number}</span><button className={`bookmark-btn ${isFavorite(current.id) ? 'saved' : ''}`} aria-label={isFavorite(current.id) ? 'إزالة من المحفوظات' : 'إضافة إلى المحفوظات'} onClick={() => toggleFavorite(current.id)}>{isFavorite(current.id) ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}</button></div>
            <h2>{current.question}</h2>
            <div className="quiz-options">
              {current.shuffledChoices.map((choice, index) => {
                const rightChoice = choice.sourceIndex === current.correctIndex;
                const chosenWrong = answered && selected === index && !rightChoice;
                const className = `quiz-option ${selected === index ? 'selected' : ''} ${answered && rightChoice ? 'correct' : ''} ${chosenWrong ? 'incorrect' : ''}`;
                return <button key={`${current.id}-${choice.sourceIndex}`} className={className} onClick={() => chooseAnswer(index)} disabled={answered} aria-pressed={selected === index} data-testid={`button-answer-${index}`}>
                  <span className="option-marker">{answered && rightChoice ? <Check size={15} /> : chosenWrong ? <X size={15} /> : choice.displayLabel}</span><span>{choice.text}</span>
                </button>;
              })}
            </div>
            {answered && <div className={`feedback ${isCorrect ? 'good' : 'bad'}`} role="status">
              <strong>{isCorrect ? 'إجابة صحيحة، أحسنت' : 'ليست الإجابة الصحيحة'}</strong>
              <span>{current.explanation || `الإجابة الصحيحة: ${current.choices[current.correctIndex]?.text ?? ''}`}</span>
              {!isCorrect && <div style={{ marginTop: 7 }}>الإجابة الصحيحة: {current.choices[current.correctIndex]?.text}</div>}
            </div>}
            <div className="quiz-bottom"><small>{answered ? 'تظهر الإجابة الصحيحة مع التوضيح' : 'اختر إجابة واحدة للمتابعة'}</small><button className="button-primary" onClick={advance} disabled={!answered} data-testid="button-next-question">{step === session.length - 1 ? 'عرض النتيجة' : 'السؤال التالي'} <ChevronLeft size={16} /></button></div>
          </section>
        </div>
        <footer className="footer-note" style={{ maxWidth: 1240, margin: '0 auto', padding: '16px 28px' }}><span>بنك المعرفة الصحية</span><span>{userId ? 'التقدّم والمحفوظات مرتبطان بحسابك' : 'التقدّم محفوظ محليًا حتى تسجيل الدخول'}</span></footer>
      </main>
    );
  }

  if (view === 'results') {
    const percent = session.length ? Math.round((sessionScore / session.length) * 100) : 0;
    return (
      <main className="app-shell" dir="rtl">
        <header className="topbar"><div className="brand"><div className="brand-mark"><LibraryBig size={21} /></div><div><div className="brand-title">بنك المعرفة الصحية</div><div className="brand-subtitle">مرجعك للتعلّم والممارسة</div></div></div><AccountControls syncStatus={syncStatus} progress={progressForDisplay} /></header>
        <div className="page-wrap quiz-shell">
          <button className="back-link" onClick={switchToBrowse}><ArrowRight size={16} /> العودة إلى المكتبة</button>
          <section className="results-card" aria-live="polite">
            <div className="eyebrow" style={{ justifyContent: 'center', color: '#edb192' }}>انتهت الجولة</div>
            <div className="result-ring" style={{ ['--score' as string]: `${percent}%` }}><span>{percent}%</span></div>
            <h2>{percent >= 80 ? 'إتقان يبعث على الثقة' : percent >= 50 ? 'خطوة جيدة نحو الإتقان' : 'الممارسة تصنع الفرق'}</h2>
            <p>أجبت عن {sessionScore} من {session.length} أسئلة بشكل صحيح</p>
            <div className="results-actions">
              {lastMissed.length > 0 && <button className="primary-light" onClick={retryMissed} data-testid="button-retry-missed"><RotateCcw size={16} /> مراجعة {lastMissed.length} أسئلة أخطأت فيها</button>}
              <button className="button-secondary" onClick={startPractice} data-testid="button-new-session"><Sparkles size={15} /> جولة جديدة</button>
              <button className="button-secondary" onClick={switchToBrowse} data-testid="button-back-library">استعراض المكتبة</button>
            </div>
          </section>
          {lastMissed.length > 0 && <section className="missed-list"><h3>أسئلة تستحق مراجعة أخرى</h3>{lastMissed.map((item, i) => renderQuestionCard(item, i))}</section>}
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell" dir="rtl">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><LibraryBig size={21} /></div><div><div className="brand-title">بنك المعرفة الصحية</div><div className="brand-subtitle">مرجعك للتعلّم والممارسة</div></div></div>
        <AccountControls syncStatus={syncStatus} progress={progressForDisplay}>
          <button className="icon-button" onClick={startPractice} aria-label="بدء التدريب" title="بدء التدريب"><ClipboardCheck size={17} /></button>
        </AccountControls>
      </header>
      <div className="page-wrap">
        {tab !== 'history' && (
          <>
            <section className="welcome">
              <div><div className="eyebrow">معرفة عملية، أثر حقيقي</div><h1>كل ما تحتاجه،<br />في مكان واحد.</h1><p>تعلّم متطلبات الصحة العامة والامتثال بثقة. استعرض مرجعًا موثوقًا أو اختبر معرفتك بجلسات قصيرة تناسب وقتك.</p></div>
              <div className="welcome-aside"><div className="aside-number">660</div><div className="aside-label">سجلًا مستوردًا في 6 قطاعات</div></div>
            </section>
            <section className="hero-panel">
              <div className="hero-content"><div className="hero-kicker"><ShieldCheck size={15} /> تدريب مركّز على احتياجك</div><h2>خطوة صغيرة اليوم، معرفة راسخة غدًا.</h2><p>اختر عدد الأسئلة وابدأ. ستظهر الإجابة مع شرحها بعد كل اختيار، دون تكرار المحتوى في الجولة.</p></div>
              <div className="hero-controls">
                <select className="count-select" aria-label="عدد الأسئلة في الجولة" value={count} onChange={(e) => setCount(e.target.value)} data-testid="select-question-count">
                  <option value="5">٥ أسئلة</option><option value="10">١٠ أسئلة</option>{categoryId === 'all' && <option value="20">٢٠ سؤالًا</option>}<option value="all">كل الأسئلة الفريدة</option>
                </select>
                <button className="primary-light" onClick={startPractice} data-testid="button-start-practice"><BookOpen size={16} /> ابدأ التدريب <ArrowLeft size={15} /></button>
              </div>
            </section>
          </>
        )}
        <div className="tabs-row">
          <div className="tabs" role="tablist" aria-label="التنقل بين المكتبة والسجل">
            <button className={`tab-btn ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')} role="tab" aria-selected={tab === 'all'} data-testid="tab-all"><BookOpen size={15} /> كل الأسئلة <span className="tab-count">{questions.length}</span></button>
            <button className={`tab-btn ${tab === 'favorites' ? 'active' : ''}`} onClick={() => setTab('favorites')} role="tab" aria-selected={tab === 'favorites'} data-testid="tab-favorites"><Heart size={15} /> المحفوظات <span className="tab-count">{favorites.length}</span></button>
            <button className={`tab-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')} role="tab" aria-selected={tab === 'history'} data-testid="tab-history"><ClipboardCheck size={15} /> سجل التدريب <span className="tab-count">{recentSessions.length}</span></button>
          </div>
        </div>
        {tab === 'history' ? (
          <SessionHistory
            sessions={recentSessions}
            authReady={clerkLoaded}
            signedIn={Boolean(userId)}
            loading={!clerkLoaded || (Boolean(userId) && !isStateReady)}
            syncing={Boolean(userId) && syncStatus === 'syncing'}
            offline={Boolean(userId) && syncStatus === 'offline'}
            sectorName={sessionSectorName}
            onSignIn={() => setLocation('/sign-in')}
          />
        ) : (
          <>
            <div className="tools-row">
              <label className="search-box"><Search size={17} /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في الأسئلة والشروحات..." aria-label="البحث في الأسئلة" data-testid="input-search" /></label>
              <select className="select-filter" aria-label="تصفية حسب القطاع" value={categoryId} onChange={(e) => { const nextCategory = e.target.value; setCategoryId(nextCategory); if (nextCategory !== 'all' && count === '20') setCount('all'); }} data-testid="select-category">
                <option value="all">كل القطاعات</option>{categories.map((category) => <option key={category.id} value={String(category.id)}>{category.title || category.name}</option>)}
              </select>
              <span className="result-count" data-testid="text-result-count">{filtered.length} سؤال</span>
            </div>
            {filtered.length ? <div className="question-list">{filtered.map(renderQuestionCard)}</div> :
              <div className="empty-state" data-testid="empty-state"><div className="empty-icon">{tab === 'favorites' ? <Heart size={22} /> : <Search size={22} />}</div><h3>{tab === 'favorites' && favorites.length === 0 ? 'لم تحفظ أسئلة بعد' : 'لا توجد نتائج مطابقة'}</h3><p>{tab === 'favorites' && favorites.length === 0 ? 'احفظ الأسئلة التي تريد العودة إليها، وستجدها هنا على هذا الجهاز أو حسابك.' : 'جرّب كلمة بحث أخرى أو غيّر القطاع المحدد.'}</p>{(search || categoryId !== 'all') && <button onClick={() => { setSearch(''); setCategoryId('all'); }}>إزالة عوامل التصفية</button>}</div>}
          </>
        )}
        <footer className="footer-note">
          <span>المعرفة الصحية · مرجع للممارسة الواعية</span>
          <span>
            {tab === 'history'
              ? userId
                ? 'سجل التدريب متزامن مع حسابك'
                : 'السجل الكامل مرتبط بحسابك'
              : userId
                ? 'المحفوظات والتقدّم متزامنان مع حسابك'
                : 'تقدّمك ومفضّلاتك محفوظة محليًا على هذا الجهاز'}
          </span>
        </footer>
      </div>
      <nav className="mobile-tabs" aria-label="التنقل الرئيسي">
        <button className={tab === 'all' ? 'active' : ''} onClick={() => { setTab('all'); setView('browse'); }}><BookOpen size={17} />المكتبة</button>
        <button onClick={startPractice}><ClipboardCheck size={17} />تدريب</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => { setTab('history'); setView('browse'); }}><ClipboardCheck size={17} />السجل</button>
        <button className={tab === 'favorites' ? 'active' : ''} onClick={() => { setTab('favorites'); setView('browse'); }}><Heart size={17} />المحفوظات</button>
      </nav>
    </main>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

function SignInPage() {
  return (
    <main className="clerk-auth-page" dir="rtl">
      <div className="clerk-auth-heading">
        <div className="brand-mark"><LibraryBig size={21} /></div>
        <h1>تابع تعلّمك من أي جهاز</h1>
        <p>سجّل الدخول لمزامنة محفوظاتك ونتائج التدريب.</p>
      </div>
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </main>
  );
}

function SignUpPage() {
  return (
    <main className="clerk-auth-page" dir="rtl">
      <div className="clerk-auth-heading">
        <div className="brand-mark"><LibraryBig size={21} /></div>
        <h1>أنشئ حسابك الصحي</h1>
        <p>احتفظ بتقدّمك ومحفوظاتك متاحة على أجهزتك.</p>
      </div>
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </main>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user: clerkUser }) => {
      const nextUserId = clerkUser?.id ?? null;
      if (
        previousUserId.current !== undefined &&
        previousUserId.current !== nextUserId
      ) {
        client.clear();
      }
      previousUserId.current = nextUserId;
    });
    return unsubscribe;
  }, [addListener, client]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={arSA}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) =>
        setLocation(stripBase(to), { replace: true })
      }
    >
      <ClerkQueryClientCacheInvalidator />
      <Router />
    </ClerkProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <ClerkProviderWithRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
