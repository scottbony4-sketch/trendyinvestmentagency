import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Coins, Wallet, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Users, Timer, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/auth";
import { generateDailyEarnings, releaseUnlockedEarnings } from "@/lib/api/earnings.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — TRENDY INVESTMENT AGENCY" }] }),
  component: Dashboard,
});

type Profile = { balance: number; full_name: string };
type Investment = {
  id: string; plan_amount: number; duration_days: number;
  status: string; created_at: string; plan_id: string | null;
  start_at: string; end_at: string | null;
  projected_payout: number; roi_percent: number;
};
type DailyEarningRow = {
  id: string; investment_id: string; earning_date: string; amount: number; added_to_balance: boolean; status: string;
};
type Tx = { id: string; type: string; amount: number; status: string; description: string; created_at: string };

const MINING_STATUS_LABEL: Record<string, string> = {
  pending: "Pending Payment",
  active: "Active Mining",
  completed: "Completed",
  paused: "Paused",
  cancelled: "Cancelled",
};

function statusColor(s: string) {
  switch (s) {
    case "active": return "bg-emerald-500/15 text-emerald-400";
    case "completed": return "bg-primary/15 text-primary";
    case "paused": return "bg-yellow-500/15 text-yellow-400";
    case "cancelled": return "bg-red-500/15 text-red-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function toNairobiDateKey(date: Date | string | number = new Date()) {
  return new Date(date).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
}

function remaining(endAt: string | null) {
  if (!endAt) return { pct: 0, text: "—" };
  const end = new Date(endAt).getTime();
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return { pct: 100, text: "Matured" };
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return { pct: -1, text: `${d}d ${h}h ${m}m` };
}

function progressPct(startAt: string, endAt: string | null) {
  if (!endAt) return 0;
  const s = new Date(startAt).getTime();
  const e = new Date(endAt).getTime();
  const total = e - s;
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round(((Date.now() - s) / total) * 100)));
}

function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [deposits, setDeposits] = useState<{ amount: number; status: string }[]>([]);
  const [withdrawals, setWithdrawals] = useState<{ amount: number; status: string }[]>([]);
  const [refEarn, setRefEarn] = useState(0);
  const [claims, setClaims] = useState(0);
  const [dailyEarnings, setDailyEarnings] = useState<DailyEarningRow[]>([]);
  const [recent, setRecent] = useState<Tx[]>([]);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try { await supabase.rpc("mature_investments"); } catch { /* ignore */ }
    const [p, i, d, w, r, cl, de, tx] = await Promise.all([
      supabase.from("profiles").select("balance, full_name").maybeSingle(),
      supabase.from("investments").select("*").order("created_at", { ascending: false }),
      supabase.from("deposits").select("amount,status"),
      supabase.from("withdrawals").select("amount,status"),
      supabase.from("referral_earnings").select("amount"),
      supabase.from("transactions").select("amount").eq("type", "claim"),
      supabase.from("daily_earnings").select("id, investment_id, earning_date, amount, added_to_balance, status").order("earning_date", { ascending: true }),
      supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(8),
    ]);
    if (p.data) setProfile(p.data as Profile);
    if (i.data) setInvestments(i.data as Investment[]);
    if (d.data) setDeposits(d.data);
    if (w.data) setWithdrawals(w.data);
    if (r.data) setRefEarn(r.data.reduce((s, x) => s + Number(x.amount), 0));
    if (cl.data) setClaims(cl.data.reduce((s, x) => s + Number(x.amount), 0));
    if (de.data) setDailyEarnings(de.data as DailyEarningRow[]);
    if (tx.data) setRecent(tx.data as Tx[]);
  }, []);

  useEffect(() => {
    const syncDailyEarnings = async () => {
      try {
        await generateDailyEarnings();
        await releaseUnlockedEarnings();
      } catch (err) {
        console.error("Daily earnings sync failed", err);
      } finally {
        await refresh();
      }
    };
    void syncDailyEarnings();
  }, [refresh]);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void 0; }, [tick]);

  const active = investments.filter(i => i.status === "active");
  const matured = investments.filter(i => i.status === "completed");
  const totalDeposits = deposits.filter(d => d.status === "approved").reduce((s, d) => s + Number(d.amount), 0);
  const totalWithdrawals = withdrawals.filter(d => d.status === "approved" || d.status === "paid").reduce((s, d) => s + Number(d.amount), 0);
  const pendingDeposits = deposits.filter(d => d.status === "pending").length;
  const pendingWithdrawals = withdrawals.filter(d => d.status === "pending").length;
  const activeMining = active.reduce((s, i) => s + Number(i.plan_amount), 0);
  const projectedTotal = active.reduce((s, i) => s + Number(i.projected_payout), 0);
  const nextMature = active.length
    ? active.map(i => ({ id: i.id, end: i.end_at ? new Date(i.end_at).getTime() : Infinity, amount: i.projected_payout }))
        .sort((a, b) => a.end - b.end)[0]
    : null;

  const todayKey = toNairobiDateKey();
  const dailySummary = useMemo(() => {
    const activeCycles = investments.filter(i => i.status === "active");
    if (activeCycles.length === 0) return null;
    let todayEarning = 0;
    let totalEarned = 0;
    let totalRemaining = 0;
    let dailyAmount = 0;
    let completedDays = 0;
    let daysRemaining = 0;
    let progress = 0;
    let nextEarningDate: string | null = null;
    let status = "Active Mining";

    for (const inv of activeCycles) {
      const duration = Math.max(1, Number(inv.duration_days || 1));
      const profit = Math.max(0, Number(inv.projected_payout || 0) - Number(inv.plan_amount || 0));
      const baseDaily = Math.floor(profit / duration);
      const remainder = profit - (baseDaily * duration);
      const startKey = inv.start_at ? inv.start_at.slice(0, 10) : todayKey;
      const startMs = Date.parse(`${startKey}T00:00:00Z`);
      const todayMs = Date.parse(`${todayKey}T00:00:00Z`);
      const elapsedDays = Math.max(0, Math.min(duration, Math.floor((todayMs - startMs) / 86400000)));
      const cycleTodayEarning = dailyEarnings.find(row => row.investment_id === inv.id && row.earning_date === todayKey)?.amount ?? 0;
      const cycleTotalEarned = dailyEarnings.filter(row => row.investment_id === inv.id && row.earning_date <= todayKey && row.added_to_balance).reduce((sum, row) => sum + Number(row.amount), 0);
      const cycleRemaining = Math.max(0, profit - cycleTotalEarned);
      const cycleDailyAmount = elapsedDays >= duration ? baseDaily + remainder : baseDaily;
      const cycleNext = dailyEarnings.filter(row => row.investment_id === inv.id && row.earning_date > todayKey).map(row => row.earning_date).sort()[0] ?? null;

      todayEarning += cycleTodayEarning;
      totalEarned += cycleTotalEarned;
      totalRemaining += cycleRemaining;
      dailyAmount += cycleDailyAmount;
      completedDays += elapsedDays;
      daysRemaining += Math.max(0, duration - elapsedDays);
      progress = duration > 0 ? Math.round((completedDays / (activeCycles.length * duration)) * 100) : 0;
      if (!nextEarningDate && cycleNext) nextEarningDate = cycleNext;
    }

    return {
      todayEarning,
      totalEarned,
      totalRemaining,
      dailyAmount,
      completedDays,
      daysRemaining,
      progress: Math.min(100, progress),
      nextEarningDate,
      status,
    };
  }, [investments, dailyEarnings, todayKey]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your mining cycles, mined balance and portfolio at a glance.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Wallet} label="Available balance" value={`KSh ${fmt(Math.floor(profile?.balance ?? 0))}`} accent />
        <Stat icon={Coins} label="Active mining (locked)" value={`KSh ${fmt(activeMining)}`} sub={`${active.length} cycle${active.length===1?"":"s"}`} />
        <Stat icon={TrendingUp} label="Projected payouts" value={`KSh ${fmt(projectedTotal)}`} sub="From active cycles" />
        <Stat icon={CheckCircle2} label="Matured cycles" value={String(matured.length)} sub={`Mined KSh ${fmt(claims)}`} />
        <Stat icon={ArrowDownToLine} label="Total deposits" value={`KSh ${fmt(totalDeposits)}`} sub={pendingDeposits ? `${pendingDeposits} pending` : undefined} />
        <Stat icon={ArrowUpFromLine} label="Total withdrawals" value={`KSh ${fmt(totalWithdrawals)}`} sub={pendingWithdrawals ? `${pendingWithdrawals} pending` : undefined} />
        <Stat icon={Users} label="Referral earnings" value={`KSh ${fmt(refEarn)}`} />
        <Stat icon={Timer} label="Next maturity" value={nextMature ? remaining(active.find(a=>a.id===nextMature.id)?.end_at ?? null).text : "—"} sub={nextMature ? `KSh ${fmt(nextMature.amount)}` : "No active cycle"} />
      </div>

      {dailySummary && (
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Daily earning</h2>
              <p className="mt-1 text-sm text-muted-foreground">Real earnings from your active mining cycles in Africa/Nairobi time.</p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{dailySummary.status}</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Today’s earning" value={`KSh ${fmt(dailySummary.todayEarning)}`} />
            <Metric label="Total earned so far" value={`KSh ${fmt(dailySummary.totalEarned)}`} />
            <Metric label="Remaining earnings" value={`KSh ${fmt(dailySummary.totalRemaining)}`} />
            <Metric label="Daily earning amount" value={`KSh ${fmt(dailySummary.dailyAmount)}`} />
            <Metric label="Days completed" value={String(dailySummary.completedDays)} />
            <Metric label="Days remaining" value={String(dailySummary.daysRemaining)} />
            <Metric label="Mining progress" value={`${dailySummary.progress}%`} />
            <Metric label="Next earning" value={dailySummary.nextEarningDate ? new Date(`${dailySummary.nextEarningDate}T00:00:00Z`).toLocaleDateString() : "—"} />
          </div>
        </section>
      )}

      <section>
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold">Daily earning history</h2>
          <Link to="/transactions" className="text-sm text-primary hover:underline">View transactions</Link>
        </div>
        {dailyEarnings.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No daily earning activity yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Mining plan</th><th className="px-4 py-3">Investment</th><th className="px-4 py-3">Daily earning</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Added to balance</th></tr>
              </thead>
              <tbody>
                {dailyEarnings.map(row => {
                  const investment = investments.find(i => i.id === row.investment_id);
                  const planLabel = investment ? `${investment.duration_days} Days Plan` : "Mining cycle";
                  return (
                    <tr key={row.id} className="border-t border-border/40">
                      <td className="px-4 py-3 text-muted-foreground">{row.earning_date}</td>
                      <td className="px-4 py-3">{planLabel}</td>
                      <td className="px-4 py-3">KSh {fmt(Number(investment?.plan_amount ?? 0))}</td>
                      <td className="px-4 py-3 font-medium">KSh {fmt(row.amount)}</td>
                      <td className="px-4 py-3 capitalize">{row.status}</td>
                      <td className="px-4 py-3">{row.added_to_balance ? "Yes" : "No"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold">Mining progress</h2>
          <Link to="/invest" className="text-sm font-medium text-primary hover:underline">+ Start new cycle</Link>
        </div>
        {investments.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No mining cycles yet. <Link to="/invest" className="text-primary hover:underline">Start mining →</Link>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {investments.slice(0, 6).map(i => {
              const pct = progressPct(i.start_at, i.end_at);
              const rem = remaining(i.end_at);
              const label = MINING_STATUS_LABEL[i.status] ?? i.status;
              return (
                <div key={i.id} className="rounded-2xl border border-border/60 bg-card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs uppercase text-muted-foreground">{i.duration_days} days · {Math.round(Number(i.roi_percent))}% return</div>
                      <div className="mt-1 text-lg font-bold">KSh {fmt(i.plan_amount)}</div>
                      <div className="text-xs text-primary">Projected payout: KSh {fmt(i.projected_payout)}</div>
                    </div>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusColor(i.status)}`}>{label}</span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full bg-[image:var(--gradient-gold)] transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>{pct}% complete</span>
                    <span>{rem.text} remaining</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 text-[11px] text-muted-foreground">
                    <span>Started: {new Date(i.start_at).toLocaleString()}</span>
                    <span>Ends: {i.end_at ? new Date(i.end_at).toLocaleString() : "—"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold">Recent activity</h2>
          <Link to="/transactions" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border/60 rounded-2xl border border-border/60 bg-card">
            {recent.map(t => (
              <li key={t.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-primary">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-sm font-medium capitalize">{t.type} · {t.description}</div>
                    <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
                  </div>
                </div>
                <div className={`text-sm font-semibold ${t.type === "withdrawal" ? "text-red-400" : "text-emerald-400"}`}>
                  {t.type === "withdrawal" ? "−" : "+"}KSh {fmt(t.amount)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent ? "border-primary/40 bg-[image:var(--gradient-gold)]/10" : "border-border/60 bg-card"}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" /> {label}</div>
      <div className="mt-2 text-xl font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-2 text-lg font-semibold">{value}</div>
    </div>
  );
}
