import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, ArrowDownToLine, ArrowUpFromLine, Shield, LogOut, Sparkles, Users, Receipt, User as UserIcon, Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadUnread = () => {
      supabase.from("notifications").select("id", { count: "exact", head: true })
        .is("read_at", null).eq("user_id", user.id)
        .then(({ count }) => setUnread(count ?? 0));
    };
    loadUnread();
    const ch = supabase.channel(`notif-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, loadUnread)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav isAdmin={isAdmin} email={user.email ?? ""} unread={unread} />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function Nav({ isAdmin, email, unread }: { isAdmin: boolean; email: string; unread: number }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/invest", label: "Invest", icon: Sparkles },
    { to: "/deposit", label: "Deposit", icon: ArrowDownToLine },
    { to: "/withdraw", label: "Withdraw", icon: ArrowUpFromLine },
    { to: "/transactions", label: "History", icon: Receipt },
    { to: "/referrals", label: "Referrals", icon: Users },
    { to: "/profile", label: "Profile", icon: UserIcon },
    ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: Shield }] : []),
  ] as const;

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[image:var(--gradient-gold)] font-black text-primary-foreground">T</div>
          <span className="font-bold tracking-wide">TRENDY INVESTMENT AGENCY</span>
        </Link>

        {/* Desktop nav (visible on large screens) */}
        <nav className="hidden lg:flex flex-1 items-center justify-start gap-4 overflow-x-auto">
          {items.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${pathname === to ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
              <Icon className="h-4 w-4 lg:h-5 lg:w-5" />
              <span className="hidden lg:inline">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/notifications" className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{unread > 9 ? "9+" : unread}</span>
            )}
          </Link>

          <span className="hidden text-xs text-muted-foreground lg:inline">{email}</span>

          <button onClick={logout} className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-secondary">
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Log out</span>
          </button>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileOpen(v => !v)} aria-label="Open menu" className="md:hidden inline-flex items-center justify-center rounded-md p-2 border border-border">
            <svg className="h-5 w-5 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
              {mobileOpen ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileOpen && (
        <div className="mobile-menu md:hidden">
          <ul className="flex flex-col gap-1">
            {items.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link to={to} onClick={() => setMobileOpen(false)} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${pathname === to ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>
                  <Icon className="h-4 w-4" /> {label}
                </Link>
              </li>
            ))}
            <li>
              <button onClick={logout} className="w-full text-left rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary">Log out</button>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}