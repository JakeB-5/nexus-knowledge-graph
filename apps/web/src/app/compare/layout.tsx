import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Compare Nodes - Nexus",
  description: "Compare two knowledge nodes side by side",
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
