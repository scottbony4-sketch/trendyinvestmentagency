import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, TrendingUp, Crown, Sprout } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/auth";
import { sendMiningCycleStartedEmail } from "@/lib/api/email.functions";

export const Route = createFileRoute("/_authenticated/invest")({
  head: () => ({ meta: [{ title: "Invest — TRENDY INVESTMENT AGENCY" }] }),
  component: InvestPage,
});

type Plan = {
  id: string; name: string; slug: string; description: string;
  duration_days: number; daily_return_percent: number; roi_percent: number;
  min_amount: number; max_amount: number | null; unlock_day: number | null;
  amount_presets: number[] | null; color: string; icon: string;
};

type PaymentMethod = "mpesa" | "balance";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  sprout: Sprout, "trending-up": TrendingUp, crown: Crown, sparkles: Sparkles,
};

const AMOUNT_TIERS = [250, 500, 1000, 5000, 10000];

function getPlanRoi(plan: Pick<Plan, "roi_percent" | "daily_return_percent" | "duration_days">) {
  return Number(plan.roi_percent ?? plan.daily_return_percent * plan.duration_days);
}

function getPlanAmountTiers(plan: Pick<Plan, "amount_presets" | "min_amount" | "max_amount">) {
  const presets = Array.isArray(plan.amount_presets) ? plan.amount_presets.filter(v => Number.isFinite(v) && v > 0) : [];
  if (presets.length > 0) {
    return presets.filter(amount => amount >= Number(plan.min_amount) && (plan.max_amount === null || amount <= Number(plan.max_amount)));
  }
  return AMOUNT_TIERS.filter(amount => amount >= Number(plan.min_amount) && (plan.max_amount === null || amount <= Number(plan.max_amount)));
}

function getDefaultAmount(plan: Pick<Plan, "amount_presets" | "min_amount" | "max_amount">) {
  const tiers = getPlanAmountTiers(plan);
  return tiers[0] ?? (Number(plan.min_amount) || 250);
}

function InvestPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [amount, setAmount] = useState<number>(250);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("mpesa");
  const [balance, setBalance] = useState(0);
  const [mpesaCode, setMpesaCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      supabase.from("investment_plans").select("*").eq("is_active", true).order("sort_order"),
      supabase.from("profiles").select("balance, status, deleted_at").maybeSingle(),
    ]).then(([plansResult, profileResult]) => {
      if (plansResult.data) {
        setPlans(plansResult.data as Plan[]);
        if (plansResult.data[0]) {
          const firstPlan = plansResult.data[0] as Plan;
          setSelected(firstPlan);
          setAmount(getDefaultAmount(firstPlan));
        }
      }
      if (profileResult.data) {
        setBalance(Math.floor(Number(profileResult.data.balance ?? 0)));
      }
    });
  }, []);

  const projected = useMemo(() => {
    if (!selected || !amount) return null;
    const roi = getPlanRoi(selected);
    const payout = Math.floor(amount * (1 + roi / 100));
    const profit = payout - amount;
    const endAt = new Date(Date.now() + selected.duration_days * 86400_000);
    return { roi, payout, profit, endAt };
  }, [selected, amount]);

  const amountValid = selected ? amount >= Number(selected.min_amount) && (selected.max_amount === null || amount <= Number(selected.max_amount)) : false;
  const balanceAvailable = balance >= amount;
  const submitDisabled = loading || !selected || !amountValid || (paymentMethod === "balance" && !balanceAvailable);

  const proceed = async () => {
    if (!selected) return;
    setError(null);
    if (!amountValid) {
      return toast.error(`Minimum for ${selected.name} is KSh ${fmt(selected.min_amount)}`);
    }
    if (paymentMethod === "balance" && !balanceAvailable) {
      setError("Your available balance is not enough for this mining plan.");
      return toast.error("Your available balance is not enough for this mining plan.");
    }

    if (paymentMethod === "mpesa") {
      navigate({ to: "/deposit", search: { amount, plan: selected.id } });
      return;
    }

    if (paymentMethod === "balance") {
      setLoading(true);
      try {
        const { data: investmentId, error: rpcError } = await supabase.rpc("create_balance_investment", { _plan_id: selected.id, _amount: amount });
        if (rpcError) throw rpcError;
        if (investmentId) void sendMiningCycleStartedEmail({ data: { investmentId: String(investmentId) } }).catch(() => {});
        toast.success("Mining cycle started from your available balance.");
        setMpesaCode("");
        setAmount(Math.max(250, Number(selected.min_amount)));
        const { data: profileData } = await supabase.from("profiles").select("balance").maybeSingle();
        if (profileData) setBalance(Math.floor(Number(profileData.balance ?? 0)));
      } catch (error: any) {
        const message = error?.message || "Unable to start mining cycle.";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Choose your mining plan</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick a mining cycle and choose how to invest.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map(p => {
          const Icon = ICONS[p.icon] ?? Sparkles;
          const active = selected?.id === p.id;
          const roi = getPlanRoi(p);
          return (
            <button key={p.id} type="button" onClick={() => { setSelected(p); setAmount(getDefaultAmount(p)); }}
              className={`rounded-2xl border p-6 text-left transition-all hover:-translate-y-1 ${active ? "border-primary bg-primary/10 shadow-[var(--shadow-gold)]" : "border-border/60 bg-card"}`}>
              <div className="flex items-center justify-between">
                <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ backgroundColor: `${p.color}22`, color: p.color }}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold uppercase text-muted-foreground">{p.duration_days} days</span>
              </div>
              <div className="mt-4 text-lg font-bold">{p.name}</div>
              <div className="text-sm text-muted-foreground">{p.description}</div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-2xl font-black text-primary">{Math.round(roi)}%</span>
                <span className="text-xs text-muted-foreground">total return</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                KSh {fmt(p.min_amount)} – KSh {p.max_amount ? fmt(p.max_amount) : "∞"}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="grid gap-4 rounded-2xl border border-border/60 bg-card p-6 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">Investment amount (KSh)</label>
            <div className="mt-2 grid grid-cols-5 gap-2">
              {getPlanAmountTiers(selected).map(a => (
                <button type="button" key={a} onClick={() => setAmount(a)}
                  className={`rounded-md border px-2 py-2 text-xs font-semibold transition-colors ${amount === a ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-primary/40"}`}>
                  {fmt(a)}
                </button>
              ))}
            </div>
            <input type="number" step="1" min={Number(selected.min_amount)} max={selected.max_amount ?? undefined}
              value={amount || ""} onChange={(e) => setAmount(Math.floor(Number(e.target.value)) || 0)}
              className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2 text-lg font-bold focus:border-primary focus:outline-none" />
            <div className="mt-2 text-xs text-muted-foreground">Whole numbers only · Min KSh {fmt(selected.min_amount)} · Max KSh {selected.max_amount ? fmt(selected.max_amount) : "∞"}</div>
          </div>

          <div className="space-y-2 text-sm">
            <Row label="Plan" value={selected.name} />
            <Row label="Duration" value={`${selected.duration_days} days mining cycle`} />
            <Row label="Return" value={projected ? `${Math.round(projected.roi)}%` : "—"} />
            <Row label="Projected mining payout" value={projected ? `KSh ${fmt(projected.payout)}` : "—"} accent />
            <Row label="Profit" value={projected ? `KSh ${fmt(projected.profit)}` : "—"} />
            <Row label="End date" value={projected ? projected.endAt.toLocaleDateString() : "—"} />
          </div>

          <div className="sm:col-span-2 rounded-2xl border border-border/60 bg-background p-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setPaymentMethod("mpesa")}
                className={`rounded-2xl border px-4 py-3 text-left ${paymentMethod === "mpesa" ? "border-primary bg-primary/10" : "border-border bg-white/70"}`}>
                <div className="text-sm font-semibold">Pay with M-Pesa</div>
                <div className="mt-1 text-xs text-muted-foreground">Continue with the existing M-Pesa deposit process.</div>
              </button>
              <button type="button" onClick={() => setPaymentMethod("balance")}
                className={`rounded-2xl border px-4 py-3 text-left ${paymentMethod === "balance" ? "border-primary bg-primary/10" : "border-border bg-white/70"}`}>
                <div className="text-sm font-semibold">Invest from Available Balance</div>
                <div className="mt-1 text-xs text-muted-foreground">Use your real available account balance.</div>
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-border/60 bg-white/80 p-4 text-sm">
                <div className="font-semibold">Available balance</div>
                <div className="mt-1 text-lg font-bold">KES {fmt(balance)}</div>
                {paymentMethod === "balance" && !balanceAvailable && (
                  <div className="mt-2 text-sm text-red-500">Your available balance is not enough for this mining plan.</div>
                )}
              </div>

              {paymentMethod === "mpesa" && (
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">
                  After confirming the selected plan, you will be redirected to the M-Pesa deposit flow and the mining cycle will start only after admin approval.
                </div>
              )}

              {paymentMethod === "balance" && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                  Your available balance will be deducted immediately and the mining cycle will start right away at 0% progress.
                </div>
              )}
            </div>

            <button onClick={proceed} disabled={submitDisabled}
              className="mt-4 w-full rounded-md bg-[image:var(--gradient-gold)] px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-gold)] disabled:opacity-60">
              {loading ? "Processing…" : paymentMethod === "mpesa" ? "Continue to M-Pesa" : "Invest from Available Balance"}
            </button>
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 pb-2 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${accent ? "text-primary" : ""}`}>{value}</span>
    </div>
  );
}
