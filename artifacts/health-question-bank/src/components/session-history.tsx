import { ArrowLeft, ClipboardCheck, CloudOff, CircleCheck } from 'lucide-react';
import type { LocalPracticeSession } from '@/lib/user-state';

type SessionHistoryProps = {
  sessions: LocalPracticeSession[];
  authReady: boolean;
  signedIn: boolean;
  loading: boolean;
  syncing: boolean;
  offline: boolean;
  sectorName: (categoryId: string) => string;
  onSignIn: () => void;
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ar-SA').format(value);
}

function formatDate(value?: string): string {
  if (!value) return 'التاريخ غير متاح';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'التاريخ غير متاح';
  return new Intl.DateTimeFormat('ar-SA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function SessionHistory({
  sessions,
  authReady,
  signedIn,
  loading,
  syncing,
  offline,
  sectorName,
  onSignIn,
}: SessionHistoryProps) {
  return (
    <section className="history-panel" aria-labelledby="history-title">
      <header className="history-heading">
        <div className="history-heading-copy">
          <span className="history-eyebrow">
            <ClipboardCheck size={15} aria-hidden="true" />
            سجل التدريب
          </span>
          <h2 id="history-title">جلساتك السابقة</h2>
          <p>أحدث جلسات التدريب ونتائجها.</p>
        </div>
        <span className="history-count">
          {formatNumber(sessions.length)} جلسة
        </span>
      </header>

      {authReady && !signedIn && (
        <div className="history-signin-notice">
          <p>
            تظهر هنا الجلسات المحفوظة على هذا الجهاز. سجّل الدخول لمزامنة سجلّك
            الكامل بين أجهزتك.
          </p>
          <button className="button-primary" type="button" onClick={onSignIn}>
            تسجيل الدخول <ArrowLeft size={15} aria-hidden="true" />
          </button>
        </div>
      )}

      {signedIn && syncing && (
        <p className="history-status" role="status">
          جارٍ تحديث السجل من حسابك...
        </p>
      )}
      {signedIn && offline && (
        <p className="history-status offline" role="status">
          <CloudOff size={15} aria-hidden="true" />
          تعذر الاتصال؛ سيُحدّث السجل عند عودة الاتصال.
        </p>
      )}

      {loading ? (
        <div className="history-empty" role="status">
          جارٍ تحميل سجل التدريب...
        </div>
      ) : sessions.length > 0 ? (
        <ol className="history-list">
          {sessions.map((session) => {
            const percent = session.totalQuestions
              ? Math.round(
                  (session.correctAnswers / session.totalQuestions) * 100,
                )
              : 0;

            return (
              <li className="history-entry" key={session.clientSessionId}>
                <div className="history-entry-top">
                  <span className="history-sector">
                    {sectorName(String(session.categoryId))}
                  </span>
                  <time
                    className="history-date"
                    dateTime={session.createdAt || undefined}
                  >
                    {formatDate(session.createdAt)}
                  </time>
                </div>
                <div className="history-entry-result">
                  <div className="history-score">
                    <CircleCheck size={17} aria-hidden="true" />
                    <span>
                      <strong>
                        {formatNumber(session.correctAnswers)} من{' '}
                        {formatNumber(session.totalQuestions)}
                      </strong>{' '}
                      إجابات صحيحة
                    </span>
                  </div>
                  <span className="history-percent">
                    {formatNumber(percent)}٪
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="history-empty">
          <div className="empty-icon">
            <ClipboardCheck size={22} aria-hidden="true" />
          </div>
          <h3>
            {signedIn
              ? 'لا توجد جلسات مكتملة بعد'
              : 'لا توجد جلسات محفوظة على هذا الجهاز'}
          </h3>
          <p>أكمل جلسة تدريب وستظهر نتيجتها هنا.</p>
        </div>
      )}
    </section>
  );
}
