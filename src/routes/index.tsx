import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Download, Coins, TrendingUp, ShieldCheck, Sparkles } from "lucide-react";
import heroTeam from "@/assets/hero-team.jpg";
import { WhatsAppFab, WhatsAppInline } from "@/components/WhatsAppSupport";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TRENDY INVESTMENT AGENCY — Mine coins. Earn shillings." },
      { name: "description", content: "Join TRENDY INVESTMENT AGENCY, run mining cycles from 7 to 28 days and convert your mined coins into Kenyan shillings — straight to M-Pesa." },
      { property: "og:title", content: "TRENDY INVESTMENT AGENCY" },
      { property: "og:description", content: "Mining cycles from 7 to 28 days. Earn 40%, 80% or 130% total return, straight to M-Pesa." },
    ],
  }),
  component: Index,
});

const PLANS = [
  { amount: 250, seven: 350, seventeen: 450, twentyeight: 575 },
  { amount: 500, seven: 700, seventeen: 900, twentyeight: 1150 },
  { amount: 1000, seven: 1400, seventeen: 1800, twentyeight: 2300 },
  { amount: 5000, seven: 7000, seventeen: 9000, twentyeight: 11500 },
  { amount: 10000, seven: 14000, seventeen: 18000, twentyeight: 23000 },
];
const fmt = (n: number) => n.toLocaleString("en-KE");

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <Features />
      <About />
      <Plans />
      <Footer />
      <WhatsAppFab />
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[image:var(--gradient-gold)] font-black text-primary-foreground shadow-[var(--shadow-gold)]">T</div>
      <span className="text-sm font-bold tracking-wide sm:text-base">
        TRENDY <span className="text-primary">INVESTMENT AGENCY</span>
      </span>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Logo />
        <div className="flex items-center gap-2 sm:gap-3">
          <Link to="/login" className="rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:text-foreground">Log in</Link>
          <Link to="/signup" className="rounded-md bg-[image:var(--gradient-gold)] px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-gold)] transition-transform hover:scale-[1.02]">Sign up</Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[image:var(--gradient-hero)]" />
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Mining cycles: 7 · 17 · 28 days
          </span>
          <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Mine coins.<br />
            <span className="bg-[image:var(--gradient-gold)] bg-clip-text text-transparent">Earn shillings.</span>
          </h1>
          <p className="mt-6 max-w-lg text-base text-muted-foreground sm:text-lg">
            TRENDY INVESTMENT AGENCY runs your mining cycle for you. Deposit via M-Pesa, watch your progress live, and get your projected mining payout the moment your cycle matures.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/signup" className="inline-flex items-center justify-center rounded-md bg-[image:var(--gradient-gold)] px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-gold)] transition-transform hover:scale-[1.03]">Get started</Link>
            <a href="#plans" className="inline-flex items-center justify-center rounded-md border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-secondary">View plans</a>
            <WhatsAppInline />
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-4 -z-10 rounded-3xl bg-[image:var(--gradient-gold)] opacity-20 blur-3xl" />
          <img src={heroTeam} alt="TRENDY INVESTMENT AGENCY team" width={1280} height={1024}
            className="w-full rounded-2xl border border-border/60 shadow-[var(--shadow-gold)]" />
        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { icon: Coins, title: "Whole shillings, whole days", body: "Choose from KSh 250 to KSh 10,000 and pick your mining cycle: 7, 17 or 28 days." },
    { icon: TrendingUp, title: "40%, 80% or 130% total return", body: "Each cycle pays your invested amount plus 40%, 80% or 130% — straight to your balance on maturity." },
    { icon: ShieldCheck, title: "Admin-secured M-Pesa", body: "Every deposit and withdrawal is verified manually so your money moves only when you say so." },
  ];
  return (
    <section className="mx-auto max-w-7xl px-6 pb-20">
      <div className="grid gap-6 md:grid-cols-3">
        {items.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-2xl border border-border/60 bg-card p-6 transition-colors hover:border-primary/40">
            <Icon className="h-7 w-7 text-primary" />
            <h3 className="mt-5 text-lg font-semibold">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function About() {
  return (
    <section className="border-y border-border/50 bg-card/30">
      <div className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          About <span className="text-primary">TRENDY INVESTMENT AGENCY</span>
        </h2>
        <p className="mt-6 text-base text-muted-foreground sm:text-lg">
          TRENDY INVESTMENT AGENCY is a Kenyan digital mining platform built for everyday earners. We make crypto mining simple, transparent and profitable — no rigs, no electricity bills, no jargon. Members buy in from KSh 250, run a fully-managed 7, 17 or 28-day mining cycle and receive their projected mining payout the moment the cycle matures.
        </p>
      </div>
    </section>
  );
}

function Plans() {
  return (
    <section id="plans" className="mx-auto max-w-7xl px-6 py-20">
      <div className="text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Mining plans</h2>
        <p className="mt-3 text-muted-foreground">Pick your investment amount and your mining cycle.</p>
      </div>
      <div className="mt-12 overflow-x-auto rounded-2xl border border-border/60 bg-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Investment</th>
              <th className="px-4 py-3">7 days · 40%</th>
              <th className="px-4 py-3">17 days · 80%</th>
              <th className="px-4 py-3">28 days · 130%</th>
            </tr>
          </thead>
          <tbody>
            {PLANS.map(p => (
              <tr key={p.amount} className="border-t border-border/40">
                <td className="px-4 py-4 font-semibold">KSh {fmt(p.amount)}</td>
                <td className="px-4 py-4 text-primary">KSh {fmt(p.seven)}</td>
                <td className="px-4 py-4 text-primary">KSh {fmt(p.seventeen)}</td>
                <td className="px-4 py-4 text-primary">KSh {fmt(p.twentyeight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-12 text-center">
        <Link to="/signup" className="inline-flex items-center justify-center rounded-md bg-[image:var(--gradient-gold)] px-8 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-gold)] transition-transform hover:scale-[1.03]">
          Start mining now
        </Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/50">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
        <Logo />
        <div className="flex flex-col items-center gap-2 sm:items-end">
          <WhatsAppInline label="WhatsApp support" />
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} TRENDY INVESTMENT AGENCY. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
