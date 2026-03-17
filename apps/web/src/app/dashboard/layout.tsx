"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";
import { usePathname } from "next/navigation";

function buildBreadcrumbs(pathname: string) {
  const segments = pathname.replace(/^\/dashboard\/?/, "").split("/").filter(Boolean);
  const crumbs = [{ label: "Dashboard", href: "/dashboard" }];

  let path = "/dashboard";
  for (const seg of segments) {
    path += `/${seg}`;
    // Prettify dynamic segments like [id]
    const label = seg.startsWith("[")
      ? seg.slice(1, -1)
      : seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
    crumbs.push({ label, href: path });
  }
  return crumbs;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const breadcrumbs = buildBreadcrumbs(pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
      />

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <TopBar breadcrumbs={breadcrumbs.length > 1 ? breadcrumbs : undefined} />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-6 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
