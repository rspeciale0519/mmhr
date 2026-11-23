import { Button } from "@/components/ui/button";
import { AppNav } from "@/designs/cobalt/chrome/AppNav";
import { MobileBar } from "@/designs/cobalt/chrome/MobileBar";
import { CobaltGlows } from "@/designs/cobalt/Glow";
import { requireHomeAccess } from "@/server/auth/page-guards";
import { authorizePermission } from "@/server/auth/authorization";
import { portalPermissions } from "@/server/auth/portal/portal-guards";
import { signOut } from "../../(auth)/actions";
import Link from "next/link";
import { isLaunchAreaEnabled } from "@/lib/launch-surface";

/**
 * The home route is a permission-checked router for authorized users.
 */
export default async function WorkspaceHome() {
  const access = await requireHomeAccess();
  const scope = access.authorization.scope;
  const adminAccess = scope.kind === "platform" ? access.authorization
    : await authorizePermission("admin.access", { kind: "platform" }, { supabase: access.authorization.supabase });
  const [invitationAccess, customerAccess, vendorAccess, memberAccess] = scope.kind === "organization"
    ? await Promise.all([
      authorizePermission("org.members.invite", scope),
      authorizePermission(portalPermissions.customer, scope),
      authorizePermission(portalPermissions.vendor, scope),
      authorizePermission("org.members.view", scope),
    ])
    : [null, null, null, null];

  const stages = [
    { n: "01", title: "Needs list", hint: customerAccess ? "Open intakes" : "Customer only" },
    { n: "02", title: "Masked compare", hint: "After a published comparison" },
    { n: "03", title: "Advisor review", hint: "Staff record disclosure" },
    { n: "04", title: "Contenders", hint: "Up to five" },
    { n: "05", title: "Approved RFP", hint: "Sent by MMHR" },
    { n: "06", title: "Sign direct", hint: "With the provider" },
  ] as const;
  const navItems = [
    { href: "/home", label: "Home" },
    ...(customerAccess ? [{ href: "/customer", label: "Your intakes" }] : []),
    { href: "/workspaces", label: "Workspaces" },
  ];

  return (
    <main className="co-w">
      <CobaltGlows placement="app" />
      <AppNav items={navItems} currentHref="/home" label="Workspace chrome" />
      <h1 className="co-pt" style={{ paddingTop: 40 }}>Workspace</h1>
      <p className="co-ps">
        Your access is active. Only areas available to your account appear here.
      </p>
      {customerAccess ? (
        <div className="co-gl co-stages" style={{ marginTop: 28 }}>
          {stages.map((stage, index) => (
            <div className={index === 0 ? "co-stg co-stg-c" : "co-stg"} key={stage.n}>
              <b>{stage.n}</b>
              <div>
                <h3>{stage.title}</h3>
                <span>{stage.hint}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="co-wg">
        <div className="co-gl co-card">
          <h3>Workspace areas</h3>
          {access.authorization.scope.kind === "organization" ? (
            <nav aria-label="Workspace areas" className="flex flex-col gap-2 text-sm">
              {isLaunchAreaEnabled("documents") && <Link className="inline-flex min-h-11 items-center underline" href="/documents">Workspace documents</Link>}
              {customerAccess && <Link className="inline-flex min-h-11 items-center underline" href="/customer">Customer portal</Link>}
              {vendorAccess && <Link className="inline-flex min-h-11 items-center underline" href="/vendor">Vendor portal</Link>}
              {invitationAccess && <Link className="inline-flex min-h-11 items-center underline" href="/invitations/new">Invite a member</Link>}
              {memberAccess && <Link className="inline-flex min-h-11 items-center underline" href="/invitations">Manage invitations</Link>}
              {memberAccess && <Link className="inline-flex min-h-11 items-center underline" href="/members">Manage members</Link>}
              {adminAccess && <Link className="inline-flex min-h-11 items-center underline" href="/admin">Administration</Link>}
            </nav>
          ) : (
            <Link className="text-sm underline" href="/admin">Administration</Link>
          )}
          <Link href="/workspaces" className="mt-4 inline-flex min-h-11 w-fit items-center text-sm underline underline-offset-4">
            Change workspace
          </Link>
        </div>
        <div className="co-gl co-card">
          <h3>Session</h3>
          <p className="co-ps" style={{ marginTop: 0 }}>Sign out ends this session on this device.</p>
          <form action={signOut} style={{ marginTop: 18 }}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
        {customerAccess ? (
          <div className="co-callc">
            <span className="co-lbl">Next</span>
            <h3>Needs list</h3>
            <p>Describe your software needs. Vendor names stay hidden until advisor review.</p>
            <Link className="co-btn" href="/customer" style={{ marginTop: 20, background: "#fff", color: "var(--co-navy)", width: "100%" }}>
              Open intakes
            </Link>
          </div>
        ) : null}
      </div>
      <MobileBar items={navItems} currentHref="/home" />
    </main>
  );
}
