import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Coins, Wallet, TrendingUp, ArrowDownToLine, ArrowUpFromLine, Users, Timer, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/auth";
import { generateDailyEarnings, releaseUnlockedEarnings } from "@/lib/api/earnings.functions";
import { aggregateInvestmentEarnings, calculateInvestmentPlanMetrics, getWithdrawalUnlockDate, summarizePortfolioBalance } from "@/lib/investment-withdrawal";
import { MiningEarningsChart } from "@/components/MiningEarningsChart";
import { DataTablePagination } from "@/components/ui/data-table-pagination";

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
  term_days?: number | null; principal_amount?: number | null; currency?: string | null;
  profit_rate?: number | null; daily_profit?: number | null; weekly_profit?: number | null;
  start_date?: string | null; maturity_date?: string | null;
  current_cycle_start?: string | null; current_cycle_end?: string | null;
  total_accrued_profit?: number | null; total_paid_profit?: number | null;
};
type DailyEarningRow = {
  id: string; investment_id: string; earning_date: string; amount: number; added_to_balance: boolean; status: string;
};
type Tx = { id: string; type: string; amount: number; status: string; description: string; created_at: string };

function calculateLedgerBalance(transactions: Tx[], withdrawals: { amount: number; status: string }[]) {
  const ledgerTotal = transactions.reduce((total, transaction) => {
    if (!['completed', 'active', 'paid'].includes(transaction.status)) return total;
    const amount = Number(transaction.amount || 0);
    return total + (['deposit', 'daily_earning', 'referral', 'investment_maturity'].includes(transaction.type) ? amount : ['investment', 'withdrawal'].includes(transaction.type) ? -amount : 0);
  }, 0);
  const heldWithdrawals = withdrawals
    .filter(withdrawal => ['pending', 'approved', 'paid'].includes(withdrawal.status))
    .reduce((total, withdrawal) => total + Number(withdrawal.amount || 0), 0);
  return Math.max(0, ledgerTotal - heldWithdrawals);
}

const INVESTMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pending Payment",
  active: "Active Investment",
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

function remaining(startAt: string | null, endAt: string | null, durationDays: number | null) {
  const startMs = startAt ? new Date(startAt).getTime() : Number.NaN;
  const fallbackEndMs = Number.isFinite(startMs) ? startMs + Math.max(1, Number(durationDays || 0)) * 86400000 : Number.NaN;
  const endMs = endAt ? new Date(endAt).getTime() : fallbackEndMs;

  if (!Number.isFinite(endMs)) return { pct: 0, text: "—" };
  const now = Date.now();
  const diff = endMs - now;
  if (diff <= 0) return { pct: 100, text: "Matured" };
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return { pct: -1, text: `${d}d ${h}h ${m}m` };
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
  const [earningPage, setEarningPage] = useState(1);
  const [earningRowsPerPage, setEarningRowsPerPage] = useState(10);

  const refresh = useCallback(async () => {
    try { await supabase.rpc("mature_investments"); } catch { /* ignore */ }
    const reconciliation = await supabase.rpc("reconcile_available_balance");
    if (reconciliation.error) console.error("Balance reconciliation failed", reconciliation.error);
    const [p, i, d, w, r, cl, de, tx, ledger] = await Promise.all([
      supabase.from("profiles").select("balance, full_name").maybeSingle(),
      supabase.from("investments").select("*").order("created_at", { ascending: false }),
      supabase.from("deposits").select("amount,status"),
      supabase.from("withdrawals").select("amount,status"),
      supabase.from("referral_earnings").select("amount"),
      supabase.from("transactions").select("amount").eq("type", "claim"),
      supabase.from("daily_earnings").select("id, investment_id, earning_date, amount, added_to_balance, status").order("earning_date", { ascending: true }),
      supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(8),
      supabase.from("transactions").select("id, type, amount, status, description, created_at").order("created_at", { ascending: true }),
    ]);
    if (p.data) {
      const profileBalance = Number(p.data.balance || 0);
      const ledgerBalance = ledger.data?.length ? calculateLedgerBalance(ledger.data as Tx[], w.data ?? []) : profileBalance;
      setProfile({ ...p.data, balance: ledger.data?.length ? ledgerBalance : profileBalance } as Profile);
    }
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
    let totalExpectedProfit = 0;
    let totalExpectedReturn = 0;
    let totalRemaining = 0;
    let dailyAmount = 0;
    let completedDays = 0;
    let daysRemaining = 0;
    let nextEarningDate: string | null = null;
    let status = "Active Investment";

    let totalDuration = 0;

    for (const inv of activeCycles) {
      const duration = Math.max(1, Number(inv.duration_days || 1));
      const metrics = calculateInvestmentPlanMetrics({
        amount: Number(inv.plan_amount || 0),
        roiPercent: Number(inv.roi_percent || 0),
        durationDays: duration,
      });
      const startKey = inv.start_at ? inv.start_at.slice(0, 10) : todayKey;
      const startMs = Date.parse(`${startKey}T00:00:00Z`);
      const todayMs = Date.parse(`${todayKey}T00:00:00Z`);
      const elapsedDays = Math.max(0, Math.min(duration, Math.floor((todayMs - startMs) / 86400000)));
      const cycleTodayEarning = dailyEarnings.find(row => row.investment_id === inv.id && row.earning_date === todayKey)?.amount ?? 0;
      const cycleTotalEarned = dailyEarnings.filter(row => row.investment_id === inv.id && row.earning_date <= todayKey && row.added_to_balance).reduce((sum, row) => sum + Number(row.amount), 0);
      const cycleRemaining = Math.max(0, metrics.totalReturn - cycleTotalEarned);
      const cycleDailyAmount = elapsedDays >= duration ? metrics.finalDayEarning : metrics.dailyEarning;
      const cycleNext = dailyEarnings.filter(row => row.investment_id === inv.id && row.earning_date > todayKey).map(row => row.earning_date).sort()[0] ?? null;

      todayEarning += cycleTodayEarning;
      totalEarned += cycleTotalEarned;
      totalExpectedProfit += metrics.totalProfit;
      totalExpectedReturn += metrics.totalReturn;
      totalRemaining += cycleRemaining;
      dailyAmount += cycleDailyAmount;
      completedDays += elapsedDays;
      daysRemaining += Math.max(0, duration - elapsedDays);
      totalDuration += duration;
      if (!nextEarningDate && cycleNext) nextEarningDate = cycleNext;
    }

    return {
      todayEarning,
      totalEarned,
      totalExpectedProfit,
      totalExpectedReturn,
      totalRemaining,
      dailyAmount,
      completedDays,
      daysRemaining,
      nextEarningDate,
      status,
    };
  }, [investments, dailyEarnings, todayKey]);

  const investmentSummaries = useMemo(() => investments
    .filter(i => i.status === "active")
    .map((inv) => ({
      ...inv,
      ...aggregateInvestmentEarnings(inv, dailyEarnings, new Date()),
      unlockDateKey: getWithdrawalUnlockDate(inv.start_at, inv.duration_days),
    })), [dailyEarnings, investments]);
  const portfolioBalance = summarizePortfolioBalance(profile?.balance ?? 0, investmentSummaries);
  const availableBalance = portfolioBalance.availableBalance;

  const sortedDailyEarnings = useMemo(
    () => [...dailyEarnings].sort((a, b) => (a.earning_date < b.earning_date ? 1 : -1)),
    [dailyEarnings],
  );
  const earningTotalPages = Math.max(1, Math.ceil(sortedDailyEarnings.length / earningRowsPerPage));
  const safeEarningPage = Math.min(earningPage, earningTotalPages);
  const visibleDailyEarnings = sortedDailyEarnings.slice((safeEarningPage - 1) * earningRowsPerPage, safeEarningPage * earningRowsPerPage);

  useEffect(() => {
    setEarningPage(1);
  }, [earningRowsPerPage]);

  useEffect(() => {
    if (earningPage > earningTotalPages) setEarningPage(earningTotalPages);
  }, [earningPage, earningTotalPages]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} 👋</h1>
        <p className="mt-1 text-sm text-muted-foreground">Your investments, available balance, locked principal, and profit at a glance.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Wallet} label="Available balance" value={fmt(availableBalance)} accent />
        <Stat icon={Coins} label="Locked principal" value={fmt(activeMining)} sub={`${active.length} investment${active.length===1?"":"s"}`} />
        <Stat icon={TrendingUp} label="Projected returns" value={fmt(projectedTotal)} sub="From active investments" />
        <Stat icon={CheckCircle2} label="Matured investments" value={String(matured.length)} sub={`Profit paid ${fmt(claims)}`} />
        <Stat icon={ArrowDownToLine} label="Total deposits" value={fmt(totalDeposits)} sub={pendingDeposits ? `${pendingDeposits} pending` : undefined} />
        <Stat icon={ArrowUpFromLine} label="Total withdrawals" value={fmt(totalWithdrawals)} sub={pendingWithdrawals ? `${pendingWithdrawals} pending` : undefined} />
        <Stat icon={Users} label="Referral earnings" value={fmt(refEarn)} />
        <Stat icon={Timer} label="Next maturity" value={nextMature ? remaining(active.find(a=>a.id===nextMature.id)?.end_at ?? null).text : "—"} sub={nextMature ? fmt(nextMature.amount) : "No active investment"} />
      </div>

      {dailySummary && (
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Daily earning</h2>
              <p className="mt-1 text-sm text-muted-foreground">Profit accrual from your active investments in Africa/Nairobi time.</p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{dailySummary.status}</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Metric label="Today’s earning" value={fmt(dailySummary.todayEarning)} />
            <Metric label="Total expected profit" value={fmt(dailySummary.totalExpectedProfit)} />
            <Metric label="Total expected return" value={fmt(dailySummary.totalExpectedReturn)} />
            <Metric label="Earnings received" value={fmt(dailySummary.totalEarned)} />
            <Metric label="Remaining return" value={fmt(dailySummary.totalRemaining)} />
            <Metric label="Daily earning amount" value={fmt(dailySummary.dailyAmount)} />
            <Metric label="Days completed" value={String(dailySummary.completedDays)} />
            <Metric label="Days remaining" value={String(dailySummary.daysRemaining)} />
            <Metric label="Next earning" value={dailySummary.nextEarningDate ? new Date(`${dailySummary.nextEarningDate}T00:00:00Z`).toLocaleDateString() : "—"} />
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-xl font-semibold">Daily earning history</h2>
          <Link to="/transactions" className="text-sm font-medium text-primary hover:underline">View transactions</Link>
        </div>
        {sortedDailyEarnings.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No daily earning activity yet.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-border/60 bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Investment plan</th><th className="px-4 py-3">Investment</th><th className="px-4 py-3">Daily earning</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Added to balance</th></tr>
                </thead>
                <tbody>
                  {visibleDailyEarnings.map(row => {
                    const investment = investments.find(i => i.id === row.investment_id);
                    const planLabel = investment ? `${investment.duration_days} Days Plan` : "Investment";
                    return (
                      <tr key={row.id} className="border-t border-border/40">
                        <td className="px-4 py-3 text-muted-foreground">{row.earning_date}</td>
                        <td className="px-4 py-3">{planLabel}</td>
                        <td className="px-4 py-3">{fmt(Number(investment?.plan_amount ?? 0))}</td>
                        <td className="px-4 py-3 font-medium">{fmt(row.amount)}</td>
                        <td className="px-4 py-3 capitalize">{row.status}</td>
                        <td className="px-4 py-3">{row.added_to_balance ? "Yes" : "No"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <DataTablePagination
              page={safeEarningPage}
              totalPages={earningTotalPages}
              rowsPerPage={earningRowsPerPage}
              onPageChange={setEarningPage}
              onRowsPerPageChange={setEarningRowsPerPage}
              totalItems={sortedDailyEarnings.length}
              startIndex={(safeEarningPage - 1) * earningRowsPerPage}
              endIndex={Math.min(safeEarningPage * earningRowsPerPage, sortedDailyEarnings.length)}
            />
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold">Investment unlock status</h2>
          <Link to="/invest" className="text-sm font-medium text-primary hover:underline">+ Start new cycle</Link>
        </div>
        {investmentSummaries.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No active plans yet.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {investmentSummaries.map((inv) => (
              <div key={inv.id} className="rounded-2xl border border-border/60 bg-background/70 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">{inv.duration_days} days plan</div>
                    <div className="text-xs text-muted-foreground">Unlocks on {inv.unlockDateKey ? new Date(`${inv.unlockDateKey}T00:00:00Z`).toLocaleDateString() : "—"}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${inv.isUnlocked ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                    {inv.isUnlocked ? "Withdrawable" : "Locked"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>Accrued profit: {fmt(inv.accumulated)}</div>
                  <div>Paid profit: {fmt(inv.withdrawable)}</div>
                  <div>Locked profit: {fmt(inv.locked)}</div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">Next earning: {inv.nextEarningDate ? new Date(`${inv.nextEarningDate}T00:00:00Z`).toLocaleDateString() : "—"}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold">Investment earnings</h2>
          <Link to="/invest" className="text-sm font-medium text-primary hover:underline">+ Start new cycle</Link>
        </div>
        {investments.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No investments yet. <Link to="/invest" className="text-primary hover:underline">Start investing →</Link>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {investments.slice(0, 6).map((investment) => (
              <MiningEarningsChart key={investment.id} investment={investment} earningRows={dailyEarnings} />
            ))}
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
                  {t.type === "withdrawal" ? "−" : "+"}{fmt(t.amount)}
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
