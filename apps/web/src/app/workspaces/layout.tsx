import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workspaces - Nexus",
  description: "Manage and collaborate in shared knowledge workspaces",
};

export default function WorkspacesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
