import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Users, Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmt } from "@/lib/auth";
import { buildReferralLink, normalizeReferralCode } from "@/lib/referral";
import { getSiteUrl } from "@/lib/site-url";
import { DataTablePagination } from "@/components/ui/data-table-pagination";

export const Route = createFileRoute("/_authenticated/referrals")({
  head: () => ({ meta: [{ title: "Referrals — TRENDY INVESTMENT AGENCY" }] }),
  component: ReferralsPage,
});

function ReferralsPage() {
  const [code, setCode] = useState("");
  const [count, setCount] = useState(0);
  const [earned, setEarned] = useState(0);
  const [rows, setRows] = useState<{ id: string; amount: number; percent: number; created_at: string }[]>([]);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const [p, r, e] = await Promise.all([
        supabase.from("profiles").select("referral_code, full_name").eq("id", u.user.id).maybeSingle(),
        supabase.from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", u.user.id),
        supabase.from("referral_earnings").select("*").eq("referrer_id", u.user.id).order("created_at", { ascending: false }),
      ]);
      let referralCode = normalizeReferralCode(p.data?.referral_code ?? "");
      if (!referralCode && p.data?.full_name) {
        const { data: generatedCode, error: generationError } = await supabase.rpc("get_or_create_referral_code");
        if (!generationError) referralCode = normalizeReferralCode(generatedCode);
        if (generationError) console.warn("[referrals] failed to persist generated referral code", generationError);
      }
      setCode(referralCode);
      setCount(r.count ?? 0);
      if (e.data) { setRows(e.data); setEarned(e.data.reduce((s, x) => s + Number(x.amount), 0)); }
    })();
  }, []);

  const normalizedCode = normalizeReferralCode(code);
  const link = buildReferralLink(normalizedCode, getSiteUrl() || undefined);
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const visibleRows = useMemo(() => rows.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage), [rows, safePage, rowsPerPage]);

  useEffect(() => {
    setPage(1);
  }, [rowsPerPage]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const copyLink = async () => {
    if (!link) return toast.error("No referral link available yet");
    await navigator.clipboard.writeText(link); toast.success("Referral link copied");
  };
  const copyCode = async () => {
    if (!normalizedCode) return toast.error("No referral code available yet");
    await navigator.clipboard.writeText(normalizedCode); toast.success("Referral code copied");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Referrals</h1>
        <p className="mt-1 text-sm text-muted-foreground">Earn a bonus every time your referrals deposit.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="Referred users" value={String(count)} />
        <Stat icon={Coins} label="Total earned" value={fmt(earned)} />
        <Stat icon={Coins} label="Your code" value={code || "—"} />
      </div>
      <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium">Your referral code</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-md bg-background px-3 py-2 font-mono text-base font-bold text-primary">{code || "—"}</code>
              <button onClick={copyCode} disabled={!code} className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 disabled:opacity-50">
                <Copy className="h-4 w-4" /> Copy code
              </button>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium">Your referral link</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-md bg-background px-3 py-2 font-mono text-sm">{link}</code>
              <button onClick={copyLink} className="inline-flex items-center gap-1.5 rounded-md bg-[image:var(--gradient-gold)] px-4 py-2 text-sm font-semibold text-primary-foreground">
                <Copy className="h-4 w-4" /> Copy link
              </button>
            </div>
          </div>
        </div>
      </div>
      <section>
        <h2 className="text-lg font-semibold">Earnings history</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-border/60 bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-left text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Percent</th><th className="px-4 py-3">Amount</th></tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No referral earnings yet</td></tr>}
                {visibleRows.map(r => (
                  <tr key={r.id} className="border-t border-border/40">
                    <td className="px-4 py-3 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">{r.percent}%</td>
                    <td className="px-4 py-3 font-semibold text-emerald-400">+{fmt(r.amount)}</td>
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
            totalItems={rows.length}
            startIndex={(safePage - 1) * rowsPerPage}
            endIndex={Math.min(safePage * rowsPerPage, rows.length)}
          />
        </div>
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4" /> {label}</div>
      <div className="mt-2 text-xl font-bold">{value}</div>
    </div>
  );
}