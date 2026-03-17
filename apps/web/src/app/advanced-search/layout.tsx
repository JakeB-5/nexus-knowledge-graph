import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Advanced Search - Nexus",
  description: "Build powerful queries to find exactly what you need",
};

export default function AdvancedSearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
