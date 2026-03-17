"use client";

import React, { useState } from "react";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? "bg-nexus-500" : "bg-gray-200"}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4.5" : "translate-x-0.5"}`}
        style={{ transform: checked ? "translateX(18px)" : "translateX(2px)" }}
      />
    </button>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="mb-5">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

const MOCK_TOKENS = [
  { id: "t1", name: "CLI access", created: "Jan 10, 2024", lastUsed: "2 days ago" },
  { id: "t2", name: "VS Code extension", created: "Feb 3, 2024", lastUsed: "1 hour ago" },
];

export default function SettingsPage() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [defaultView, setDefaultView] = useState<"graph" | "list" | "table">("graph");
  const [notifications, setNotifications] = useState({
    mentions: true,
    comments: true,
    nodeUpdates: false,
    weeklyDigest: true,
    collaboratorActivity: false,
  });
  const [tokens, setTokens] = useState(MOCK_TOKENS);
  const [newTokenName, setNewTokenName] = useState("");
  const [showNewToken, setShowNewToken] = useState(false);
  const [generatedToken, setGeneratedToken] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const toggleNotification = (key: keyof typeof notifications) =>
    setNotifications((n) => ({ ...n, [key]: !n[key] }));

  const generateToken = () => {
    if (!newTokenName.trim()) return;
    const token = "nxs_" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    setGeneratedToken(token);
    setTokens((t) => [
      ...t,
      { id: Date.now().toString(), name: newTokenName, created: "Just now", lastUsed: "Never" },
    ]);
    setNewTokenName("");
  };

  const revokeToken = (id: string) => setTokens((t) => t.filter((tk) => tk.id !== id));

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Customize your Nexus experience</p>
        </div>

        {/* Appearance */}
        <Section title="Appearance" description="Customize how Nexus looks">
          <SettingRow label="Theme" description="Choose your preferred color scheme">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(["light", "dark", "system"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition capitalize ${theme === t ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </SettingRow>
          <SettingRow label="Default graph view" description="How nodes are displayed by default">
            <select
              value={defaultView}
              onChange={(e) => setDefaultView(e.target.value as typeof defaultView)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-nexus-400 text-gray-700"
            >
              <option value="graph">Graph</option>
              <option value="list">List</option>
              <option value="table">Table</option>
            </select>
          </SettingRow>
        </Section>

        {/* Notifications */}
        <Section title="Notifications" description="Control when and how you receive notifications">
          {[
            { key: "mentions" as const, label: "Mentions", desc: "When someone @mentions you" },
            { key: "comments" as const, label: "Comments", desc: "New comments on your nodes" },
            { key: "nodeUpdates" as const, label: "Node updates", desc: "When watched nodes change" },
            { key: "weeklyDigest" as const, label: "Weekly digest", desc: "Summary of graph activity" },
            { key: "collaboratorActivity" as const, label: "Collaborator activity", desc: "When collaborators add nodes" },
          ].map(({ key, label, desc }) => (
            <SettingRow key={key} label={label} description={desc}>
              <Toggle checked={notifications[key]} onChange={() => toggleNotification(key)} />
            </SettingRow>
          ))}
        </Section>

        {/* API Keys */}
        <Section title="API Keys" description="Personal access tokens for programmatic access">
          <div className="space-y-3 mb-4">
            {tokens.map((token) => (
              <div key={token.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-8 h-8 rounded-lg bg-nexus-100 flex items-center justify-center">
                  <svg className="w-4 h-4 text-nexus-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{token.name}</p>
                  <p className="text-xs text-gray-400">Created {token.created} · Last used {token.lastUsed}</p>
                </div>
                <button
                  onClick={() => revokeToken(token.id)}
                  className="text-xs text-red-500 hover:text-red-700 transition px-2 py-1 rounded hover:bg-red-50"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>

          {generatedToken && (
            <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200">
              <p className="text-xs text-green-700 font-medium mb-1">Token generated — copy it now, it won&apos;t be shown again</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-green-800 bg-green-100 px-2 py-1 rounded truncate">{generatedToken}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(generatedToken); }}
                  className="text-xs text-green-700 hover:text-green-900 transition"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {showNewToken ? (
            <div className="flex gap-2">
              <input
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="Token name (e.g. CI/CD)"
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-nexus-400"
              />
              <button onClick={generateToken} className="px-4 py-2 bg-nexus-500 text-white text-sm rounded-lg hover:bg-nexus-600 transition">
                Generate
              </button>
              <button onClick={() => setShowNewToken(false)} className="px-3 py-2 text-gray-500 text-sm rounded-lg hover:bg-gray-100 transition">
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setShowNewToken(true); setGeneratedToken(""); }}
              className="flex items-center gap-2 text-sm text-nexus-600 hover:text-nexus-800 font-medium transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Generate new token
            </button>
          )}
        </Section>

        {/* Data */}
        <Section title="Data & Privacy">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-gray-700">Export my data</p>
              <p className="text-xs text-gray-400 mt-0.5">Download all your nodes, edges, and metadata</p>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
          </div>
        </Section>

        {/* Danger zone */}
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-red-700 mb-1">Danger Zone</h3>
          <p className="text-xs text-gray-400 mb-4">These actions are irreversible. Proceed with caution.</p>
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg hover:bg-red-100 transition"
            >
              Delete account
            </button>
          ) : (
            <div className="p-4 bg-red-50 rounded-xl border border-red-200">
              <p className="text-sm text-red-700 font-medium mb-1">Are you absolutely sure?</p>
              <p className="text-xs text-red-500 mb-4">This will permanently delete your account and all associated data. This cannot be undone.</p>
              <div className="flex gap-2">
                <button className="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition">
                  Yes, delete my account
                </button>
                <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100 transition">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
