"use client";

import React, { useState } from "react";

const INTEGRATIONS = [
  {
    id: "github",
    name: "GitHub",
    description: "Import repositories, issues, pull requests, and code references as knowledge nodes.",
    category: "Development",
    connected: true,
    connectedAs: "sungwon-dev",
    color: "bg-gray-900",
    initials: "GH",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Sync Notion pages and databases as structured knowledge nodes with rich content.",
    category: "Productivity",
    connected: false,
    connectedAs: null,
    color: "bg-gray-800",
    initials: "N",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Capture important conversations and threads as knowledge nodes automatically.",
    category: "Communication",
    connected: true,
    connectedAs: "Nexus Workspace",
    color: "bg-purple-600",
    initials: "SL",
  },
  {
    id: "jira",
    name: "Jira",
    description: "Import epics, stories, and tasks as project nodes with dependency relationships.",
    category: "Project Management",
    connected: false,
    connectedAs: null,
    color: "bg-blue-600",
    initials: "JI",
  },
  {
    id: "gdrive",
    name: "Google Drive",
    description: "Link documents, spreadsheets, and presentations as knowledge nodes.",
    category: "Productivity",
    connected: false,
    connectedAs: null,
    color: "bg-yellow-500",
    initials: "GD",
  },
  {
    id: "confluence",
    name: "Confluence",
    description: "Import wiki pages and documentation spaces into your knowledge graph.",
    category: "Documentation",
    connected: false,
    connectedAs: null,
    color: "bg-blue-500",
    initials: "CF",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Sync Linear issues, projects, and cycles with automatic relationship mapping.",
    category: "Project Management",
    connected: false,
    connectedAs: null,
    color: "bg-indigo-600",
    initials: "LN",
  },
  {
    id: "figma",
    name: "Figma",
    description: "Link design files, frames, and components as visual knowledge nodes.",
    category: "Design",
    connected: false,
    connectedAs: null,
    color: "bg-red-500",
    initials: "FG",
  },
  {
    id: "zapier",
    name: "Zapier",
    description: "Connect any app to Nexus via Zapier automations for flexible workflows.",
    category: "Automation",
    connected: false,
    connectedAs: null,
    color: "bg-orange-500",
    initials: "ZP",
  },
];

const WEBHOOK_EVENTS = [
  { id: "node.created", label: "Node Created", enabled: true },
  { id: "node.updated", label: "Node Updated", enabled: false },
  { id: "node.deleted", label: "Node Deleted", enabled: false },
  { id: "edge.created", label: "Edge Created", enabled: true },
  { id: "member.joined", label: "Member Joined", enabled: false },
  { id: "workspace.updated", label: "Workspace Updated", enabled: false },
];

const CATEGORIES = ["All", "Development", "Productivity", "Communication", "Project Management", "Documentation", "Design", "Automation"];

function ConfigModal({ integration, onClose }: { integration: typeof INTEGRATIONS[0]; onClose: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [step, setStep] = useState<"auth" | "config">("auth");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${integration.color} flex items-center justify-center text-white text-sm font-bold`}>
              {integration.initials}
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Connect {integration.name}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {step === "auth" ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Enter your {integration.name} API key to connect your account.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`${integration.name} API key`}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-nexus-500"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => setStep("config")}
                className="flex-1 px-4 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors"
              >
                Connect
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center">
              Or{" "}
              <button className="text-nexus-600 hover:underline">authorize via OAuth</button>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <p className="text-sm text-green-700 font-medium">Connected successfully</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sync frequency</label>
              <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-nexus-500">
                <option>Real-time</option>
                <option>Every hour</option>
                <option>Every 6 hours</option>
                <option>Daily</option>
              </select>
            </div>
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function IntegrationCard({
  integration,
  onConfigure,
}: {
  integration: typeof INTEGRATIONS[0];
  onConfigure: () => void;
}) {
  const [connected, setConnected] = useState(integration.connected);

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-xl ${integration.color} flex items-center justify-center text-white font-bold text-sm flex-shrink-0`}>
          {integration.initials}
        </div>
        {connected ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-green-700 bg-green-100 px-2.5 py-1 rounded-full font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Not connected
          </span>
        )}
      </div>

      <h3 className="font-semibold text-gray-900 mb-1">{integration.name}</h3>
      <p className="text-gray-500 text-sm line-clamp-2 mb-1">{integration.description}</p>
      {connected && integration.connectedAs && (
        <p className="text-xs text-gray-400 mb-3">
          as <span className="font-medium text-gray-600">{integration.connectedAs}</span>
        </p>
      )}

      {!connected && <div className="mb-3" />}

      <div className="flex gap-2 mt-3">
        {connected ? (
          <>
            <button
              onClick={onConfigure}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors font-medium"
            >
              Configure
            </button>
            <button
              onClick={() => setConnected(false)}
              className="flex-1 px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
            >
              Disconnect
            </button>
          </>
        ) : (
          <button
            onClick={onConfigure}
            className="w-full px-3 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors"
          >
            Connect
          </button>
        )}
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState(WEBHOOK_EVENTS);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  const filtered = INTEGRATIONS.filter(
    (i) => activeCategory === "All" || i.category === activeCategory
  );

  const configuringIntegration = INTEGRATIONS.find((i) => i.id === configuring);

  function toggleWebhookEvent(id: string) {
    setWebhookEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e))
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
          <p className="text-gray-500 text-sm mt-1">
            Connect Nexus with your tools to automatically import and sync knowledge.
          </p>
        </div>

        {/* Connected summary */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-6 flex items-center gap-4">
          <div className="flex -space-x-2">
            {INTEGRATIONS.filter((i) => i.connected).map((i) => (
              <div
                key={i.id}
                className={`w-8 h-8 rounded-full ${i.color} border-2 border-white flex items-center justify-center text-white text-xs font-bold`}
              >
                {i.initials[0]}
              </div>
            ))}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              {INTEGRATIONS.filter((i) => i.connected).length} integrations connected
            </p>
            <p className="text-xs text-gray-400">
              Last synced 5 minutes ago
            </p>
          </div>
          <button className="ml-auto text-sm text-nexus-600 hover:text-nexus-800 font-medium transition-colors">
            Sync Now
          </button>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 flex-wrap mb-5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-nexus-600 text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-nexus-300 hover:text-nexus-700"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Integration Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {filtered.map((integration) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              onConfigure={() => setConfiguring(integration.id)}
            />
          ))}
        </div>

        {/* Webhooks Section */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-5">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Webhook Configuration</h2>
          <p className="text-sm text-gray-400 mb-4">
            Receive real-time events when things change in your workspace.
          </p>
          <div className="flex gap-2 mb-4">
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-nexus-500"
            />
            <button className="px-4 py-2 bg-nexus-600 text-white rounded-lg text-sm font-medium hover:bg-nexus-700 transition-colors">
              Save
            </button>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-3">Trigger on:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {webhookEvents.map((event) => (
              <label key={event.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={event.enabled}
                  onChange={() => toggleWebhookEvent(event.id)}
                  className="accent-nexus-600"
                />
                <span className="text-sm text-gray-600">{event.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* API Keys Section */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">API Keys</h2>
          <p className="text-sm text-gray-400 mb-4">
            Use API keys to access Nexus programmatically from your own applications.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-gray-700">Production API Key</p>
              <p className="text-sm font-mono text-gray-500 mt-0.5">
                {apiKeyVisible ? "nxs_prod_8f3k2m9x1b5v7n0q4w6e" : "nxs_prod_••••••••••••••••••••"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setApiKeyVisible(!apiKeyVisible)}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition-colors"
              >
                {apiKeyVisible ? "Hide" : "Show"}
              </button>
              <button className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-100 transition-colors">
                Copy
              </button>
            </div>
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2 border border-nexus-200 text-nexus-700 rounded-lg text-sm font-medium hover:bg-nexus-50 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Generate New Key
          </button>
        </div>
      </div>

      {configuringIntegration && (
        <ConfigModal
          integration={configuringIntegration}
          onClose={() => setConfiguring(null)}
        />
      )}
    </div>
  );
}
