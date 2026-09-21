import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PLANS, fmt } from "@/lib/auth";
import { sendDepositSubmittedEmail } from "@/lib/api/email.functions";
import { DataTablePagination } from "@/components/ui/data-table-pagination";

type Search = { amount?: number; plan?: string };
const FIXED_DEPOSIT_AMOUNTS = [100, 250, 500] as const;

export const Route = createFileRoute("/_authenticated/deposit")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    amount: s.amount ? Number(s.amount) : undefined,
    plan: typeof s.plan === "string" ? s.plan : undefined,
  }),
  head: () => ({ meta: [{ title: "Deposit — TRENDY INVESTMENT AGENCY" }] }),
  component: DepositPage,
});

type Deposit = { id: string; amount: number; mpesa_code: string; status: string; created_at: string; admin_note: string | null };

function DepositPage() {
  const search = Route.useSearch();
  const initialAmount = FIXED_DEPOSIT_AMOUNTS.includes(search.amount as 100 | 250 | 500) ? search.amount! : FIXED_DEPOSIT_AMOUNTS[0];
  const [amount, setAmount] = useState<number>(initialAmount);
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [payerName, setPayerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  const refresh = async () => {
    const { data } = await supabase.from("deposits").select("*").order("created_at", { ascending: false }).limit(20);
    if (data) setDeposits(data as Deposit[]);
  };
  useEffect(() => { void refresh(); }, []);

  const totalPages = Math.max(1, Math.ceil(deposits.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const visibleDeposits = useMemo(() => deposits.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage), [deposits, safePage, rowsPerPage]);

  useEffect(() => {
    setPage(1);
  }, [rowsPerPage]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!FIXED_DEPOSIT_AMOUNTS.includes(amount as 100 | 250 | 500)) {
      return toast.error("Choose a fixed plan amount: $100, $250, or $500.");
    }
    if (!code.trim()) return toast.error("Enter the M-Pesa confirmation code");
    if (!phone.trim()) return toast.error("Enter the M-Pesa phone number used to pay");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setLoading(true);
    let planId = search.plan;
    if (!planId) {
      const { data: matchingPlan, error: planError } = await supabase
        .from("investment_plans")
        .select("id")
        .eq("is_active", true)
        .eq("min_amount", amount)
        .eq("max_amount", amount)
        .maybeSingle();
      if (planError || !matchingPlan) {
        setLoading(false);
        return toast.error("The selected USD plan is not available.");
      }
      planId = matchingPlan.id;
    }
    const { data: inserted, error } = await supabase.from("deposits").insert({
      user_id: user.id, amount, mpesa_code: code.trim().toUpperCase(), status: "pending",
      plan_id: planId,
      mpesa_phone: phone.trim(),
      payer_name: payerName.trim() || undefined,
    }).select("id").single();
    setLoading(false);
    if (error) return toast.error(error.message);
    if (inserted?.id) void sendDepositSubmittedEmail({ data: { depositId: inserted.id } }).catch(() => {});
    toast.success("Deposit submitted. Awaiting admin approval.");
    setCode("");
    void refresh();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Make a deposit</h1>
        <p className="mt-1 text-sm text-muted-foreground">Deposit in USD and confirm your investment before the 90-day term begins.</p>
      </div>

      <div className="card rounded-2xl border-primary/30 bg-primary/5 p-6 text-sm">
        <div className="font-semibold text-primary">M-Pesa payment instructions</div>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-foreground/90">
          <li>Go to Lipa na M-Pesa → Buy Goods</li>
          <li>M-Pesa Till Number: <span className="font-mono font-bold">4970892</span></li>
          <li>Send exactly the selected USD plan amount, then enter your M-Pesa transaction code for admin verification.</li>
        </ol>
      </div>

      <form onSubmit={submit} className="card space-y-5 rounded-2xl p-6">
        <div>
          <label className="text-sm font-medium">Amount (USD)</label>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {PLANS.map(p => (
              <button type="button" key={p} onClick={() => setAmount(p)}
                className={`rounded-md border px-2 py-2 text-sm font-medium transition-colors ${amount === p ? "border-primary bg-primary/15 text-primary" : "border-border hover:border-primary/40"}`}>
                {fmt(p)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">M-Pesa confirmation code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SJK4X2P9LM" required
            className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="text-sm font-medium">M-Pesa phone number</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 2547XXXXXXXX" required
            className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div>
          <label className="text-sm font-medium">Payer name (optional)</label>
          <input value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Name on M-Pesa receipt" 
            className="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
        <button disabled={loading} className="rounded-md bg-[image:var(--gradient-gold)] px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-gold)] disabled:opacity-60">
          {loading ? "Submitting…" : `Submit deposit of ${fmt(amount)}`}
        </button>
      </form>

      <section>
        <h2 className="text-lg font-semibold">My deposits</h2>
        {deposits.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No deposits yet.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-border/60 bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">M-Pesa code</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody>
                  {visibleDeposits.map(d => (
                    <tr key={d.id} className="border-t border-border/40">
                      <td className="px-4 py-3 text-muted-foreground">{new Date(d.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3 font-medium">{fmt(d.amount)}</td>
                      <td className="px-4 py-3 font-mono">{d.mpesa_code}</td>
                      <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataTablePagination
              page={safePage}
              totalPages={totalPages}
              rowsPerPage={rowsPerPage}
              onPageChange={setPage}
              onRowsPerPageChange={setRowsPerPage}
              totalItems={deposits.length}
              startIndex={(safePage - 1) * rowsPerPage}
              endIndex={Math.min(safePage * rowsPerPage, deposits.length)}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "approved" ? "bg-emerald-500/15 text-emerald-400"
    : status === "rejected" ? "bg-red-500/15 text-red-400"
    : "bg-yellow-500/15 text-yellow-400";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{status}</span>;
}