import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/auth";
import { WhatsAppInline } from "@/components/WhatsAppSupport";
import { sendWithdrawalRequestedEmail } from "@/lib/api/email.functions";
import { aggregateInvestmentEarnings, getAvailableWithdrawalBalance, getWithdrawalAvailabilityReason, getWithdrawalUnlockDate } from "@/lib/investment-withdrawal";

export const Route = createFileRoute("/_authenticated/withdraw")({
  head: () => ({ meta: [{ title: "Withdraw — TRENDY INVESTMENT AGENCY" }] }),
  component: WithdrawPage,
});

type Withdrawal = { id: string; amount: number; mpesa_phone: string; status: string; created_at: string; admin_note: string | null; payout_mpesa_code?: string | null };
type Settings = { min_withdrawal: number; max_withdrawal: number; withdrawal_fee_percent: number; withdrawal_fee_enabled: boolean; withdrawals_open_override: boolean | null };
type InvestmentSummary = { id: string; plan_amount: number; duration_days: number; status: string; start_at: string; end_at: string | null; projected_payout: number; plan_id: string | null };
type DailyEarningRow = { id: string; investment_id: string; earning_date: string; amount: number; added_to_balance: boolean; status: string };

function nairobiWeekday(): number {
  // 1=Mon..7=Sun
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", weekday: "short" }).format(new Date());
  const map: Record<string, number> = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:7 };
  return map[s] ?? 1;
}

function WithdrawPage() {
  const [balance, setBalance] = useState(0);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeMining, setActiveMining] = useState(0);
  const [investments, setInvestments] = useState<InvestmentSummary[]>([]);
  const [dailyEarnings, setDailyEarnings] = useState<DailyEarningRow[]>([]);

  const refresh = async () => {
    const [p, w, s, inv, de] = await Promise.all([
      supabase.from("profiles").select("balance, phone").maybeSingle(),
      supabase.from("withdrawals").select("*").order("created_at", { ascending: false }).limit(20),
      supabase.from("app_settings").select("min_withdrawal, max_withdrawal, withdrawal_fee_percent, withdrawal_fee_enabled, withdrawals_open_override").eq("id", 1).maybeSingle(),
      supabase.from("investments").select("id, plan_amount, duration_days, status, start_at, end_at, projected_payout, plan_id").order("created_at", { ascending: false }),
      supabase.from("daily_earnings").select("id, investment_id, earning_date, amount, added_to_balance, status").order("earning_date", { ascending: true }),
    ]);
    if (p.data) { setBalance(Number(p.data.balance)); if (!phone) setPhone(p.data.phone ?? ""); }
    if (w.data) setWithdrawals(w.data as Withdrawal[]);
    if (s.data) setSettings(s.data as Settings);
    if (inv.data) {
      const active = (inv.data as InvestmentSummary[]).filter(i => i.status === "active");
      setInvestments(inv.data as InvestmentSummary[]);
      setActiveMining(active.reduce((sum, i) => sum + Number(i.plan_amount), 0));
    }
    if (de.data) setDailyEarnings(de.data as DailyEarningRow[]);
  };
  useEffect(() => { void refresh(); }, []);

  const weekday = nairobiWeekday();
  const isSunday = weekday === 7;
  const override = settings?.withdrawals_open_override;
  const closed = override === false || isSunday;
  const feeEnabled = settings?.withdrawal_fee_enabled !== false;
  const feePct = feeEnabled ? Number(settings?.withdrawal_fee_percent ?? 20) : 0;
  const minW = Math.max(20, Math.floor(Number(settings?.min_withdrawal ?? 20)));
  const amt = Math.floor(Number(amount) || 0);
  const fee = Math.floor((amt * feePct) / 100);
  const net = Math.max(0, amt - fee);
  const investmentMetrics = useMemo(() => investments
    .filter((inv) => inv.status === "active")
    .map((inv) => ({
      ...inv,
      ...aggregateInvestmentEarnings(inv, dailyEarnings, new Date()),
      unlockDateKey: getWithdrawalUnlockDate(inv.start_at, inv.duration_days),
    })), [dailyEarnings, investments]);
  const effectiveBalance = useMemo(() => getAvailableWithdrawalBalance(balance, investmentMetrics), [balance, investmentMetrics]);
  const withdrawalReason = useMemo(() => getWithdrawalAvailabilityReason(effectiveBalance, minW, investmentMetrics), [effectiveBalance, investmentMetrics, minW]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (closed) {
      return toast.error(override === false
        ? "Withdrawals are temporarily closed by admin."
        : "Withdrawals are closed on Sundays. Please request withdrawal from Monday to Saturday.");
    }
    if (!amt || amt < minW) return toast.error(`Minimum withdrawal is KSh ${fmt(minW)}`);
    if (withdrawalReason) return toast.error(withdrawalReason);
    if (amt > effectiveBalance) return toast.error("Amount exceeds your balance");
    if (!phone.trim()) return toast.error("Enter your M-Pesa phone");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLoading(true);
    const { data: inserted, error } = await supabase.from("withdrawals").insert({
      user_id: user.id, amount: amt, mpesa_phone: phone.trim(), status: "pending",
    }).select("id").single();
    setLoading(false);
    if (error) return toast.error(error.message);
    if (inserted?.id) void sendWithdrawalRequestedEmail({ data: { withdrawalId: inserted.id } }).catch(() => {});
    toast.success("Withdrawal requested. Funds held pending approval.");
    setAmount("");
    void refresh();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Withdraw funds</h1>
        <p className="mt-1 text-sm text-muted-foreground">Send your available balance to M-Pesa.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Available balance" value={`KSh ${fmt(Math.floor(effectiveBalance))}`} accent />
        <Stat label="Active mining (locked)" value={`KSh ${fmt(activeMining)}`} sub="Unlocks on maturity" />
        <Stat label="Withdrawal window" value={closed ? "Closed" : "Open"} sub="Mon–Sat · Africa/Nairobi" />
      </div>

      <div className="rounded-2xl border border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-300">
        {override === false
          ? "Withdrawals are currently closed by admin. Please try again later."
          : "Withdrawals are available Monday to Saturday. Withdrawals are closed on Sundays."}
        <div className="mt-2"><WhatsAppInline label="Need help?" /></div>
      </div>

      {withdrawalReason && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          {withdrawalReason}
        </div>
      )}

      {investmentMetrics.length > 0 && (
        <section className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
          <div className="text-sm font-semibold">Investment withdrawal status</div>
          {investmentMetrics.map((inv) => (
            <div key={inv.id} className="rounded-xl border border-border/60 bg-background/70 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{inv.duration_days} days plan</div>
                  <div className="text-xs text-muted-foreground">Unlocks on {inv.unlockDateKey ? new Date(`${inv.unlockDateKey}T00:00:00Z`).toLocaleDateString() : "—"}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${inv.isUnlocked ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                  {inv.isUnlocked ? "Withdrawable" : "Locked"}
                </span>
              </div>
              <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div>Accumulated: KSh {fmt(inv.accumulated)}</div>
                <div>Withdrawable: KSh {fmt(inv.withdrawable)}</div>
                <div>Locked: KSh {fmt(inv.locked)}</div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Next earning: {inv.nextEarningDate ? new Date(`${inv.nextEarningDate}T00:00:00Z`).toLocaleDateString() : "—"}</div>
            </div>
          ))}
        </section>
      )}

      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border/60 bg-card p-6">
        <div>
          <label className="text-sm font-medium">M-Pesa phone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXX" required
            className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="text-sm font-medium">Amount (KSh)</label>
          <input type="number" step="1" min={minW} max={Math.floor(balance)} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} required
            className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          <div className="mt-1 text-xs text-muted-foreground">Min KSh {fmt(minW)} · whole numbers only</div>
        </div>

        {amt > 0 && (
          <div className="rounded-xl border border-border/60 bg-background p-4 text-sm space-y-1">
            <Row label="Amount" value={`KSh ${fmt(amt)}`} />
            {feeEnabled && <Row label={`Withdrawal charge (${feePct}%)`} value={`- KSh ${fmt(fee)}`} />}
            <Row label="Net to receive" value={`KSh ${fmt(net)}`} accent />
          </div>
        )}

        <button disabled={loading || effectiveBalance < minW || closed} className="rounded-md bg-[image:var(--gradient-gold)] px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-gold)] disabled:opacity-60">
          {loading ? "Requesting…" : "Request withdrawal"}
        </button>
      </form>

      <section>
        <h2 className="text-lg font-semibold">My withdrawals</h2>
        {withdrawals.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No withdrawals yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody>
                {withdrawals.map(w => (
                  <tr key={w.id} className="border-t border-border/40">
                    <td className="px-4 py-3 text-muted-foreground">{new Date(w.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 font-medium">
                      KSh {fmt(w.amount)}
                      {feeEnabled && (
                        (() => {
                          const feeRow = Math.floor((Number(w.amount) * feePct) / 100);
                          const netRow = Math.max(0, Math.floor(Number(w.amount)) - feeRow);
                          return <div className="text-xs text-muted-foreground mt-1">Net: KSh {fmt(netRow)} ({feePct}% fee)</div>;
                        })()
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono">{w.mpesa_phone}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${w.status === "paid" || w.status==="approved" ? "bg-emerald-500/15 text-emerald-400" : w.status === "rejected" ? "bg-red-500/15 text-red-400" : "bg-yellow-500/15 text-yellow-400"}`}>{w.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${accent ? "text-primary" : ""}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}