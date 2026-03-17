import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Integrations - Nexus",
  description: "Connect Nexus with your favorite tools and services",
};

export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
