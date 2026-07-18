import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — TRENDY INVESTMENT AGENCY" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const [form, setForm] = useState({ full_name: "", username: "", phone: "", country: "", address: "" });
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
      const { data } = await supabase.from("profiles").select("full_name,username,phone,country,address").eq("id", u.user.id).maybeSingle();
      if (data) setForm({
        full_name: data.full_name ?? "", username: data.username ?? "",
        phone: data.phone ?? "", country: data.country ?? "", address: data.address ?? ""
      });
    })();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("profiles").update(form).eq("id", u.user.id);
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  };

  const changePwd = async () => {
    if (pwd.length < 6) return toast.error("Password must be at least 6 characters");
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) return toast.error(error.message);
    setPwd(""); toast.success("Password updated");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account details.</p>
      </div>
      <form onSubmit={save} className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
        <Field label="Email" value={email} onChange={() => {}} disabled />
        <Field label="Full name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} />
        <Field label="Username" value={form.username} onChange={(v) => setForm({ ...form, username: v })} />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label="Country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} />
        <Field label="Address" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
        <button disabled={loading} className="rounded-md bg-[image:var(--gradient-gold)] px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-gold)] disabled:opacity-60">
          {loading ? "Saving…" : "Save changes"}
        </button>
      </form>
      <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-6">
        <h2 className="text-lg font-semibold">Change password</h2>
        <Field label="New password" type="password" value={pwd} onChange={setPwd} />
        <button type="button" onClick={changePwd} className="rounded-md border border-primary px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10">
          Update password
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", disabled }: { label: string; value: string; onChange: (v: string) => void; type?: string; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-60" />
    </label>
  );
}