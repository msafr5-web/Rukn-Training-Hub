import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ArrowLeft, Award, BadgeCheck, BookOpen, BriefcaseBusiness,
  CalendarDays, Check, ChevronDown, Clock3, GraduationCap, Layers3,
  LoaderCircle, LockKeyhole, LogOut, MapPin, Menu, Search, ShieldCheck,
  Sparkles, Star, Users, X,
} from 'lucide-react';
import {
  getGetCompanyPortalQueryKey, getGetCourseQueryKey, getGetMyPortalQueryKey,
  getListCoursesQueryKey, getListManagedEnrollmentsQueryKey, getListMyCertificatesQueryKey,
  getListMyEnrollmentsQueryKey, useCreateCourse, useDeleteCourse,
  useEnrollInCourse, useGetCompanyPortal, useGetCourse, useGetMyPortal,
  useIssueCertificate, useListCourses, useListManagedEnrollments, useListMyCertificates,
  useListMyEnrollments, useUpdateCourse, useUpdateMyEnrollmentProgress, useVerifyCertificate,
  getVerifyCertificateQueryKey,
} from '@workspace/api-client-react';
import type { Course, CourseInput, CourseUpdate, ManagedEnrollment } from '@workspace/api-client-react';
import {
  Link, Redirect, Route, Router as WouterRouter, Switch, useLocation,
  useParams,
} from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const appearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#214c43',
    colorForeground: '#243a35',
    colorMutedForeground: '#6e7b74',
    colorDanger: '#a53d35',
    colorBackground: '#fbf9f2',
    colorInput: '#fffdf8',
    colorInputForeground: '#243a35',
    colorNeutral: '#d9d5c8',
    fontFamily: '"IBM Plex Sans Arabic", sans-serif',
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fbf9f2] rounded-3xl w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#193d36] font-bold',
    headerSubtitle: 'text-[#64746d]',
    socialButtonsBlockButtonText: 'text-[#193d36]',
    formFieldLabel: 'text-[#29453d]',
    footerActionLink: 'text-[#214c43] font-semibold',
    footerActionText: 'text-[#64746d]',
    dividerText: 'text-[#64746d]',
    identityPreviewEditButton: 'text-[#214c43]',
    formFieldSuccessText: 'text-[#214c43]',
    alertText: 'text-[#77302b]',
    logoBox: 'mb-3',
    logoImage: 'h-12',
    socialButtonsBlockButton: 'border-[#d9d5c8] hover:bg-[#f1eee4]',
    formButtonPrimary: 'bg-[#214c43] hover:bg-[#16382f] text-white',
    formFieldInput: 'bg-[#fffdf8] border-[#d9d5c8] text-[#243a35]',
    footerAction: 'text-[#64746d]',
    dividerLine: 'bg-[#dedacd]',
    alert: 'bg-[#fff1ed] border-[#efd0c8]',
    otpCodeFieldInput: 'border-[#d9d5c8]',
    formFieldRow: 'gap-2',
    main: 'text-[#243a35]',
  },
};

function formatPrice(price: number) {
  return price === 0 ? 'مجاناً' : `${new Intl.NumberFormat('ar-SA').format(price)} ر.س`;
}
function formatDate(date?: string | null) {
  if (!date) return 'يُعلن لاحقاً';
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf()) ? date : new Intl.DateTimeFormat('ar-SA', { dateStyle: 'long' }).format(parsed);
}
function formatFormat(format: string) {
  return ({ inPerson: 'حضوري', online: 'عن بُعد', hybrid: 'مدمج' } as Record<string, string>)[format] || format;
}
function formatLevel(level: string) {
  return ({ beginner: 'مبتدئ', intermediate: 'متوسط', advanced: 'متقدم' } as Record<string, string>)[level] || level;
}

function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" className={`inline-flex items-center gap-3 ${inverse ? 'text-[#f7f4ea]' : 'text-[#193d36]'}`} data-testid="link-rukn-home">
    <img src={`${basePath}/logo.svg`} alt="" className="h-10 w-10" />
    <span className="text-[1.28rem] font-bold tracking-tight">رُكن<span className="mr-1 text-[.7rem] font-medium opacity-65">للتدريب</span></span>
  </Link>;
}

function Header({ compact = false }: { compact?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return <header className="relative z-20 border-b border-[#dedacd] bg-[#f7f4ea]/90 backdrop-blur-md">
    <div className={`mx-auto flex max-w-[1240px] items-center justify-between px-5 ${compact ? 'h-[72px]' : 'h-[82px]'}`}>
      <Brand />
      <nav className="hidden items-center gap-8 text-sm font-semibold text-[#476159] md:flex" aria-label="التنقل الرئيسي">
        <Link href="/courses" className="transition hover:text-[#193d36]" data-testid="link-nav-courses">الدورات</Link>
        <Link href="/#method" className="transition hover:text-[#193d36]" data-testid="link-nav-how">كيف يعمل رُكن</Link>
        <Link href="/#verify" className="transition hover:text-[#193d36]" data-testid="link-nav-verify">تحقق من شهادة</Link>
      </nav>
      <div className="hidden items-center gap-4 md:flex">
        <Link href="/sign-in" className="px-3 py-2 text-sm font-semibold text-[#24473e] hover:text-[#a17435]" data-testid="link-sign-in">دخول المتدربين</Link>
        <Link href="/courses" className="rounded-full bg-[#214c43] px-5 py-3 text-sm font-semibold text-[#fbf9f2] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#173a32]" data-testid="link-header-explore">استكشف الدورات <ArrowLeft size={15} className="mr-2 inline" /></Link>
      </div>
      <button type="button" className="rounded-xl border border-[#d9d5c8] p-2 text-[#214c43] md:hidden" aria-label="فتح القائمة" onClick={() => setMenuOpen(!menuOpen)} data-testid="button-mobile-menu">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
    </div>
    {menuOpen && <nav className="grid gap-1 border-t border-[#dedacd] bg-[#f7f4ea] px-5 py-4 md:hidden">
      <Link href="/courses" onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold text-[#29453d]" data-testid="link-mobile-courses">الدورات التدريبية</Link>
      <Link href="/#method" onClick={() => setMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold text-[#29453d]" data-testid="link-mobile-method">كيف يعمل رُكن</Link>
      <Link href="/sign-in" onClick={() => setMenuOpen(false)} className="rounded-xl bg-[#214c43] px-4 py-3 text-sm font-semibold text-white" data-testid="link-mobile-sign-in">دخول المتدربين</Link>
    </nav>}
  </header>;
}

function Footer() {
  return <footer className="bg-[#183c35] text-[#e7e5d9]">
    <div className="mx-auto grid max-w-[1240px] gap-10 px-5 py-14 md:grid-cols-[1.3fr_1fr_1fr]">
      <div><Brand inverse /><p className="mt-5 max-w-sm text-sm leading-7 text-[#b9c6bd]">مساحة تعلّم موثوقة، تجمع المتدرب بالخبرة وتوثّق كل خطوة في رحلته المهنية.</p></div>
      <div><p className="mb-4 text-sm font-bold text-[#d8b672]">ابدأ رحلتك</p><div className="grid gap-3 text-sm text-[#c7d0c7]"><Link href="/courses" className="hover:text-white">الدورات المتاحة</Link><Link href="/sign-up" className="hover:text-white">أنشئ حساب متدرب</Link></div></div>
      <div><p className="mb-4 text-sm font-bold text-[#d8b672]">مساعدة وتوثيق</p><div className="grid gap-3 text-sm text-[#c7d0c7]"><Link href="/#verify" className="hover:text-white">التحقق من الشهادات</Link><Link href="/portal/company" className="hover:text-white">حلول المنشآت</Link></div></div>
    </div>
    <div className="border-t border-white/10 px-5 py-4 text-center text-xs text-[#aab8ad]">© رُكن للتدريب · تعلّم يترك أثراً</div>
  </footer>;
}

function Home() {
  const { data: courses, isLoading, isError, refetch } = useListCourses();
  const featured = useMemo(() => courses?.filter((course) => course.isFeatured).slice(0, 3) ?? [], [courses]);
  return <div className="grain min-h-[100dvh] bg-[#f7f4ea]">
    <Header />
    <main>
      <section className="relative mx-auto grid min-h-[610px] max-w-[1240px] items-center gap-12 overflow-hidden px-5 py-16 md:grid-cols-[1.07fr_.93fr] md:py-20">
        <div className="reveal relative z-10">
          <span className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#d9d2be] bg-[#f2eddf] px-4 py-2 text-xs font-semibold text-[#557268]"><span className="h-2 w-2 rounded-full bg-[#bd9652]" /> تدريب مهني موثوق في المملكة</span>
          <h1 className="rukn-display max-w-[680px] text-[3.35rem] font-semibold leading-[1.25] text-[#193d36] md:text-[5rem]">خطوتك القادمة<br /><span className="text-[#ae8243]">تبدأ من هنا.</span></h1>
          <p className="mt-6 max-w-[560px] text-lg leading-9 text-[#596c63]">اكتشف برامج تدريبية من خبراء المجال، تعلّم بمرونة، واحصل على شهادة قابلة للتحقق توثق ما أنجزته.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/courses" className="rounded-full bg-[#214c43] px-7 py-4 text-sm font-bold text-[#fffdf8] shadow-[0_12px_26px_rgba(28,67,57,.16)] transition hover:-translate-y-1" data-testid="link-hero-catalog">تصفّح الدورات <ArrowLeft size={16} className="mr-3 inline" /></Link>
            <Link href="/sign-up" className="rounded-full border border-[#c8c7b5] px-7 py-4 text-sm font-bold text-[#284b42] transition hover:bg-[#eeeadf]" data-testid="link-hero-sign-up">أنشئ حسابك</Link>
          </div>
          <div className="mt-12 flex items-center gap-8 border-t border-[#dedacd] pt-6">
            <div><strong className="block text-2xl text-[#214c43]">من التعلّم</strong><span className="text-xs text-[#77847c]">إلى أثر مهني ملموس</span></div>
            <span className="h-10 w-px bg-[#dedacd]" />
            <div><strong className="block text-2xl text-[#214c43]">شهادات</strong><span className="text-xs text-[#77847c]">يمكن التحقق منها</span></div>
          </div>
        </div>
        <div className="relative min-h-[400px] md:min-h-[520px]">
          <div className="absolute inset-4 rotate-[-3deg] rounded-[2.5rem] bg-[#dec99b]" />
          <div className="absolute inset-0 overflow-hidden rounded-[2.5rem] bg-[#254f45]">
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #e5d4aa 1px, transparent 1.4px)', backgroundSize: '28px 28px' }} />
            <div className="absolute -left-12 top-[-80px] h-[360px] w-[360px] rounded-full border border-[#e1c985]/30" />
            <div className="absolute -left-1 top-[-30px] h-[290px] w-[290px] rounded-full border border-[#e1c985]/35" />
            <div className="absolute left-[4.5rem] top-[2.4rem] h-[180px] w-[180px] rounded-full border border-[#e1c985]/35" />
            <div className="absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-[#183c35] to-transparent" />
            <div className="absolute bottom-8 right-8 left-8 rounded-[1.5rem] border border-white/15 bg-[#f7f4ea]/95 p-6 shadow-xl backdrop-blur">
              <div className="flex items-start justify-between gap-4"><span className="rounded-full bg-[#e9dfc7] px-3 py-1.5 text-xs font-bold text-[#6c5734]">رحلة تعلّم موثوقة</span><ShieldCheck className="text-[#66877a]" size={22} /></div>
              <p className="rukn-display mt-5 text-2xl font-semibold leading-9 text-[#193d36]">معرفة تبنيها،<br />وإنجاز يبقى معك.</p>
              <div className="mt-5 flex items-center justify-between border-t border-[#e2dfd4] pt-4 text-xs text-[#708078]"><span>تعلم · طبّق · وثّق</span><span className="flex items-center gap-1 text-[#a17d43]"><BadgeCheck size={15} /> شهادة قابلة للتحقق</span></div>
            </div>
            <div className="absolute right-[-8px] top-12 rotate-3 rounded-2xl border border-[#e9dfc7]/30 bg-[#f7f4ea] p-4 shadow-xl">
              <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#e5ddc9] text-[#214c43]"><GraduationCap size={21} /></div><div><p className="text-xs font-bold text-[#29453d]">تعلم على وتيرتك</p><p className="mt-1 text-[10px] text-[#79867e]">مع مدربين من الميدان</p></div></div>
            </div>
          </div>
        </div>
      </section>
      <section className="border-y border-[#dedacd] bg-[#efeadd]">
        <div className="mx-auto grid max-w-[1240px] gap-7 px-5 py-7 md:grid-cols-3">
          {[
            { icon: ShieldCheck, title: 'اختيار واضح', desc: 'تفاصيل البرنامج ومواعيده قبل التسجيل.' },
            { icon: Users, title: 'خبرة قريبة', desc: 'تعلّم مع مدربين يعرفون واقع المهنة.' },
            { icon: BadgeCheck, title: 'إنجاز موثّق', desc: 'شهادة تحمل رقم تحقق خاصاً بها.' },
          ].map(({ icon: Icon, title, desc }) => <div key={title} className="flex items-center gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#dce4da] text-[#31584d]"><Icon size={21} /></span><div><p className="font-bold text-[#29453d]">{title}</p><p className="mt-1 text-xs leading-5 text-[#697970]">{desc}</p></div></div>)}
        </div>
      </section>
      <section className="mx-auto max-w-[1240px] px-5 py-20 md:py-24">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
          <div><span className="text-xs font-bold tracking-[.12em] text-[#a17d43]">بداية موفقة</span><h2 className="rukn-display mt-3 text-3xl font-semibold text-[#193d36] md:text-4xl">برامج تستحق وقتك</h2><p className="mt-3 text-sm text-[#748078]">تعلّم عملي يواكب احتياج سوق العمل.</p></div>
          <Link href="/courses" className="group rounded-full border border-[#c9c6b8] px-5 py-3 text-sm font-semibold text-[#31584d] hover:bg-[#efebdf]" data-testid="link-home-all-courses">كل الدورات <ArrowLeft size={15} className="mr-2 inline transition group-hover:-translate-x-1" /></Link>
        </div>
        {isLoading ? <CourseSkeletons /> : isError ? <ErrorState onRetry={() => refetch()} /> : featured.length ? <div className="grid gap-5 md:grid-cols-3">{featured.map((course) => <CourseCard key={course.id} course={course} />)}</div> : <div className="rounded-3xl border border-dashed border-[#d0cbbb] bg-[#f2efe5] p-8 text-center text-sm text-[#758178]">ستظهر البرامج المميزة هنا قريباً. اكتشف بقية الدورات من صفحة البرامج.</div>}
      </section>
      <section id="method" className="bg-[#e9e6d9]">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 md:grid-cols-[.8fr_1.2fr] md:py-24">
          <div><span className="text-xs font-bold tracking-[.12em] text-[#a17d43]">خطوات بلا تعقيد</span><h2 className="rukn-display mt-3 text-4xl font-semibold leading-[1.4] text-[#193d36]">من أول بحث،<br />إلى شهادة موثوقة.</h2><p className="mt-5 max-w-md text-sm leading-7 text-[#68776f]">كل ما تحتاجه للتقدّم المهني في مكان واحد. اعرف خطوتك التالية دائماً.</p><Link href="/courses" className="mt-7 inline-flex items-center rounded-full bg-[#214c43] px-6 py-3 text-sm font-semibold text-white" data-testid="link-method-courses">ابدأ باستكشاف البرامج <ArrowLeft className="mr-2" size={16} /></Link></div>
          <div className="grid gap-3">
            {[
              ['01', 'اختر ما يناسب مسارك', 'قارن بين التخصصات، أنماط التعلّم، ومدد البرامج.'],
              ['02', 'سجّل وابدأ التعلّم', 'احتفظ بتقدمك ومواعيدك في مساحة شخصية واحدة.'],
              ['03', 'احتفظ بإنجازك', 'بعد إتمام البرنامج، تابع شهادتك ورقم التحقق الخاص بها.'],
            ].map(([n, title, desc]) => <div key={n} className="flex gap-5 border-b border-[#d6d2c5] py-5"><span className="rukn-display pt-1 text-2xl text-[#b38b4c]">{n}</span><div><h3 className="font-bold text-[#29453d]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#718077]">{desc}</p></div></div>)}
          </div>
        </div>
      </section>
      <section id="verify" className="mx-auto max-w-[1240px] px-5 py-20">
        <div className="grid gap-8 rounded-[2rem] bg-[#193e36] p-7 text-[#f7f4ea] md:grid-cols-[1fr_auto] md:items-center md:p-12">
          <div><span className="text-xs font-semibold text-[#d5b978]">توثيق واضح</span><h2 className="rukn-display mt-3 text-3xl font-semibold">هل لديك رقم شهادة؟</h2><p className="mt-3 text-sm leading-7 text-[#c4d0c7]">تحقق من بيانات الشهادة مباشرة باستخدام رقمها.</p></div>
          <VerifySearch dark />
        </div>
      </section>
      <section className="mx-auto max-w-[1240px] px-5 pb-20">
        <div className="flex flex-col justify-between gap-6 rounded-[2rem] border border-[#dedacd] bg-[#f0ecdf] p-8 md:flex-row md:items-center md:px-12 md:py-10">
          <div><span className="text-xs font-bold text-[#a17d43]">للمنشآت والفرق</span><h2 className="rukn-display mt-2 text-2xl font-semibold text-[#193d36]">طوّروا فرقكم، وتابعوا التقدم بثقة.</h2><p className="mt-2 text-sm text-[#697970]">مساحة لمتابعة تعلم الموظفين ومؤشرات إتمام البرامج.</p></div>
          <Link href="/portal/company" className="shrink-0 rounded-full border border-[#aeb6a7] px-6 py-3 text-sm font-bold text-[#31584d] transition hover:bg-[#e5e2d6]" data-testid="link-company-portal">مساحة المنشآت <ArrowLeft className="mr-2 inline" size={15} /></Link>
        </div>
      </section>
    </main>
    <Footer />
  </div>;
}

function CourseSkeletons() {
  return <div className="grid gap-5 md:grid-cols-3" aria-label="جارٍ تحميل الدورات">{[0, 1, 2].map((item) => <div key={item} className="animate-pulse overflow-hidden rounded-3xl border border-[#e3dfd3] bg-[#fbf9f2]"><div className="h-48 bg-[#e5e1d5]" /><div className="space-y-3 p-5"><div className="h-3 w-20 rounded bg-[#e5e1d5]" /><div className="h-5 w-4/5 rounded bg-[#e5e1d5]" /><div className="h-3 w-full rounded bg-[#e5e1d5]" /></div></div>)}</div>;
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="rounded-3xl border border-[#e4c8bf] bg-[#fff3ee] p-7 text-center"><p className="font-bold text-[#77302b]">تعذّر تحميل البيانات</p><p className="mt-2 text-sm text-[#875e56]">تحقق من اتصالك، ثم حاول مرة أخرى.</p><button type="button" onClick={onRetry} className="mt-4 rounded-full bg-[#7d3f37] px-5 py-2.5 text-sm font-semibold text-white" data-testid="button-retry">إعادة المحاولة</button></div>;
}

function CourseCard({ course }: { course: Course }) {
  const palette = course.isFeatured ? 'from-[#315b50] to-[#193d36]' : 'from-[#927850] to-[#5c6856]';
  return <Link href={`/courses/${course.id}`} className="group overflow-hidden rounded-[1.6rem] border border-[#e0dccf] bg-[#fbf9f2] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(31,59,48,.1)]" data-testid={`card-course-${course.id}`}>
    <div className={`relative h-[185px] overflow-hidden bg-gradient-to-br ${palette}`}>
      {course.imageUrl && <img src={course.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-50 transition duration-500 group-hover:scale-105" />}
      <div className="absolute inset-0 opacity-35" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #f1dfb4 1px, transparent 1.5px)', backgroundSize: '22px 22px' }} />
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#183c35]/65 to-transparent" />
      <span className="absolute right-4 top-4 rounded-full border border-white/25 bg-[#f7f4ea]/90 px-3 py-1 text-[11px] font-semibold text-[#29453d]">{course.category}</span>
      {course.isFeatured && <span className="absolute bottom-4 right-4 flex items-center gap-1.5 text-xs font-semibold text-[#f4e8c9]"><Sparkles size={14} /> اختيار رُكن</span>}
      <span className="absolute bottom-4 left-4 grid h-11 w-11 place-items-center rounded-2xl border border-white/25 bg-white/10 text-[#f2dfb2]"><BookOpen size={21} /></span>
    </div>
    <div className="p-5">
      <div className="flex items-center justify-between text-[11px] text-[#78857d]"><span>{formatFormat(course.format)}</span><span>{formatLevel(course.level)}</span></div>
      <h3 className="rukn-display mt-3 line-clamp-2 min-h-[56px] text-[1.22rem] font-semibold leading-7 text-[#203f37]">{course.title}</h3>
      <p className="mt-2 line-clamp-2 min-h-[44px] text-xs leading-6 text-[#718077]">{course.summary}</p>
      <div className="mt-5 flex items-center justify-between border-t border-[#e8e4d9] pt-4">
        <span className="flex items-center gap-1.5 text-xs text-[#77837a]"><Clock3 size={14} /> {course.durationHours} ساعة</span>
        <span className="font-bold text-[#31584d]">{formatPrice(course.price)}</span>
      </div>
    </div>
  </Link>;
}

function VerifySearch({ dark = false }: { dark?: boolean }) {
  const [, setLocation] = useLocation();
  const [number, setNumber] = useState('');
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (number.trim()) setLocation(`/certificates/verify/${encodeURIComponent(number.trim())}`);
  };
  return <form onSubmit={submit} className="flex w-full max-w-[440px] gap-2" dir="rtl">
    <label className="sr-only" htmlFor="certificate-number">رقم الشهادة</label>
    <input id="certificate-number" value={number} onChange={(event) => setNumber(event.target.value)} placeholder="أدخل رقم الشهادة" className={`min-w-0 flex-1 rounded-full border px-5 py-3 text-sm outline-none transition focus:ring-2 ${dark ? 'border-white/20 bg-white/10 text-white placeholder:text-[#afc0b6] focus:ring-[#d8b672]' : 'border-[#d9d5c8] bg-[#fffdf8] text-[#29453d] focus:ring-[#c49a56]'}`} data-testid="input-certificate-number" />
    <button type="submit" disabled={!number.trim()} className="shrink-0 rounded-full bg-[#d8b672] px-5 py-3 text-sm font-bold text-[#183c35] disabled:opacity-50" data-testid="button-verify-certificate">تحقق <ArrowLeft size={15} className="mr-1 inline" /></button>
  </form>;
}

function Catalog() {
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState('');
  const params = useMemo(() => ({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(format ? { format: format as 'inPerson' | 'online' | 'hybrid' } : {}),
  }), [search, format]);
  const { data: courses, isLoading, isError, refetch } = useListCourses(params);
  return <div className="min-h-[100dvh] bg-[#f7f4ea]">
    <Header compact />
    <main className="mx-auto max-w-[1240px] px-5 pb-20 pt-10 md:pt-16">
      <div className="max-w-[700px]"><span className="text-xs font-bold tracking-[.14em] text-[#a17d43]">دليل البرامج التدريبية</span><h1 className="rukn-display mt-3 text-4xl font-semibold text-[#193d36] md:text-5xl">تعلّم ما يفتح لك باباً.</h1><p className="mt-4 text-sm leading-7 text-[#697970]">ابحث عن برنامج يناسب وقتك ومسارك، واطّلع على تفاصيله قبل اتخاذ خطوتك التالية.</p></div>
      <div className="mt-9 flex flex-col gap-3 rounded-[1.5rem] border border-[#e0dccf] bg-[#fbf9f2] p-3 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3 px-3"><Search size={19} className="shrink-0 text-[#829087]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ابحث عن مهارة أو مجال..." className="w-full bg-transparent py-3 text-sm text-[#29453d] outline-none placeholder:text-[#929a8e]" data-testid="input-course-search" /></div>
        <label className="sr-only" htmlFor="format-filter">نمط التدريب</label>
        <div className="relative md:w-[220px]"><select id="format-filter" value={format} onChange={(event) => setFormat(event.target.value)} className="w-full appearance-none rounded-xl border border-[#e1ddd1] bg-[#f5f2e9] px-4 py-3 text-sm text-[#3d584e] outline-none focus:ring-2 focus:ring-[#c49a56]" data-testid="select-course-format"><option value="">كل أنماط التدريب</option><option value="inPerson">حضوري</option><option value="online">عن بُعد</option><option value="hybrid">مدمج</option></select><ChevronDown size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#758078]" /></div>
      </div>
      <div className="mt-8 flex items-center justify-between border-b border-[#dedacd] pb-4"><p className="text-sm font-bold text-[#29453d]">{isLoading ? 'جارٍ استكشاف البرامج…' : `${courses?.length ?? 0} برنامج متاح`}</p><span className="text-xs text-[#7b877f]">مواعيد ومقاعد بحسب البرنامج</span></div>
      <div className="mt-6">{isLoading ? <CourseSkeletons /> : isError ? <ErrorState onRetry={() => refetch()} /> : courses?.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{courses.map((course) => <CourseCard key={course.id} course={course} />)}</div> : <div className="rounded-[1.7rem] border border-dashed border-[#d0cbbb] bg-[#f1eee4] px-6 py-16 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e3e0d3] text-[#567267]"><Search size={22} /></div><h2 className="mt-4 font-bold text-[#29453d]">ما لقينا برنامجاً بهذا الوصف</h2><p className="mt-2 text-sm text-[#78847c]">جرّب كلمة أبسط أو غيّر نمط التدريب.</p><button type="button" onClick={() => { setSearch(''); setFormat(''); }} className="mt-5 rounded-full border border-[#c9c6b8] px-5 py-2.5 text-sm font-semibold text-[#31584d]" data-testid="button-clear-filters">عرض كل البرامج</button></div>}</div>
    </main>
    <Footer />
  </div>;
}

function CourseDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: course, isLoading, isError, refetch } = useGetCourse(id);
  const enroll = useEnrollInCourse();
  const cache = useQueryClient();
  const [message, setMessage] = useState('');
  const onEnroll = () => enroll.mutate({ id }, {
    onSuccess: async () => {
      setMessage('تم تسجيل طلبك بنجاح. ستجد البرنامج في مساحتك الشخصية.');
      await Promise.all([
        cache.invalidateQueries({ queryKey: getListMyEnrollmentsQueryKey() }),
        cache.invalidateQueries({ queryKey: getGetMyPortalQueryKey() }),
      ]);
    },
    onError: () => setMessage('لم نتمكن من إتمام التسجيل. سجّل الدخول أولاً أو حاول مجدداً.'),
  });
  if (isLoading) return <><Header compact /><div className="mx-auto max-w-[1200px] px-5 py-16"><CourseSkeletons /></div></>;
  if (isError || !course) return <><Header compact /><main className="mx-auto max-w-[900px] px-5 py-20"><ErrorState onRetry={() => refetch()} /></main></>;
  return <div className="min-h-[100dvh] bg-[#f7f4ea]"><Header compact />
    <main className="mx-auto max-w-[1160px] px-5 pb-20 pt-8">
      <Link href="/courses" className="inline-flex items-center gap-2 text-sm font-semibold text-[#687970] hover:text-[#214c43]" data-testid="link-back-catalog"><ArrowLeft size={16} /> العودة إلى البرامج</Link>
      <div className="mt-7 grid gap-8 lg:grid-cols-[1fr_360px]">
        <section className="overflow-hidden rounded-[2rem] border border-[#dedacd] bg-[#fbf9f2]">
          <div className="relative flex min-h-[260px] items-end overflow-hidden bg-[#254f45] p-7 md:min-h-[330px] md:p-10">
            {course.imageUrl && <img src={course.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #f2dfb4 1px, transparent 1.4px)', backgroundSize: '24px 24px' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#16382f]/80 to-transparent" />
            <div className="relative"><span className="rounded-full bg-[#f0e4c8] px-3 py-1.5 text-xs font-bold text-[#645333]">{course.category}</span><h1 className="rukn-display mt-5 max-w-3xl text-3xl font-semibold leading-[1.45] text-[#fffdf7] md:text-5xl">{course.title}</h1><p className="mt-3 max-w-2xl leading-7 text-[#dbe2d9]">{course.summary}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3 border-b border-[#e8e4d9] p-5 sm:grid-cols-4">
            {[[Clock3, `${course.durationHours} ساعة`, 'المدة'], [MapPin, formatFormat(course.format), 'نمط التدريب'], [Layers3, formatLevel(course.level), 'المستوى'], [Users, `${course.studentsCount} متدرب`, 'انضموا للبرنامج']].map(([Icon, value, label], i) => {
              const Glyph = Icon as typeof Clock3;
              return <div key={String(label)} className="rounded-2xl bg-[#f2efe5] px-3 py-4 text-center"><Glyph className="mx-auto text-[#789085]" size={18} /><p className="mt-2 text-sm font-bold text-[#29453d]">{String(value)}</p><p className="mt-1 text-[10px] text-[#818c82]">{String(label)}</p></div>;
            })}
          </div>
          <div className="p-6 md:p-9"><h2 className="rukn-display text-2xl font-semibold text-[#193d36]">عن البرنامج</h2><p className="mt-4 whitespace-pre-line text-sm leading-8 text-[#596c63]">{course.description}</p><div className="mt-8 grid gap-4 border-t border-[#e7e3d8] pt-6 sm:grid-cols-2"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e1e6dc] text-[#31584d]"><GraduationCap size={19} /></span><div><p className="text-xs text-[#7c887e]">يقدمه</p><p className="mt-1 text-sm font-bold text-[#29453d]">{course.instructorName}</p></div></div><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ece4d2] text-[#8b6d3a]"><CalendarDays size={19} /></span><div><p className="text-xs text-[#7c887e]">موعد البدء</p><p className="mt-1 text-sm font-bold text-[#29453d]">{formatDate(course.startDate)}</p></div></div></div>{course.tvtcApprovalNumber && <p className="mt-6 flex items-center gap-2 rounded-xl border border-[#dfe5d9] bg-[#f2f5ee] px-4 py-3 text-xs text-[#4e6a5d]"><ShieldCheck size={16} /> رقم اعتماد البرنامج: <b dir="ltr">{course.tvtcApprovalNumber}</b></p>}</div>
        </section>
        <aside className="h-fit rounded-[1.7rem] border border-[#dedacd] bg-[#fbf9f2] p-6 lg:sticky lg:top-6">
          <p className="text-xs font-semibold text-[#79867e]">الاستثمار في مهاراتك</p><p className="rukn-display mt-2 text-3xl font-semibold text-[#214c43]">{formatPrice(course.price)}</p>
          <div className="mt-5 space-y-3 border-y border-[#e6e2d7] py-5 text-sm text-[#68776f]"><p className="flex justify-between"><span>المقاعد المتاحة</span><b className="text-[#29453d]">{course.seats}</b></p><p className="flex justify-between"><span>موعد البدء</span><b className="text-[#29453d]">{formatDate(course.startDate)}</b></p><p className="flex justify-between"><span>المدرب</span><b className="max-w-[150px] text-left text-[#29453d]">{course.instructorName}</b></p></div>
          {message && <p role="status" className={`mt-4 rounded-xl p-3 text-xs leading-6 ${message.startsWith('تم') ? 'bg-[#e8f1e7] text-[#315d48]' : 'bg-[#fff0eb] text-[#87463c]'}`}>{message}</p>}
          {course.price > 0 ? <div className="mt-5 rounded-2xl border border-[#e5cfaa] bg-[#f7f0df] p-4" role="status" data-testid="status-payment-unavailable"><p className="flex items-center gap-2 text-sm font-bold text-[#70582f]"><LockKeyhole size={16} /> التسجيل المدفوع غير متاح حالياً</p><p className="mt-2 text-xs leading-6 text-[#7c6b4c]">لم يتم ربط مزوّد دفع بعد. لا يمكن إتمام الدفع أو حجز هذا البرنامج حالياً.</p></div> : <button type="button" onClick={onEnroll} disabled={enroll.isPending || course.seats < 1} className="mt-5 w-full rounded-full bg-[#214c43] px-5 py-4 text-sm font-bold text-white transition hover:bg-[#173a32] disabled:cursor-not-allowed disabled:opacity-60" data-testid="button-enroll-course">{enroll.isPending ? <><LoaderCircle className="ml-2 inline animate-spin" size={16} /> جارٍ التسجيل…</> : 'سجّل في البرنامج مجاناً'}</button>}
          {course.price === 0 && <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] leading-5 text-[#879188]"><LockKeyhole size={12} /> التسجيل مجاني ولا يتطلب دفعاً</p>}
          <div className="mt-6 rounded-2xl bg-[#f1eee4] p-4"><p className="flex items-center gap-2 text-xs font-bold text-[#3d5e51]"><ShieldCheck size={16} /> تعلّم موثّق</p><p className="mt-2 text-xs leading-6 text-[#77837a]">تظهر الشهادات ورقم التحقق في مساحتك بعد إكمال المتطلبات.</p></div>
        </aside>
      </div>
    </main><Footer /></div>;
}

function SignedOutRedirect() {
  return <Show when="signed-in"><Redirect to="/portal" /></Show>;
}

function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/sign-in" /></Show></>;
}

function HomeRedirect() {
  return <><Show when="signed-in"><PortalRoleRedirect /></Show><Show when="signed-out"><Home /></Show></>;
}
function PortalRoleRedirect() {
  const { data, isLoading } = useGetMyPortal();
  if (isLoading) return <div className="min-h-[100dvh] bg-[#f7f4ea]" />;
  return <Redirect to={data?.role === 'company' ? '/portal/company' : '/portal'} />;
}

function Portal() {
  const { data: overview, isLoading, isError, refetch } = useGetMyPortal();
  const { data: enrollments, isLoading: loadingEnrollments } = useListMyEnrollments();
  const { data: certificates, isLoading: loadingCertificates } = useListMyCertificates();
  const [tab, setTab] = useState<'learning' | 'certificates' | 'manage'>('learning');
  if (isLoading) return <PortalSkeleton />;
  if (isError || !overview) return <PortalError onRetry={() => refetch()} />;
  if (overview.role === 'company') return <Redirect to="/portal/company" />;
  const isAdmin = overview.role === 'admin';
  const isTrainer = overview.role === 'trainer';
  return <div className="min-h-[100dvh] bg-[#f4f1e7]">
    <PortalHeader userName={overview.userName} role={roleName(overview.role)} />
    <main className="mx-auto max-w-[1240px] px-5 pb-20 pt-8 md:pt-12">
      <div className="relative overflow-hidden rounded-[2rem] bg-[#21483f] p-7 text-[#f8f5e9] md:p-10">
        <div className="absolute -left-12 -top-20 h-72 w-72 rounded-full border border-[#e2c37f]/25" /><div className="absolute -left-4 -top-12 h-56 w-56 rounded-full border border-[#e2c37f]/25" />
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><span className="text-xs font-semibold text-[#d8b672]">{isAdmin ? 'مساحة إدارة رُكن' : isTrainer ? 'مساحة المدرب' : 'مساحتك التعليمية'}</span><h1 className="rukn-display mt-3 text-3xl font-semibold md:text-4xl">أهلاً، {overview.userName}</h1><p className="mt-3 max-w-xl text-sm leading-7 text-[#c9d5cb]">{isAdmin ? 'تابع البرامج التدريبية وبياناتها من مكان واحد.' : isTrainer ? 'تابع أثر برامجك وكن قريباً من رحلة المتدربين.' : 'هنا تجد برامجك، تقدمك، والشهادات التي أنجزتها.'}</p></div><Link href="/courses" className="inline-flex items-center justify-center rounded-full bg-[#d8b672] px-6 py-3 text-sm font-bold text-[#193d36]" data-testid="link-portal-catalog">اكتشف برنامجاً جديداً <ArrowLeft className="mr-2" size={16} /></Link></div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [BookOpen, 'البرامج النشطة', overview.activeCourses, 'bg-[#e1e9df]', 'text-[#3a6254]'],
          [BadgeCheck, 'برامج مكتملة', overview.completedCourses, 'bg-[#eee5d2]', 'text-[#8a6b3a]'],
          [Award, 'شهاداتك', overview.certificates, 'bg-[#e8e2d8]', 'text-[#7a6045]'],
          [Clock3, 'ساعات تعلم', overview.hoursLearned, 'bg-[#dfe8e8]', 'text-[#4d7372]'],
        ].map(([Icon, title, value, bg, fg]) => {
          const Glyph = Icon as typeof BookOpen;
          return <div key={String(title)} className="rounded-2xl border border-[#e0dccf] bg-[#fbf9f2] p-4 md:p-5"><div className="flex items-center justify-between"><span className={`grid h-10 w-10 place-items-center rounded-xl ${String(bg)} ${String(fg)}`}><Glyph size={19} /></span><span className="text-[10px] text-[#8a948b]">ملخص رحلتك</span></div><p className="mt-4 text-2xl font-bold text-[#29453d]">{String(value)}</p><p className="mt-1 text-xs text-[#79867e]">{String(title)}</p></div>;
        })}
      </div>
      <div className="mt-9 flex flex-wrap items-center justify-between gap-4"><div><h2 className="rukn-display text-2xl font-semibold text-[#193d36]">{isAdmin ? 'مساحة البرامج' : isTrainer ? 'برامجك التدريبية' : 'رحلتك التعليمية'}</h2><p className="mt-2 text-sm text-[#79867e]">{isAdmin ? 'راجع بيانات البرامج وأدِر قائمة الدورات.' : 'كل برنامج تبدأه يقربك من هدفك.'}</p></div>
        <div className="flex rounded-full border border-[#d8d4c7] bg-[#eeebdf] p-1">
          <button type="button" onClick={() => setTab('learning')} className={`rounded-full px-4 py-2 text-xs font-bold ${tab === 'learning' ? 'bg-[#fbf9f2] text-[#294d42] shadow-sm' : 'text-[#758178]'}`} data-testid="tab-my-learning">التعلّم</button>
          <button type="button" onClick={() => setTab('certificates')} className={`rounded-full px-4 py-2 text-xs font-bold ${tab === 'certificates' ? 'bg-[#fbf9f2] text-[#294d42] shadow-sm' : 'text-[#758178]'}`} data-testid="tab-certificates">الشهادات</button>
          {(isAdmin || isTrainer) && <button type="button" onClick={() => setTab('manage')} className={`rounded-full px-4 py-2 text-xs font-bold ${tab === 'manage' ? 'bg-[#fbf9f2] text-[#294d42] shadow-sm' : 'text-[#758178]'}`} data-testid="tab-manage">إدارة البرامج</button>}
        </div>
      </div>
      <div className="mt-5">{tab === 'learning' ? <EnrollmentList enrollments={enrollments} isLoading={loadingEnrollments} canUpdateProgress={!isAdmin && !isTrainer} /> : tab === 'certificates' ? <CertificateList certificates={certificates} isLoading={loadingCertificates} /> : <ManagementArea />}</div>
    </main>
  </div>;
}

function roleName(role: string) {
  return ({ admin: 'مدير', trainer: 'مدرب', trainee: 'متدرب', company: 'منشأة' } as Record<string, string>)[role] || 'متدرب';
}
function PortalHeader({ userName, role }: { userName: string; role: string }) {
  const { signOut } = useClerk();
  return <header className="border-b border-[#dedacd] bg-[#f8f5ed]"><div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-5"><Brand /><div className="flex items-center gap-3"><Link href="/courses" className="hidden text-sm font-semibold text-[#557066] hover:text-[#214c43] sm:block" data-testid="link-portal-courses">الدورات</Link><Link href="/portal/company" className="hidden text-sm font-semibold text-[#557066] hover:text-[#214c43] sm:block" data-testid="link-company-view">مساحة المنشأة</Link><div className="flex items-center gap-2 border-r border-[#dedacd] pr-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#dfe7dc] text-xs font-bold text-[#31584d]">{userName.slice(0, 1)}</span><span className="hidden text-xs leading-5 sm:block"><b className="block text-[#29453d]">{userName}</b><span className="text-[#819087]">{role}</span></span></div><button type="button" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="grid h-9 w-9 place-items-center rounded-full border border-[#dedacd] text-[#688075] hover:bg-[#eeeade]" aria-label="تسجيل الخروج" data-testid="button-sign-out"><LogOut size={16} /></button></div></div></header>;
}

function EnrollmentList({ enrollments, isLoading, canUpdateProgress }: { enrollments?: { id: string; courseId: string; courseTitle: string; status: string; progressPercentage: number; durationHours: number; instructorName: string; nextSession?: string | null }[]; isLoading: boolean; canUpdateProgress: boolean }) {
  const cache = useQueryClient();
  const updateProgress = useUpdateMyEnrollmentProgress();
  const [actionMessage, setActionMessage] = useState<{ enrollmentId: string; text: string; error?: boolean } | null>(null);
  const saveProgress = (enrollment: NonNullable<typeof enrollments>[number], value: number) => {
    updateProgress.mutate({ id: enrollment.id, data: { progressPercentage: value } }, {
      onSuccess: async (updated) => {
        setActionMessage({ enrollmentId: enrollment.id, text: updated.progressPercentage >= 100 ? 'حُفظ تقدمك بالكامل. شهادتك بانتظار مراجعة المدرب.' : 'تم حفظ تقدمك.' });
        await Promise.all([
          cache.invalidateQueries({ queryKey: getListMyEnrollmentsQueryKey() }),
          cache.invalidateQueries({ queryKey: getGetMyPortalQueryKey() }),
        ]);
      },
      onError: () => setActionMessage({ enrollmentId: enrollment.id, text: 'تعذر حفظ التقدم. حاول مرة أخرى.', error: true }),
    });
  };
  if (isLoading) return <CourseSkeletons />;
  if (!enrollments?.length) return <EmptyState icon={<BookOpen size={22} />} title="بدايتك هنا" description="لم تسجل في أي برنامج بعد. اختر دورة تناسب خطوتك المهنية." action={<Link href="/courses" className="rounded-full bg-[#214c43] px-5 py-2.5 text-sm font-bold text-white" data-testid="link-empty-courses">استكشف الدورات</Link>} />;
  return <div className="grid gap-4">{enrollments.map((item) => {
    const complete = item.progressPercentage >= 100 || item.status === 'completed';
    const currentMessage = actionMessage?.enrollmentId === item.id ? actionMessage : null;
    return <div key={item.id} className="grid gap-5 rounded-[1.5rem] border border-[#e0dccf] bg-[#fbf9f2] p-5 md:grid-cols-[1fr_260px] md:items-center md:p-6" data-testid={`row-enrollment-${item.id}`}>
      <div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${complete ? 'bg-[#e8efdf] text-[#496a46]' : item.status === 'cancelled' ? 'bg-[#f5e7e1] text-[#8d5044]' : 'bg-[#efe7d2] text-[#80653a]'}`}>{complete ? 'مكتمل' : item.status === 'cancelled' ? 'ملغي' : 'قيد التعلّم'}</span><span className="text-xs text-[#869087]">{item.durationHours} ساعة تدريبية</span></div>
        <h3 className="rukn-display mt-3 text-xl font-semibold text-[#29453d]">{item.courseTitle}</h3><p className="mt-2 text-xs text-[#78847c]">المدرب: {item.instructorName}</p>{item.nextSession && <p className="mt-2 flex items-center gap-1.5 text-xs text-[#a17d43]"><CalendarDays size={14} /> اللقاء التالي: {formatDate(item.nextSession)}</p>}
        <Link href={`/courses/${item.courseId}`} className="mt-4 inline-flex text-xs font-bold text-[#31584d] hover:text-[#a17d43]" data-testid={`link-resume-course-${item.id}`}>{complete ? 'عرض تفاصيل البرنامج' : 'متابعة البرنامج'} <ArrowLeft size={14} className="mr-1" /></Link>
      </div>
      <div><div className="mb-2 flex justify-between text-xs"><span className="text-[#748078]">تقدمك</span><b className="text-[#31584d]">{item.progressPercentage}%</b></div>
        <div className="h-2 overflow-hidden rounded-full bg-[#e5e2d7]" role="progressbar" aria-valuenow={item.progressPercentage} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-[#739477] transition-all" style={{ width: `${Math.max(0, Math.min(item.progressPercentage, 100))}%` }} /></div>
        {canUpdateProgress && item.status !== 'cancelled' && <div className="mt-4 flex flex-wrap gap-2">
          {!complete && <><button type="button" onClick={() => saveProgress(item, Math.min(100, item.progressPercentage + 10))} disabled={updateProgress.isPending} className="rounded-full border border-[#cbd6c8] px-3 py-2 text-[11px] font-bold text-[#42664e] disabled:opacity-50" data-testid={`button-progress-increment-${item.id}`}>حفظ تقدم +١٠٪</button><button type="button" onClick={() => saveProgress(item, 100)} disabled={updateProgress.isPending} className="rounded-full bg-[#214c43] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50" data-testid={`button-progress-complete-${item.id}`}>إكمال البرنامج</button></>}
        </div>}
        {currentMessage && <p role="status" className={`mt-3 text-[11px] leading-5 ${currentMessage.error ? 'text-[#985244]' : 'text-[#52735a]'}`}>{currentMessage.text}</p>}
      </div>
    </div>;
  })}</div>;
}

function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="rounded-[1.7rem] border border-dashed border-[#d2cebf] bg-[#f0ede3] px-6 py-12 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e1e6dc] text-[#537367]">{icon}</span><h3 className="mt-4 font-bold text-[#29453d]">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#78847c]">{description}</p>{action && <div className="mt-5">{action}</div>}</div>;
}

function CertificateList({ certificates, isLoading }: { certificates?: { id: string; certificateNumber: string; courseTitle: string; traineeName: string; durationHours: number; tvtcApprovalNumber?: string | null; issuedAt: string; verificationUrl: string }[]; isLoading: boolean }) {
  if (isLoading) return <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((x) => <div key={x} className="h-48 animate-pulse rounded-3xl bg-[#e8e4d9]" />)}</div>;
  if (!certificates?.length) return <EmptyState icon={<Award size={22} />} title="إنجازك القادم ينتظرك" description="ستجد شهاداتك هنا بعد إتمام البرامج التدريبية." action={<Link href="/courses" className="rounded-full bg-[#214c43] px-5 py-2.5 text-sm font-bold text-white" data-testid="link-cert-empty-courses">استكشف الدورات</Link>} />;
  return <div className="grid gap-4 md:grid-cols-2">{certificates.map((certificate) => <article key={certificate.id} className="relative overflow-hidden rounded-[1.6rem] border border-[#d9d4c5] bg-[#fbf9f2] p-6" data-testid={`card-certificate-${certificate.id}`}><div className="absolute -left-8 -top-8 h-32 w-32 rounded-full border border-[#d5bd8d]/40" /><div className="relative flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eee5d2] text-[#8c6b34]"><Award size={22} /></span><span className="flex items-center gap-1.5 rounded-full bg-[#e8f0e6] px-3 py-1 text-[10px] font-bold text-[#4d7052]"><BadgeCheck size={13} /> موثّقة</span></div><h3 className="rukn-display mt-5 text-xl font-semibold text-[#29453d]">{certificate.courseTitle}</h3><p className="mt-2 text-xs text-[#78847c]">{certificate.durationHours} ساعة · أُصدرت {formatDate(certificate.issuedAt)}</p><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e6e2d7] pt-4"><code dir="ltr" className="rounded-lg bg-[#f0ede3] px-3 py-2 text-xs text-[#52675c]">{certificate.certificateNumber}</code><Link href={`/certificates/verify/${encodeURIComponent(certificate.certificateNumber)}`} className="text-xs font-bold text-[#31584d]" data-testid={`link-verify-cert-${certificate.id}`}>تحقق من الشهادة <ArrowLeft size={13} className="mr-1 inline" /></Link></div></article>)}</div>;
}

function ManagementArea() {
  return <div className="space-y-6">
    <CertificateReview />
    <CourseManagement />
  </div>;
}

function CertificateReview() {
  const { data: enrollments, isLoading, isError, refetch } = useListManagedEnrollments();
  const issueCertificate = useIssueCertificate();
  const cache = useQueryClient();
  const [message, setMessage] = useState<{ id: string; text: string; error?: boolean } | null>(null);

  const issue = (enrollment: ManagedEnrollment) => {
    issueCertificate.mutate({ data: { enrollmentId: enrollment.id } }, {
      onSuccess: async () => {
        setMessage({ id: enrollment.id, text: `تم إصدار شهادة ${enrollment.traineeName} بنجاح.` });
        await Promise.all([
          cache.invalidateQueries({ queryKey: getListManagedEnrollmentsQueryKey() }),
          cache.invalidateQueries({ queryKey: getListMyCertificatesQueryKey() }),
          cache.invalidateQueries({ queryKey: getGetMyPortalQueryKey() }),
          cache.invalidateQueries({ queryKey: getGetCompanyPortalQueryKey() }),
        ]);
      },
      onError: () => setMessage({ id: enrollment.id, text: 'تعذر إصدار الشهادة. راجع حالة البرنامج ثم حاول مرة أخرى.', error: true }),
    });
  };

  return <section className="rounded-[1.6rem] border border-[#e0dccf] bg-[#fbf9f2] p-5 md:p-7">
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e8e4d9] pb-5">
      <div><span className="text-[11px] font-bold tracking-[.1em] text-[#a17d43]">مراجعة الإنجاز</span><h3 className="rukn-display mt-2 text-2xl font-semibold text-[#193d36]">الشهادات بانتظار الاعتماد</h3><p className="mt-2 text-xs leading-6 text-[#7c887e]">راجع البرامج المكتملة وأصدر الشهادات للمتدربين المستوفين.</p></div>
      <span className="rounded-full bg-[#efe7d2] px-3 py-1.5 text-[11px] font-bold text-[#80653a]">{enrollments?.filter((item) => item.status === 'completed' && !item.hasCertificate).length ?? 0} بانتظار المراجعة</span>
    </div>
    {message && <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-xs ${message.error ? 'bg-[#fff1ed] text-[#8a4b40]' : 'bg-[#eaf0e7] text-[#46644f]'}`}>{message.text}</p>}
    {isLoading ? <div className="mt-5 space-y-3" aria-label="جارٍ تحميل طلبات الشهادات">{[0, 1, 2].map((item) => <div key={item} className="h-[78px] animate-pulse rounded-2xl bg-[#efede3]" />)}</div>
      : isError ? <div className="mt-5"><ErrorState onRetry={() => refetch()} /></div>
      : !enrollments?.length ? <div className="py-8"><EmptyState icon={<Award size={22} />} title="لا توجد تسجيلات للمراجعة" description="عند اكتمال أحد البرامج، ستظهر بيانات المتدرب هنا." /></div>
      : <div className="mt-2 divide-y divide-[#e8e4d9]">
        {enrollments.map((enrollment) => {
          const completeWithoutCertificate = enrollment.status === 'completed' && !enrollment.hasCertificate;
          const completed = enrollment.status === 'completed';
          const localMessage = message?.id === enrollment.id ? message : null;
          return <article key={enrollment.id} className="grid gap-4 py-5 md:grid-cols-[1fr_auto] md:items-center" data-testid={`row-managed-enrollment-${enrollment.id}`}>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${completed ? 'bg-[#e8efdf] text-[#496a46]' : enrollment.status === 'cancelled' ? 'bg-[#f5e7e1] text-[#8d5044]' : 'bg-[#efe7d2] text-[#80653a]'}`}>{completed ? 'مكتمل' : enrollment.status === 'cancelled' ? 'ملغي' : 'قيد التعلّم'}</span><span className="text-[11px] text-[#839087]">{enrollment.progressPercentage}% تقدم</span></div>
              <h4 className="mt-2 truncate font-bold text-[#29453d]">{enrollment.courseTitle}</h4>
              <p className="mt-1 text-xs text-[#78847c]">{enrollment.traineeName} · المدرب: {enrollment.instructorName} · {enrollment.durationHours} ساعة</p>
              <div className="mt-3 h-1.5 max-w-[320px] overflow-hidden rounded-full bg-[#e5e2d7]"><div className="h-full rounded-full bg-[#739477]" style={{ width: `${Math.max(0, Math.min(enrollment.progressPercentage, 100))}%` }} /></div>
              {localMessage && <p role="status" className={`mt-2 text-[11px] ${localMessage.error ? 'text-[#985244]' : 'text-[#52735a]'}`}>{localMessage.text}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {enrollment.hasCertificate
                ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f0e6] px-3 py-2 text-[11px] font-bold text-[#4d7052]"><BadgeCheck size={14} /> صادرة</span>
                : completeWithoutCertificate
                  ? <button type="button" onClick={() => issue(enrollment)} disabled={issueCertificate.isPending} className="rounded-full bg-[#214c43] px-4 py-2.5 text-[11px] font-bold text-white disabled:cursor-wait disabled:opacity-50" data-testid={`button-review-issue-certificate-${enrollment.id}`}>{issueCertificate.isPending ? 'جارٍ إصدار الشهادة…' : 'إصدار الشهادة'}</button>
                  : <span className="text-[11px] text-[#8b9388]">بانتظار إكمال البرنامج</span>}
            </div>
          </article>;
        })}
      </div>}
  </section>;
}

function CourseManagement() {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState('');
  const { data: courses, isLoading, isError, refetch } = useListCourses();
  const create = useCreateCourse();
  const update = useUpdateCourse();
  const remove = useDeleteCourse();
  const cache = useQueryClient();
  const [notice, setNotice] = useState('');
  const createCourse = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: CourseInput = {
      title, summary, description: summary, category, format: 'online', level: 'beginner',
      price: 0, durationHours: 4, instructorName: 'فريق رُكن', seats: 12,
      startDate: new Date(Date.now() + 14 * 86400000).toISOString(),
    };
    create.mutate({ data: payload }, {
      onSuccess: async () => { setNotice('تمت إضافة البرنامج.'); setTitle(''); setSummary(''); setCategory(''); setShowCreate(false); await cache.invalidateQueries({ queryKey: getListCoursesQueryKey() }); },
      onError: () => setNotice('تعذرت إضافة البرنامج. راجع البيانات وحاول مرة أخرى.'),
    });
  };
  const featureToggle = (course: Course) => {
    const patch: CourseUpdate = { isFeatured: !course.isFeatured };
    update.mutate({ id: course.id, data: patch }, {
      onSuccess: async () => { setNotice('تم تحديث ظهور البرنامج.'); await cache.invalidateQueries({ queryKey: getListCoursesQueryKey() }); await cache.invalidateQueries({ queryKey: getGetCourseQueryKey(course.id) }); },
      onError: () => setNotice('تعذر تحديث البرنامج.'),
    });
  };
  const deleteCourse = (course: Course) => {
    if (!window.confirm(`هل تريد حذف برنامج «${course.title}»؟`)) return;
    remove.mutate({ id: course.id }, { onSuccess: async () => { setNotice('تم حذف البرنامج.'); await cache.invalidateQueries({ queryKey: getListCoursesQueryKey() }); }, onError: () => setNotice('تعذر حذف البرنامج.') });
  };
  return <section className="rounded-[1.6rem] border border-[#e0dccf] bg-[#fbf9f2] p-5 md:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold text-[#29453d]">البرامج التدريبية</h3><p className="mt-1 text-xs text-[#7c887e]">إدارة قائمة البرامج المنشورة.</p></div><button type="button" onClick={() => setShowCreate(!showCreate)} className="rounded-full bg-[#214c43] px-5 py-2.5 text-xs font-bold text-white" data-testid="button-add-course">{showCreate ? 'إغلاق النموذج' : '+ إضافة برنامج'}</button></div>
    {notice && <p role="status" className="mt-4 rounded-xl bg-[#eaf0e7] px-4 py-3 text-xs text-[#46644f]">{notice}</p>}
    {showCreate && <form onSubmit={createCourse} className="mt-5 grid gap-3 rounded-2xl bg-[#f1eee4] p-4 md:grid-cols-2">
      <label className="text-xs font-semibold text-[#52675c]">عنوان البرنامج<input required minLength={3} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d8d4c7] bg-[#fffdf8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#bd9652]" data-testid="input-new-course-title" /></label>
      <label className="text-xs font-semibold text-[#52675c]">التخصص<input required minLength={2} value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d8d4c7] bg-[#fffdf8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#bd9652]" data-testid="input-new-course-category" /></label>
      <label className="text-xs font-semibold text-[#52675c] md:col-span-2">نبذة (10 أحرف على الأقل)<textarea required minLength={10} value={summary} onChange={(event) => setSummary(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d8d4c7] bg-[#fffdf8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#bd9652]" rows={2} data-testid="input-new-course-summary" /></label>
      <button type="submit" disabled={create.isPending} className="rounded-full bg-[#214c43] px-5 py-3 text-sm font-bold text-white disabled:opacity-50 md:col-span-2" data-testid="button-save-course">{create.isPending ? 'جارٍ الحفظ…' : 'حفظ البرنامج'}</button>
    </form>}
    {isLoading ? <div className="mt-5"><CourseSkeletons /></div> : isError ? <div className="mt-5"><ErrorState onRetry={() => refetch()} /></div> : !courses?.length ? <div className="mt-5"><EmptyState icon={<Layers3 size={22} />} title="لا توجد برامج بعد" description="أضف أول برنامج تدريبي ليظهر في دليل رُكن." /></div> : <div className="mt-5 divide-y divide-[#e7e3d8]">{courses.map((course) => <div key={course.id} className="flex flex-wrap items-center justify-between gap-4 py-4" data-testid={`row-managed-course-${course.id}`}><div><p className="font-bold text-[#29453d]">{course.title}</p><p className="mt-1 text-xs text-[#7b877e]">{course.category} · {course.seats} مقعد · {formatPrice(course.price)}</p></div><div className="flex items-center gap-2"><button type="button" onClick={() => featureToggle(course)} disabled={update.isPending} className={`rounded-full px-3 py-2 text-[11px] font-bold ${course.isFeatured ? 'bg-[#eee5d2] text-[#7d6236]' : 'bg-[#e6ebe3] text-[#486951]'}`} data-testid={`button-feature-course-${course.id}`}>{course.isFeatured ? 'إزالة التمييز' : 'تمييز البرنامج'}</button><button type="button" onClick={() => deleteCourse(course)} disabled={remove.isPending} className="rounded-full bg-[#f5e9e4] px-3 py-2 text-[11px] font-bold text-[#945346]" data-testid={`button-delete-course-${course.id}`}>حذف</button></div></div>)}</div>}
  </section>;
}

function PortalSkeleton() {
  return <div className="min-h-[100dvh] bg-[#f4f1e7]"><div className="h-[72px] animate-pulse bg-[#e7e3d8]" /><div className="mx-auto max-w-[1240px] px-5 py-10"><div className="h-52 animate-pulse rounded-[2rem] bg-[#dce4da]" /><div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((x) => <div key={x} className="h-32 animate-pulse rounded-2xl bg-[#e7e3d8]" />)}</div></div></div>;
}
function PortalError({ onRetry }: { onRetry: () => void }) {
  return <div className="min-h-[100dvh] bg-[#f4f1e7]"><Header compact /><main className="mx-auto max-w-3xl px-5 py-20"><ErrorState onRetry={onRetry} /></main></div>;
}

function CompanyPortal() {
  const { data, isLoading, isError, refetch } = useGetCompanyPortal();
  if (isLoading) return <PortalSkeleton />;
  if (isError || !data) return <PortalError onRetry={() => refetch()} />;
  return <div className="min-h-[100dvh] bg-[#f4f1e7]"><PortalHeader userName={data.companyName} role="منشأة" />
    <main className="mx-auto max-w-[1240px] px-5 pb-20 pt-9">
      <div className="flex flex-wrap items-end justify-between gap-5"><div><span className="text-xs font-bold tracking-[.12em] text-[#a17d43]">مساحة المنشأة</span><h1 className="rukn-display mt-3 text-4xl font-semibold text-[#193d36]">{data.companyName}</h1><p className="mt-3 text-sm text-[#718077]">نظرة واحدة على تعلّم فريقكم وتقدمه.</p></div><Link href="/courses" className="rounded-full bg-[#214c43] px-5 py-3 text-sm font-bold text-white" data-testid="link-company-find-courses">استكشف برامج للموظفين <ArrowLeft className="mr-2 inline" size={15} /></Link></div>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Metric icon={<Users size={20} />} label="عدد الموظفين" value={data.employeeCount} tone="green" />
        <Metric icon={<BookOpen size={20} />} label="تسجيلات نشطة" value={data.activeEnrollments} tone="gold" />
        <Metric icon={<BadgeCheck size={20} />} label="معدل الإكمال" value={`${data.completionRate}%`} tone="blue" />
      </div>
      <section className="mt-9 rounded-[1.7rem] border border-[#e0dccf] bg-[#fbf9f2] p-5 md:p-7"><div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#e8e4d9] pb-5"><div><h2 className="rukn-display text-2xl font-semibold text-[#193d36]">تقدم الفريق</h2><p className="mt-2 text-xs text-[#7d887f]">حالة كل تسجيل تدريبي على حدة.</p></div><div className="flex items-center gap-2 text-xs text-[#6c7b70]"><span className="h-2.5 w-2.5 rounded-full bg-[#769477]" /> النسبة المئوية للإتمام</div></div>
        {!data.enrollments.length ? <div className="py-12"><EmptyState icon={<BriefcaseBusiness size={22} />} title="مساحة فريقكم جاهزة" description="لا توجد تسجيلات حالية. اكتشف برامجاً مناسبة لمهارات فريقك." action={<Link href="/courses" className="rounded-full bg-[#214c43] px-5 py-2.5 text-sm font-bold text-white" data-testid="link-company-empty-courses">استكشاف البرامج</Link>} /></div> : <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[600px] text-right"><thead><tr className="border-b border-[#e8e4d9] text-[11px] text-[#7f8a81]"><th className="py-4 font-semibold">الموظف</th><th className="py-4 font-semibold">البرنامج</th><th className="py-4 font-semibold">الحالة</th><th className="py-4 font-semibold">التقدم</th></tr></thead><tbody>{data.enrollments.map((entry, index) => <tr key={`${entry.traineeName}-${entry.courseTitle}-${index}`} className="border-b border-[#eeeadf] last:border-0" data-testid={`row-company-enrollment-${index}`}><td className="py-4 text-sm font-semibold text-[#3a554b]">{entry.traineeName}</td><td className="py-4 text-sm text-[#5f7167]">{entry.courseTitle}</td><td className="py-4"><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${entry.status === 'completed' ? 'bg-[#e7efe2] text-[#4d7052]' : entry.status === 'cancelled' ? 'bg-[#f4e7e1] text-[#925648]' : 'bg-[#f1e8d5] text-[#84683b]'}`}>{entry.status === 'completed' ? 'مكتمل' : entry.status === 'cancelled' ? 'ملغي' : 'نشط'}</span></td><td className="py-4"><div className="flex items-center gap-3"><div className="h-2 w-28 overflow-hidden rounded-full bg-[#e6e3d8]"><div className="h-full rounded-full bg-[#77957a]" style={{ width: `${Math.max(0, Math.min(entry.progressPercentage, 100))}%` }} /></div><span className="text-xs text-[#607269]">{entry.progressPercentage}%</span></div></td></tr>)}</tbody></table></div>}
      </section>
      <p className="mt-5 text-center text-[11px] text-[#8a958b]">تعرض هذه المساحة بيانات التقدم المتاحة حالياً. قد تتأخر بعض التحديثات.</p>
    </main>
  </div>;
}
function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: ReactNode; tone: 'green' | 'gold' | 'blue' }) {
  const tones = { green: 'bg-[#e2e9df] text-[#496d5c]', gold: 'bg-[#efe7d3] text-[#8c703f]', blue: 'bg-[#dfe8e7] text-[#537675]' };
  return <div className="rounded-2xl border border-[#e0dccf] bg-[#fbf9f2] p-5"><span className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}>{icon}</span><p className="mt-4 text-2xl font-bold text-[#29453d]">{value}</p><p className="mt-1 text-xs text-[#7a867e]">{label}</p></div>;
}

function CertificateVerificationPage() {
  const { certificateNumber: rawNumber = '' } = useParams<{ certificateNumber: string }>();
  const certificateNumber = decodeURIComponent(rawNumber);
  const query = useVerifyCertificate(certificateNumber, {
    query: { enabled: !!certificateNumber, queryKey: getVerifyCertificateQueryKey(certificateNumber) },
  });
  return <div className="min-h-[100dvh] bg-[#f7f4ea]"><Header compact /><main className="mx-auto max-w-[840px] px-5 py-12 md:py-20">
    <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#718077]" data-testid="link-verify-home"><ArrowLeft size={15} /> الصفحة الرئيسية</Link>
    <div className="mt-8 overflow-hidden rounded-[2rem] border border-[#dedacd] bg-[#fbf9f2]">
      <div className="relative bg-[#21483f] px-7 py-9 text-[#f7f4ea] md:px-10"><div className="absolute -left-7 -top-14 h-44 w-44 rounded-full border border-[#dec78f]/25" /><div className="relative flex items-start justify-between"><div><span className="text-xs font-semibold text-[#d8b672]">خدمة التحقق</span><h1 className="rukn-display mt-3 text-3xl font-semibold">شهادة موثوقة؟</h1><p className="mt-2 text-sm text-[#c7d4ca]">أدخل رقم الشهادة للتأكد من بياناتها.</p></div><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-[#dfc17d]"><ShieldCheck size={24} /></span></div></div>
      <div className="p-6 md:p-9"><VerifySearch />{query.isLoading && <div className="mt-7 animate-pulse space-y-3 rounded-2xl bg-[#f1eee4] p-5"><div className="h-4 w-1/3 rounded bg-[#e1ddd1]" /><div className="h-4 w-2/3 rounded bg-[#e1ddd1]" /><div className="h-4 w-1/2 rounded bg-[#e1ddd1]" /></div>}
        {query.isError && <div role="alert" className="mt-6 rounded-2xl border border-[#e5c9c0] bg-[#fff1ed] p-5 text-sm text-[#804b40]"><p className="font-bold">تعذر التحقق من الرقم الآن.</p><button type="button" onClick={() => query.refetch()} className="mt-3 underline" data-testid="button-retry-verification">إعادة المحاولة</button></div>}
        {query.data && <VerificationResult result={query.data} />}
        {!query.isLoading && !query.isError && !query.data && <p className="mt-5 text-xs text-[#8a958b]">لن تظهر بيانات إلا بعد إدخال رقم شهادة صالح.</p>}
      </div>
    </div>
  </main><Footer /></div>;
}
function VerificationResult({ result }: { result: { valid: boolean; certificateNumber: string; traineeName: string; courseTitle: string; durationHours: number; tvtcApprovalNumber?: string | null; issuedAt: string } }) {
  return <section className={`mt-6 rounded-2xl border p-5 ${result.valid ? 'border-[#d5e2d1] bg-[#eef4eb]' : 'border-[#e7cdc4] bg-[#fff1ed]'}`} aria-live="polite" data-testid="status-verification-result">
    <div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${result.valid ? 'bg-[#dbe9d6] text-[#4e7053]' : 'bg-[#f3dcd4] text-[#9a5142]'}`}>{result.valid ? <Check size={20} /> : <X size={20} />}</span><div><h2 className={`font-bold ${result.valid ? 'text-[#345b43]' : 'text-[#8f473a]'}`}>{result.valid ? 'تم التحقق من الشهادة' : 'لم يتم العثور على شهادة صالحة'}</h2><p className="mt-1 text-xs text-[#77847b]">رقم الشهادة: <code dir="ltr">{result.certificateNumber}</code></p></div></div>
    {result.valid && <dl className="mt-5 grid gap-4 border-t border-[#d8e2d2] pt-5 sm:grid-cols-2">{[['اسم المتدرب', result.traineeName], ['البرنامج التدريبي', result.courseTitle], ['عدد الساعات', `${result.durationHours} ساعة`], ['تاريخ الإصدار', formatDate(result.issuedAt)], ...(result.tvtcApprovalNumber ? [['رقم الاعتماد', result.tvtcApprovalNumber]] : [])].map(([label, value]) => <div key={label}><dt className="text-[11px] text-[#7a897d]">{label}</dt><dd className="mt-1 text-sm font-semibold text-[#345345]">{value}</dd></div>)}</dl>}
  </section>;
}

function SignInPage() {
  return <div className="grain flex min-h-[100dvh] items-center justify-center bg-[#e9e6d9] px-4 py-10"><div className="absolute right-8 top-8"><Brand /></div><div className="w-full max-w-[440px] rounded-[2rem] border border-[#d9d5c8] bg-[#fbf9f2] p-2 shadow-[0_20px_70px_rgba(31,59,48,.13)]"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></div>;
}
function SignUpPage() {
  return <div className="grain flex min-h-[100dvh] items-center justify-center bg-[#e9e6d9] px-4 py-10"><div className="absolute right-8 top-8"><Brand /></div><div className="w-full max-w-[440px] rounded-[2rem] border border-[#d9d5c8] bg-[#fbf9f2] p-2 shadow-[0_20px_70px_rgba(31,59,48,.13)]"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></div>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const currentId = user?.id ?? null;
      if (previousId.current !== undefined && previousId.current !== currentId) client.clear();
      previousId.current = currentId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkApp() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={appearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      locale: 'ar-SA',
      socialButtonsBlockButton: 'المتابعة باستخدام {{provider}}',
      dividerText: 'أو',
      formFieldLabel__emailAddress: 'البريد الإلكتروني',
      formFieldLabel__password: 'كلمة المرور',
      formFieldLabel__firstName: 'الاسم الأول',
      formFieldLabel__lastName: 'اسم العائلة',
      formFieldInputPlaceholder__emailAddress: 'name@example.com',
      formFieldInputPlaceholder__password: 'أدخل كلمة المرور',
      formFieldInputPlaceholder__firstName: 'الاسم الأول',
      formFieldInputPlaceholder__lastName: 'اسم العائلة',
      formFieldAction__forgotPassword: 'نسيت كلمة المرور؟',
      formFieldAction__showPassword: 'إظهار كلمة المرور',
      formFieldAction__hidePassword: 'إخفاء كلمة المرور',
      formButtonPrimary: 'متابعة',
      formButtonPrimary__verify: 'تحقق',
      backButton: 'رجوع',
      signIn: {
        start: { title: 'مرحباً بعودتك', subtitle: 'سجّل الدخول لمتابعة رحلتك التعليمية' },
        password: { title: 'أدخل كلمة المرور', subtitle: 'أدخل كلمة المرور للمتابعة إلى رُكن' },
      },
      signUp: {
        start: { title: 'أنشئ حسابك في رُكن', subtitle: 'ابدأ رحلة تعلم موثوقة بخطوة واحدة' },
      },
    }}
    routerPush={(to) => setLocation(stripBase(to))}
    routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
  >
    <QueryClientProvider client={queryClient}>
      <TooltipProvider><ClerkQueryClientCacheInvalidator /><RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/courses" component={Catalog} />
          <Route path="/courses/:id" component={CourseDetail} />
          <Route path="/portal"><Protected><Portal /></Protected></Route>
          <Route path="/portal/company"><Protected><CompanyPortal /></Protected></Route>
          <Route path="/certificates/verify/:certificateNumber" component={CertificateVerificationPage} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary><Toaster /></TooltipProvider>
    </QueryClientProvider>
  </ClerkProvider>;
}

function App() {
  return <WouterRouter base={basePath}><ClerkApp /></WouterRouter>;
}

export default App;
