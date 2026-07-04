import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import {
  Scale,
  Bot,
  MessageSquare,
  FileText,
  Calculator,
  ShieldCheck,
  Sparkles,
  Workflow,
  Building2,
  BadgeCheck,
  Zap,
  Lock,
  Globe,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Phone,
  Mail,
  User,
  MessageCircle,
  Briefcase,
  FileSignature,
  Receipt,
  Library,
  Network,
  Crown,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tilt3D } from "@/components/tilt-3d";
import { Luxury3DText } from "@/components/luxury-3d-text";
import { HeroSpotlight } from "@/components/hero-spotlight";
import { ReducedMotionIndicator } from "@/components/reduced-motion-indicator";

// Lazy-load the heaviest below-the-fold module (~414 lines of UI) so the
// initial landing payload stays light. SSR still renders the section via
// streaming Suspense; the client hydrates the chunk on demand.
const FeatureStations = lazy(() =>
  import("@/components/feature-stations").then((m) => ({ default: m.FeatureStations })),
);

const FAQ_ITEMS = [
  {
    q: "كيف يتم تأمين الربط والمزامنة التلقائية مع حسابات ناجز ووكالات وزارة العدل؟",
    a: "نستخدم أداة سحب آمنة عبر extension متصفح بصلاحيات محدودة. لا نخزن بيانات الدخول؛ الجلسة مشفرة محلياً وكل عملية مزامنة مسجّلة في سجل التدقيق.",
  },
  {
    q: "هل يدعم النظام ضريبة القيمة المضافة وفواتير هيئة الزكاة والضريبة؟",
    a: "نعم — نحن متطابقون 100% مع ZATCA Phase 2 (الفوترة الإلكترونية المرحلة الثانية) مع توليد QR وإرسال الفواتير لمنصة فاتورة تلقائياً.",
  },
  {
    q: "كيف تعمل ميزة الإشعار بالواتساب وهل تحتاج لرسائل إضافية مأجورة؟",
    a: "نستخدم WhatsApp Business API الرسمي. حزمة الرسائل مشمولة بالاشتراك، ويمكن ترقيتها حسب حجم الإرسال.",
  },
  {
    q: "هل بياناتي محفوظة داخل المملكة؟",
    a: "نعم — جميع البيانات مستضافة في خوادم سعودية معتمدة من NCA، ولا تغادر المملكة.",
  },
];

const APP_URL = (import.meta.env.VITE_APP_URL as string | undefined) || "https://adala.app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "منصة العدالة — المنظومة القانونية والذكاء القضائي المتكامل" },
      {
        name: "description",
        content:
          "حل تقني متكامل لمكاتب المحاماة بالمملكة: ربط ناجز، صياغة بالذكاء الاصطناعي، فواتير ZATCA، إشعارات واتساب — جرّب مجاناً.",
      },
      { property: "og:title", content: "منصة العدالة — المنظومة القضائية الأقوى بالمملكة" },
      {
        property: "og:description",
        content:
          "ربط مباشر ببوابة ناجز، صياغة لوائح بالذكاء الاصطناعي، فواتير ZATCA، وإشعارات واتساب — أنجز قضاياك بضغطة زر.",
      },
      { property: "og:url", content: `${APP_URL}/` },
    ],
    links: [{ rel: "canonical", href: `${APP_URL}/` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ_ITEMS.map((it) => ({
            "@type": "Question",
            name: it.q,
            acceptedAnswer: { "@type": "Answer", text: it.a },
          })),
        }),
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <Header />
      <Hero />
      <ReducedMotionIndicator />
      <Stats />
      <Features />
      <Suspense fallback={<div className="py-20" aria-hidden />}>
        <FeatureStations />
      </Suspense>
      <AIShowcase />
      <Comparison />
      <Calculator2 />
      <WhatsAppDemo />
      <Security />
      <ClientPortal />
      <EmployeePortal />
      <FAQ />
      <Contact />
      <Footer />
    </div>
  );
}

/* ============ Header ============ */
function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link
          to="/"
          aria-label="منصة العدالة لإدارة مكاتب المحاماة — الصفحة الرئيسية"
          className="brand-title group gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <div
            className="brand-mark grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-gold shadow-md ring-1 ring-gold/30"
            aria-hidden="true"
          >
            <Scale className="h-5 w-5 drop-shadow" />
          </div>
          <div className="font-extrabold text-lg leading-tight tracking-tight" aria-hidden="true">
            <span className="brand-title-text">منصة </span>
            <span className="brand-title-accent" data-text="العدالة">
              العدالة
            </span>
            <span className="brand-title-text"> - لإدارة مكاتب المحاماة</span>
          </div>
        </Link>

        <nav
          aria-label="التنقّل الرئيسي"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground"
        >
          <a
            href="#features"
            className="rounded-md px-1 py-0.5 hover:text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            المميزات
          </a>
          <a
            href="#ai"
            className="rounded-md px-1 py-0.5 hover:text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            الذكاء الاصطناعي
          </a>
          <a
            href="#comparison"
            className="rounded-md px-1 py-0.5 hover:text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            المقارنة
          </a>
          <a
            href="#security"
            className="rounded-md px-1 py-0.5 hover:text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            الأمان
          </a>
          <a
            href="#faq"
            className="rounded-md px-1 py-0.5 hover:text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            الأسئلة الشائعة
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/auth"
            className="hidden sm:inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-accent outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            دخول
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" } as never}
            aria-label="ابدأ تجربة مجانية لمدة 48 ساعة"
            className="btn-gold btn-gold-3d inline-flex items-center gap-1 px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            تجربة لمدة 48 ساعة مجاناً
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ============ Hero ============ */
function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden py-28 lg:py-36 section-premium-1"
    >
      {/* 3D Particle Background */}
      <div className="absolute inset-0 -z-10 pointer-events-none" aria-hidden="true">
        {/* Animated particles */}
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-gold/40 particle-drift"
            style={
              {
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                "--drift-x": `${(Math.random() - 0.5) * 200}px`,
                "--drift-y": `${-200 - Math.random() * 200}px`,
                "--duration": `${8 + Math.random() * 6}s`,
                "--delay": `${Math.random() * 5}s`,
              } as React.CSSProperties
            }
          />
        ))}

        {/* Large glowing orbs */}
        <div className="absolute top-10 right-1/5 h-[500px] w-[500px] rounded-full bg-gold/20 blur-[140px] orb-drift" />
        <div
          className="absolute bottom-0 left-1/5 h-[500px] w-[500px] rounded-full bg-primary/25 blur-[140px] orb-drift"
          style={{ animationDelay: "3s" }}
        />
        <div className="absolute top-1/2 left-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/15 blur-3xl" />
      </div>

      {/* Grid background */}
      <div className="absolute inset-0 -z-10 hero-grid-bg" aria-hidden="true" />
      <HeroSpotlight />

      <div className="container mx-auto grid items-center gap-16 px-4 lg:grid-cols-2">
        <div className="text-center lg:text-right scroll-reveal">
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-gold/50 bg-gradient-to-l from-gold/20 to-transparent px-6 py-2.5 text-sm font-bold text-primary shadow-[0_4px_24px_-4px] shadow-gold/40 backdrop-blur-md gold-glow-animated">
            <Crown className="h-5 w-5 text-gold" aria-hidden="true" />
            المنظومة القضائية والذكاء الاصطناعي الأقوى بالمملكة
          </div>

          <h1
            id="hero-heading"
            className="mt-8 text-5xl sm:text-6xl lg:text-8xl font-black leading-[1.05] lg:leading-[1.02] tracking-tight text-ultra-high-contrast"
            aria-label="منصة العدالة لإدارة مكاتب المحاماة"
          >
            <Luxury3DText intensity={12} className="block">
              <span className="text-3d-royal inline-block">منصة</span>{" "}
              <span className="text-3d-gold inline-block">العدالة</span>
            </Luxury3DText>
            <span
              aria-hidden="true"
              className="mt-4 flex items-center justify-center lg:justify-end gap-3 text-3xl sm:text-4xl lg:text-6xl font-extrabold text-gradient-premium"
            >
              <span
                aria-hidden
                className="hidden sm:inline-block h-px w-12 bg-gradient-to-l from-gold to-transparent"
              />
              لإدارة مكاتب المحاماة
            </span>
          </h1>

          <p className="mt-8 text-xl lg:text-2xl text-high-contrast leading-relaxed font-semibold">
            الحل التقني المتكامل لإدارة مكاتب المحاماة. نربطك مباشرة بـ{" "}
            <strong className="text-primary font-black">بوابة ناجز</strong> لمزامنة الجلسات، ونوفر
            صياغة اللوائح بالذكاء الاصطناعي، فواتير{" "}
            <strong className="text-primary font-black">ZATCA</strong> وإشعارات{" "}
            <strong className="text-primary font-black">واتساب</strong> متكاملة — لتنجز القضايا
            بضغطة زر.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-5 lg:justify-end">
            <Link
              to="/auth"
              search={{ mode: "signup" } as never}
              aria-label="احصل على النسخة التجريبية المجانية لمدة 48 ساعة"
              className="btn-gold btn-gold-3d inline-flex items-center gap-3 px-10 py-5 text-lg shine font-black tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span aria-hidden="true">🔥</span> احصل على النسخة التجريبية المجانية
              <ArrowLeft className="h-6 w-6" aria-hidden="true" />
            </Link>
            <a
              href="#features"
              aria-label="استكشف مميزات المنصة"
              className="btn-outline-3d px-8 py-5 text-lg outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              استكشف المميزات
            </a>
          </div>
          <p className="mt-6 text-base font-bold text-medium-contrast">
            بدون التزام بنكي · شاشات تفاعلية كاملة · جميع المميزات
          </p>
        </div>

        {/* Right column: interactive 3D card */}
        <div className="relative scroll-reveal" style={{ animationDelay: "0.2s" }}>
          <Tilt3D max={18} className="rounded-3xl">
            <div className="card-glass-3d relative p-2 rounded-3xl">
              <div className="rounded-[1.5rem] bg-gradient-to-br from-primary via-primary to-[oklch(0.32_0.1_270)] p-8 text-primary-foreground relative overflow-hidden">
                {/* Inner glow */}
                <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-gold/40 blur-3xl" />

                <div className="relative flex items-center justify-between border-b border-white/20 pb-5 pop-z">
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-gold/25 ring-2 ring-gold/50 icon-3d-hover">
                      <Bot className="h-6 w-6 text-gold" />
                    </div>
                    <span className="text-lg font-black">مساعد العدالة الذكي</span>
                  </div>
                  <span className="text-xs font-black rounded-full bg-success/30 px-4 py-1.5 text-success ring-2 ring-success/50">
                    ● مفعّل
                  </span>
                </div>

                <div className="relative mt-6 space-y-4 text-base pop-z">
                  <div className="rounded-xl bg-white/10 p-5 ring-1 ring-white/15 shadow-inner backdrop-blur-sm">
                    <div className="text-gold text-sm font-black mb-2">🧑‍⚖️ المستخدم</div>
                    <p className="leading-relaxed text-white/95 font-semibold">
                      صغ لي لائحة اعتراضية على حكم في نزاع توريد تجاري...
                    </p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-bl from-gold/25 to-gold/15 p-5 border-2 border-gold/50 shadow-[0_8px_32px_-8px] shadow-gold/50 backdrop-blur-sm">
                    <div className="text-gold text-sm font-black mb-2">🤖 الذكاء الاصطناعي</div>
                    <p className="leading-relaxed text-white/95 font-semibold">
                      ✓ تم تشخيص الحكم ومطابقته بمواد نظام المحاكم التجارية السعودي.
                    </p>
                    <p className="mt-3 leading-relaxed text-white/95 font-semibold">
                      🚀 <strong className="text-gold font-black">الدفع المقترح:</strong> عدم مطابقة
                      الخدمة للمادة السابعة من العقد.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-white/90 font-bold">
                    <Sparkles className="h-4 w-4 text-gold animate-pulse" />
                    جاري الصياغة الكاملة...
                  </div>
                </div>
              </div>
            </div>
          </Tilt3D>

          {/* Floating badges with their own tilt */}
          <div
            className="absolute -bottom-6 -left-6 hidden md:block scroll-reveal"
            style={{ animationDelay: "0.4s" }}
          >
            <Tilt3D max={25}>
              <div className="card-glass-3d p-4 bg-card flex items-center gap-3 rounded-2xl">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-success/20 ring-2 ring-success/40 icon-3d-hover">
                  <BadgeCheck className="h-6 w-6 text-success" />
                </div>
                <div>
                  <div className="text-sm font-black text-foreground">معتمد ZATCA</div>
                  <div className="text-xs text-medium-contrast font-bold">Phase 2</div>
                </div>
              </div>
            </Tilt3D>
          </div>

          <div
            className="absolute -top-6 -right-6 hidden md:block scroll-reveal"
            style={{ animationDelay: "0.6s" }}
          >
            <Tilt3D max={25}>
              <div className="card-glass-3d p-4 bg-card flex items-center gap-3 rounded-2xl">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-gold/20 ring-2 ring-gold/50 icon-3d-hover">
                  <Sparkles className="h-6 w-6 text-gold" />
                </div>
                <div>
                  <div className="text-sm font-black text-foreground">ذكاء سعودي</div>
                  <div className="text-xs text-medium-contrast font-bold">GPT-Legal AR</div>
                </div>
              </div>
            </Tilt3D>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ============ Stats ============ */
function Stats() {
  const stats = [
    { v: "100%", l: "فوترة الزكاة" },
    { v: "99.9%", l: "تسليم الواتساب" },
    { v: "98.4%", l: "دقة الصياغة" },
    { v: "24/7", l: "دعم فني بالرياض" },
  ];
  return (
    <section className="border-y-2 border-gold/30 bg-gradient-to-l from-primary/10 to-gold/10 py-12 section-premium-2">
      <div className="container mx-auto grid grid-cols-2 gap-6 px-4 md:grid-cols-4">
        {stats.map((s, i) => (
          <Tilt3D
            key={s.l}
            max={10}
            className="rounded-2xl scroll-reveal"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <div className="card-glass-3d p-6 text-center">
              <div className="text-4xl md:text-5xl font-black text-gradient-premium text-3d-emboss">
                {s.v}
              </div>
              <div className="mt-2 text-base text-high-contrast font-bold">{s.l}</div>
            </div>
          </Tilt3D>
        ))}
      </div>
    </section>
  );
}

/* ============ Features ============ */
const FEATURES = [
  {
    i: Bot,
    t: "المستشار الذكي القانوني",
    d: "صياغة اللوائح والمذكرات، تحليل القضايا، استشارات فورية وفق الأنظمة السعودية.",
  },
  {
    i: Workflow,
    t: "مزامنة ناجز التلقائية",
    d: "سحب الجلسات والوكالات وطلبات التنفيذ من ناجز لحظياً دون إدخال يدوي.",
  },
  {
    i: MessageSquare,
    t: "إشعارات واتساب رسمية",
    d: "تنبيه العميل قبل الجلسة بـ 24 ساعة، إرسال الفواتير والأحكام تلقائياً.",
  },
  {
    i: Receipt,
    t: "فواتير ZATCA Phase 2",
    d: "إصدار الفواتير الضريبية المعتمدة بـ QR، وسندات القبض والصرف.",
  },
  {
    i: FileSignature,
    t: "صياغة العقود الذكية",
    d: "عقود العمل، الشراكة، التوريد، الأتعاب — بصياغة احترافية فورية.",
  },
  {
    i: Calculator,
    t: "حاسبة المدد النظامية",
    d: "حساب تلقائي لمدد الاستئناف والاعتراض والنقض وفق الأنظمة.",
  },
  {
    i: ShieldCheck,
    t: "خزنة الوثائق الحصينة",
    d: "علامات مائية رقمية باسم الموظف، تشفير AES-256، خوادم سعودية.",
  },
  {
    i: Users,
    t: "بوابة العميل وبوابة الموظف",
    d: "صلاحيات مخصصة، متابعة لحظية، سحب وإفلات للمهام.",
  },
  {
    i: Library,
    t: "المكتبة القانونية الكاملة",
    d: "نظام المعاملات المدنية، الشركات، العمل، الاستثمار، الإثبات والتنفيذ.",
  },
];

function Features() {
  return (
    <section id="features" className="py-24 section-premium-1">
      <div className="container mx-auto px-4">
        <SectionHeader
          eyebrow="🛠️ العرض التفصيلي الشامل"
          title="منظومة قانونية كاملة تحت سقف واجهة واحدة"
          subtitle="لماذا تشتت أعمال مكتبك بين تطبيقات منفصلة؟ صُممت منصة العدالة لتغطي كل احتياجاتك اليومية ببساطة وأناقة."
        />
        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Tilt3D
              key={f.t}
              max={12}
              className="rounded-2xl scroll-reveal"
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className="card-glass-3d group p-8 h-full">
                <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-gold shadow-lg group-hover:scale-115 group-hover:rotate-6 transition-all duration-500 pop-z icon-3d-hover ring-2 ring-gold/30">
                  <f.i className="h-8 w-8" />
                </div>
                <h3 className="mt-6 text-xl font-black text-ultra-high-contrast">{f.t}</h3>
                <p className="mt-3 text-base text-high-contrast leading-relaxed font-semibold">
                  {f.d}
                </p>
                <div className="gold-divider mt-6 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Tilt3D>
          ))}
        </div>
      </div>
    </section>
  );
}

import { Users } from "lucide-react";

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center scroll-reveal">
      <div className="text-base font-black text-gold tracking-wide text-3d-emboss">{eyebrow}</div>
      <h2 className="mt-4 text-4xl md:text-6xl font-black text-gradient-premium leading-tight text-ultra-high-contrast">
        {title}
      </h2>
      <p className="mt-5 text-high-contrast text-xl leading-relaxed font-semibold">{subtitle}</p>
    </div>
  );
}

/* ============ AI Showcase ============ */
function AIShowcase() {
  return (
    <section id="ai" className="py-24 section-premium-2">
      <div className="container mx-auto px-4">
        <SectionHeader
          eyebrow="🤖 الذكاء الاصطناعي القضائي"
          title="مساعد الصياغة والتحليل الفوري"
          subtitle="أتمتة كتابة اللوائح ومذكرات الدفاع بدقة متناهية مطابقة للأنظمة التجارية والعمالية السعودية."
        />
        <div className="mt-16 grid gap-8 lg:grid-cols-2">
          <Tilt3D max={8} className="rounded-2xl scroll-reveal">
            <div className="card-night p-10 h-full">
              <h3 className="text-3xl font-black text-gold text-3d-emboss">المكاسب الإستراتيجية</h3>
              <ul className="mt-6 space-y-4 text-lg">
                {[
                  "توفير 90% من الوقت في البحث القضائي وصياغة الدفوع",
                  "دقة لغوية ونظامية فائقة وفق المبادئ القضائية السعودية",
                  "استخراج ذكي لملخصات ملفات الدعوى الضخمة في دقائق",
                  "تحليل الموقف القانوني للعميل قبل اتخاذ القرار",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-4">
                    <CheckCircle2 className="h-6 w-6 shrink-0 text-gold icon-3d-hover" />
                    <span className="text-white/95 font-semibold">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Tilt3D>
          <Tilt3D max={8} className="rounded-2xl scroll-reveal" style={{ animationDelay: "0.2s" }}>
            <div className="card-glass-3d p-10 h-full">
              <h3 className="text-3xl font-black text-primary text-3d-emboss">الفرق الواضح</h3>
              <div className="mt-6 space-y-5">
                <CompareRow
                  type="bad"
                  title="🔴 الطرق التقليدية"
                  text="ساعات في مراجعة الكتب والنسخ واللصق من نماذج جامدة."
                />
                <CompareRow
                  type="good"
                  title="🟢 منصة العدالة"
                  text="صياغة فورية مرتبطة بوقائع قضيتك ومواد الأنظمة المحددة."
                />
                <CompareRow
                  type="bad"
                  title="✘ البرامج المنافسة"
                  text="قوالب جاهزة غير متزامنة مع ظروف قضيتك الحقيقية."
                />
              </div>
            </div>
          </Tilt3D>
        </div>
      </div>
    </section>
  );
}

function CompareRow({ type, title, text }: { type: "good" | "bad"; title: string; text: string }) {
  return (
    <div
      className={`rounded-xl border-r-4 p-5 ${type === "good" ? "border-success bg-success/10" : "border-destructive/60 bg-destructive/5"}`}
    >
      <div className="text-lg font-black">{title}</div>
      <p className="mt-2 text-base text-high-contrast font-semibold">{text}</p>
    </div>
  );
}

/* ============ Comparison Table ============ */
function Comparison() {
  const rows = [
    { f: "مزامنة وسحب قضايا ناجز آلياً", us: "لحظي وتلقائي بالكامل", them: "إدخال يدوي مرهق" },
    { f: "مساعد ذكاء اصطناعي قانوني سعودي", us: "خفير قضائي مدمج", them: "ملفات نصية بلا فطنة" },
    { f: "أتمتة واتساب وتنبيه قبل الجلسة 24 ساعة", us: "موصل واتساب رسمي", them: "اتصالات يدوية" },
    { f: "فواتير ZATCA Phase 2 معتمدة", us: "متطابق 100%", them: "إكسيل غير نظامي" },
    { f: "علامات مائية لمنع التسريب", us: "خزن بنكية مشفرة", them: "مستودعات مكشوفة" },
  ];
  return (
    <section id="comparison" className="py-24 section-premium-1">
      <div className="container mx-auto px-4">
        <SectionHeader
          eyebrow="⚖️ القوة والسيادة التقنية"
          title="منصة العدالة مقابل المنافسين"
          subtitle="لماذا نتفوق على الأنظمة والخيارات التقليدية المطروحة بالسوق."
        />
        <div className="card-glass-3d mt-16 overflow-hidden p-0 scroll-reveal">
          <div className="grid grid-cols-12 bg-gradient-to-l from-primary to-primary/80 px-8 py-5 text-primary-foreground text-base font-black">
            <div className="col-span-6">الميزة التقنية</div>
            <div className="col-span-3 text-center text-gold text-3d-emboss">⚖️ منصة العدالة</div>
            <div className="col-span-3 text-center">الأنظمة التقليدية</div>
          </div>
          {rows.map((r, i) => (
            <div
              key={r.f}
              className={`grid grid-cols-12 items-center gap-2 border-t-2 border-border/50 px-8 py-6 text-base transition-all hover:bg-accent/40 hover:scale-[1.01] ${i % 2 ? "bg-muted/20" : ""}`}
            >
              <div className="col-span-6 font-bold text-ultra-high-contrast">{r.f}</div>
              <div className="col-span-3 text-center">
                <span className="inline-flex items-center gap-2 rounded-full bg-success/15 px-4 py-1.5 text-success font-black text-sm ring-2 ring-success/30">
                  <CheckCircle2 className="h-4 w-4" />
                  {r.us}
                </span>
              </div>
              <div className="col-span-3 text-center text-medium-contrast text-sm font-semibold">
                <span className="inline-flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  {r.them}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ Calculator ============ */
function Calculator2() {
  const [cases, setCases] = useState(30);
  const [team, setTeam] = useState(5);
  const hours = Math.round(cases * 2 + team * 5);
  const value = (hours * 350).toLocaleString("ar-SA");
  return (
    <section className="py-24 section-premium-2">
      <div className="container mx-auto px-4">
        <SectionHeader
          eyebrow="📊 حاسبة الوفورات"
          title="كم ستوفّر من ساعات وأموال شهرياً؟"
          subtitle="جرّب التقدير الفوري للوفورات التشغيلية الحقيقية لمكتبك مع منصة العدالة."
        />
        <div className="card-glass-3d mt-14 grid gap-10 p-10 md:grid-cols-2 scroll-reveal">
          <div className="space-y-8">
            <div>
              <label className="text-base font-black text-ultra-high-contrast">
                عدد القضايا النشطة:{" "}
                <span className="text-gold font-black text-3d-emboss">{cases}</span>
              </label>
              <input
                type="range"
                min={5}
                max={200}
                value={cases}
                onChange={(e) => setCases(+e.target.value)}
                className="mt-4 w-full accent-[oklch(0.78_0.13_82)]"
              />
            </div>
            <div>
              <label className="text-base font-black text-ultra-high-contrast">
                عدد المستشارين بفريقك:{" "}
                <span className="text-gold font-black text-3d-emboss">{team}</span>
              </label>
              <input
                type="range"
                min={1}
                max={50}
                value={team}
                onChange={(e) => setTeam(+e.target.value)}
                className="mt-4 w-full accent-[oklch(0.78_0.13_82)]"
              />
            </div>
          </div>
          <Tilt3D max={10} className="rounded-2xl">
            <div className="card-night p-8 text-center">
              <div className="text-sm text-gold font-black">🎯 الوفورات الشهرية</div>
              <div className="mt-4 text-6xl font-black text-gold shimmer-text">{hours} ساعة</div>
              <div className="text-base mt-2 text-white/90 font-bold">ساعات عمل مستعادة</div>
              <div className="gold-divider my-6" />
              <div className="text-4xl font-black shimmer-text">{value} ر.س</div>
              <div className="text-base mt-2 text-white/90 font-bold">قيمة محققة للمكتب</div>
            </div>
          </Tilt3D>
        </div>
      </div>
    </section>
  );
}

/* ============ WhatsApp Demo ============ */
function WhatsAppDemo() {
  return (
    <section className="py-24 section-premium-1">
      <div className="container mx-auto grid items-center gap-14 px-4 lg:grid-cols-2">
        <div className="scroll-reveal">
          <div className="text-base font-black text-gold text-3d-emboss">📱 تكامل واتساب</div>
          <h2 className="mt-4 text-4xl md:text-5xl font-black text-gradient-premium">
            تنبيه العملاء فوراً عبر واتساب
          </h2>
          <p className="mt-5 text-high-contrast text-lg leading-relaxed font-semibold">
            بمجرد اقتراب موعد جلسة أو صدور تحديث جديد، يقوم النظام آلياً بإرسال تفاصيل التحديث عبر
            رسالة احترافية لموكلك.
          </p>
          <ul className="mt-7 space-y-4">
            {[
              "التنبيه التلقائي قبل الجلسة بـ 24 ساعة",
              "إرسال الفواتير الإلكترونية وسندات القبض",
              "إشعار العميل بصدور الأحكام وتحديث حالتها",
            ].map((t) => (
              <li
                key={t}
                className="flex items-center gap-4 text-base font-bold text-high-contrast"
              >
                <CheckCircle2 className="h-6 w-6 text-success icon-3d-hover" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <Tilt3D max={12} className="rounded-2xl scroll-reveal" style={{ animationDelay: "0.2s" }}>
          <div className="mx-auto w-full max-w-sm">
            <div className="card-glass-3d p-5 bg-gradient-to-b from-[#075E54] to-[#128C7E] text-white">
              <div className="flex items-center gap-4 border-b-2 border-white/30 pb-4">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-white/25 icon-3d-hover ring-2 ring-white/40">
                  <Scale className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-base font-black">منصة العدالة</div>
                  <div className="text-xs opacity-90 font-bold">● متصل</div>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                <div className="rounded-2xl rounded-tl-sm bg-white/20 p-4 text-base backdrop-blur-sm">
                  <div className="font-black text-lg">⚖️ تذكير بموعد جلسة</div>
                  <div className="mt-2 text-sm opacity-95 font-semibold">
                    رقم القضية: 45829
                    <br />
                    الموعد: غداً 09:00 ص<br />
                    المحكمة: العمالية - الرياض
                  </div>
                  <div className="mt-3 text-xs opacity-80 text-left font-bold">09:42 ✓✓</div>
                </div>
              </div>
            </div>
          </div>
        </Tilt3D>
      </div>
    </section>
  );
}

/* ============ Security ============ */
function Security() {
  return (
    <section id="security" className="py-24 section-premium-dark">
      <div className="container mx-auto px-4">
        <SectionHeader
          eyebrow="🇸🇦 السيادة الرقمية"
          title="حماية تامة للمستندات القضائية"
          subtitle="استضافات محلية في الرياض مطابقة لشروط الهيئة الوطنية للأمن السيبراني (NCA)."
        />
        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {[
            { v: "100%", l: "سيادة رقمية وطنية", i: Globe },
            { v: "AES-256", l: "تشفيرات بنكية", i: Lock },
            { v: "0%", l: "ثغرات أو تسريبات", i: ShieldCheck },
            { v: "24/7", l: "مراقبة نشطة", i: Zap },
          ].map((s, i) => (
            <Tilt3D
              key={s.l}
              max={12}
              className="rounded-2xl scroll-reveal"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <div className="card-glass-3d p-8 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-gold to-gold/70 text-primary shadow-lg icon-3d-hover ring-2 ring-gold/40">
                  <s.i className="h-8 w-8" />
                </div>
                <div className="mt-5 text-4xl font-black text-gradient-premium text-3d-emboss">
                  {s.v}
                </div>
                <div className="mt-2 text-base text-high-contrast font-bold">{s.l}</div>
              </div>
            </Tilt3D>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ Client Portal Section ============ */
function ClientPortal() {
  return (
    <section className="py-24 section-premium-1">
      <div className="container mx-auto grid items-center gap-14 px-4 lg:grid-cols-2">
        <Tilt3D max={8} className="rounded-2xl order-2 lg:order-1 scroll-reveal">
          <div className="card-glass-3d p-10">
            <div className="flex items-center gap-4 border-b-2 border-gold/30 pb-5">
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-gold icon-3d-hover ring-2 ring-gold/30">
                <User className="h-7 w-7" />
              </div>
              <div>
                <div className="text-lg font-black text-ultra-high-contrast">بوابة العميل</div>
                <div className="text-sm text-medium-contrast font-bold">عرض كامل لتفاصيل قضيتك</div>
              </div>
            </div>
            <div className="mt-6 space-y-4 text-base">
              <div className="rounded-lg bg-muted/30 p-4 flex justify-between font-bold">
                <span>رقم القضية</span>
                <span className="text-ultra-high-contrast">#45829</span>
              </div>
              <div className="rounded-lg bg-muted/30 p-4 flex justify-between font-bold">
                <span>المحكمة</span>
                <span className="text-ultra-high-contrast">التجارية - الرياض</span>
              </div>
              <div className="rounded-lg bg-success/15 border-2 border-success/40 p-4 text-success font-black">
                ✓ صدر حكم ابتدائي - يمكنك مراجعته
              </div>
              <button className="btn-gold w-full py-3 text-base">📝 أرسل استشارة لمحاميك</button>
            </div>
          </div>
        </Tilt3D>
        <div className="order-1 lg:order-2 scroll-reveal" style={{ animationDelay: "0.2s" }}>
          <div className="text-base font-black text-gold text-3d-emboss">
            👤 بوابة العميل المخصصة
          </div>
          <h2 className="mt-4 text-4xl md:text-5xl font-black text-gradient-premium">
            تجربة عميل لا تُنسى
          </h2>
          <p className="mt-5 text-high-contrast text-lg leading-relaxed font-semibold">
            امنح موكليك بوابة احترافية يتابعون فيها قضيتهم لحظياً، يطلبون الاستشارات، ويستقبلون
            التحديثات — مع رابط دخول يُرسَل عبر واتساب مباشرة.
          </p>
          <ul className="mt-6 space-y-3 text-base">
            {[
              "عرض جميع تفاصيل القضية",
              "إرسال طلبات استشارة واستفسار",
              "استقبال ردود المكتب لحظياً",
              "رابط بوابة قابل للمشاركة عبر واتساب",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 font-bold text-high-contrast">
                <CheckCircle2 className="h-5 w-5 text-success icon-3d-hover" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ============ Employee Portal ============ */
function EmployeePortal() {
  return (
    <section className="py-24 section-premium-2">
      <div className="container mx-auto grid items-center gap-14 px-4 lg:grid-cols-2">
        <div className="scroll-reveal">
          <div className="text-base font-black text-gold text-3d-emboss">🧑‍💼 بوابة الموظف</div>
          <h2 className="mt-4 text-4xl md:text-5xl font-black text-gradient-premium">
            إنجاز المهام بسلاسة احترافية
          </h2>
          <p className="mt-5 text-high-contrast text-lg leading-relaxed font-semibold">
            صلاحيات مخصصة لكل موظف، إسناد المهام بالسحب والإفلات، مزامنة فورية مع البوابة الرئيسية،
            وتنبيهات قبل انتهاء المهل.
          </p>
          <ul className="mt-6 space-y-3 text-base">
            {[
              "تحديد صلاحيات وأقسام كل موظف",
              "ربط القضايا والعملاء بكل موظف",
              "مزامنة المهام لحظياً مع الإدارة",
              "تنبيهات بالمهل المقتربة",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3 font-bold text-high-contrast">
                <CheckCircle2 className="h-5 w-5 text-success icon-3d-hover" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <Tilt3D max={8} className="rounded-2xl scroll-reveal" style={{ animationDelay: "0.2s" }}>
          <div className="card-glass-3d p-8">
            <div className="text-lg font-black mb-5 text-ultra-high-contrast">
              مهام اليوم - أحمد المحمد
            </div>
            {[
              { t: "صياغة مذكرة جوابية - قضية 45829", s: "warning", d: "اليوم 14:00" },
              { t: "حضور جلسة - المحكمة العمالية", s: "primary", d: "غداً 09:00" },
              { t: "رفع لائحة استئناف - قضية 41203", s: "destructive", d: "متأخر يومين" },
            ].map((m) => (
              <div
                key={m.t}
                className={`mb-3 rounded-xl border-r-4 p-4 text-base ${m.s === "destructive" ? "border-destructive bg-destructive/10" : m.s === "warning" ? "border-warning bg-warning/10" : "border-primary bg-primary/10"}`}
              >
                <div className="font-black text-ultra-high-contrast">{m.t}</div>
                <div className="text-sm text-medium-contrast mt-1 font-bold">⏰ {m.d}</div>
              </div>
            ))}
          </div>
        </Tilt3D>
      </div>
    </section>
  );
}

/* ============ FAQ ============ */
function FAQ() {
  return (
    <section id="faq" className="py-24 section-premium-1">
      <div className="container mx-auto max-w-3xl px-4">
        <SectionHeader
          eyebrow="📚 الأسئلة الشائعة"
          title="كل ما تود معرفته"
          subtitle="إجابات واضحة عن الربط، الموثوقية، وتكامل واتساب."
        />
        <Accordion type="single" collapsible className="mt-12 space-y-4">
          {FAQ_ITEMS.map((it, i) => (
            <AccordionItem
              key={i}
              value={`i${i}`}
              className="card-glass-3d border-none px-8 scroll-reveal"
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <AccordionTrigger className="text-right text-lg font-black hover:no-underline py-6 text-ultra-high-contrast">
                {it.q}
              </AccordionTrigger>
              <AccordionContent className="text-high-contrast text-base leading-relaxed font-semibold pb-6">
                {it.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/* ============ Contact ============ */
function Contact() {
  return (
    <section className="py-24 section-premium-2">
      <div className="container mx-auto grid gap-12 px-4 lg:grid-cols-2">
        <div>
          <SectionHeader
            eyebrow="📞 تواصل معنا"
            title="اطلب عرضاً تفصيلياً"
            subtitle="يسعدنا التواصل لتقديم عرض شامل يتناسب مع إدارة مكتبكم القانوني."
          />
        </div>
        <Tilt3D max={6} className="rounded-2xl scroll-reveal">
          <form className="card-glass-3d space-y-5 p-10">
            <Input placeholder="الاسم الكامل" className="h-14 text-right text-base font-semibold" />
            <Input placeholder="رقم الجوال" className="h-14 text-right text-base font-semibold" />
            <Input
              placeholder="البريد الإلكتروني"
              type="email"
              className="h-14 text-right text-base font-semibold"
            />
            <Textarea
              placeholder="تفاصيل الاستفسار"
              rows={4}
              className="text-right text-base font-semibold"
            />
            <Button className="btn-gold w-full h-14 text-base">إرسال الطلب</Button>
          </form>
        </Tilt3D>
      </div>
    </section>
  );
}

/* ============ Footer ============ */
function Footer() {
  return (
    <footer className="bg-gradient-to-b from-primary to-[oklch(0.18_0.04_260)] text-primary-foreground py-16 section-premium-dark">
      <div className="container mx-auto grid gap-12 px-4 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-gold/25 text-gold icon-3d-hover ring-2 ring-gold/40">
              <Scale className="h-6 w-6" />
            </div>
            <div className="text-xl font-black">
              منصة <span className="text-gradient-gold text-3d-emboss">العدالة</span>
            </div>
          </div>
          <p className="mt-5 text-base opacity-90 leading-relaxed max-w-md font-semibold">
            المنصة القانونية والشرعية الرقمية الأكثر تفصيلاً وسهولة لمكاتب المحاماة في الرياض وجدة
            وكافة مدن المملكة.
          </p>
        </div>
        <div>
          <h4 className="font-black text-gold mb-4 text-lg text-3d-emboss">المميزات</h4>
          <ul className="space-y-3 text-base opacity-90 font-semibold">
            <li>✦ مزامنة ناجز والوكالات</li>
            <li>✦ المستشار الذكي AI</li>
            <li>✦ فواتير ZATCA</li>
          </ul>
        </div>
        <div>
          <h4 className="font-black text-gold mb-4 text-lg text-3d-emboss">الدعم</h4>
          <div className="text-base opacity-90 space-y-3 font-semibold">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5" />
              support@al-adalah.sa
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5" />
              دعم ٢٤ ساعة - الرياض
            </div>
          </div>
        </div>
      </div>
      <div className="container mx-auto mt-12 border-t-2 border-gold/30 px-4 pt-8 text-sm opacity-70 text-center font-bold">
        © 2026 جميع الحقوق محفوظة لمنصة العدالة لإدارة مكاتب المحاماة.
      </div>
    </footer>
  );
}
