import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Templates - Nexus",
  description: "Start fast with pre-built knowledge graph templates",
};

export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
