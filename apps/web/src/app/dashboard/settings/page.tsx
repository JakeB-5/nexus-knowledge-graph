"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { formatDate, cn } from "@/lib/utils";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

const MOCK_KEYS: ApiKey[] = [
  { id: "k1", name: "Production API", prefix: "nxs_prod_", createdAt: "2024-01-15T09:00:00Z", lastUsedAt: new Date(Date.now() - 2 * 3600_000).toISOString() },
  { id: "k2", name: "Development", prefix: "nxs_dev_", createdAt: "2024-03-01T10:00:00Z", lastUsedAt: new Date(Date.now() - 1 * 24 * 3600_000).toISOString() },
  { id: "k3", name: "CI/CD Pipeline", prefix: "nxs_ci_", createdAt: "2024-04-10T14:00:00Z" },
];

export default function SettingsPage() {
  // General settings
  const [siteName, setSiteName] = useState("Nexus Knowledge Graph");
  const [siteDescription, setSiteDescription] = useState("A collaborative knowledge graph platform for teams.");
  const [allowPublicSearch, setAllowPublicSearch] = useState(true);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // API keys
  const [apiKeys, setApiKeys] = useState<ApiKey[]>(MOCK_KEYS);
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  // Danger zone
  const [dangerConfirmOpen, setDangerConfirmOpen] = useState(false);
  const [dangerConfirmText, setDangerConfirmText] = useState("");

  function handleSaveSettings() {
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 3000);
  }

  function handleCreateKey() {
    const mockKey = `nxs_${newKeyName.toLowerCase().replace(/\s+/g, "_")}_${Math.random().toString(36).slice(2, 18)}`;
    setGeneratedKey(mockKey);
    setApiKeys((prev) => [
      ...prev,
      {
        id: `k${Date.now()}`,
        name: newKeyName,
        prefix: mockKey.slice(0, 12) + "…",
        createdAt: new Date().toISOString(),
      },
    ]);
    setNewKeyName("");
  }

  function handleRevokeKey(id: string) {
    setApiKeys((prev) => prev.filter((k) => k.id !== id));
  }

  function handleCopyKey() {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey).catch(() => {});
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  }

  function handleCloseKeyModal() {
    setCreateKeyOpen(false);
    setGeneratedKey(null);
    setNewKeyName("");
    setKeyCopied(false);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your workspace configuration, API access, and data.</p>
      </div>

      {/* General settings */}
      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">General</h2>
          <p className="mt-0.5 text-sm text-gray-500">Basic workspace settings visible to all members.</p>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div>
            <label htmlFor="site-name" className="mb-1.5 block text-sm font-medium text-gray-700">
              Workspace Name
            </label>
            <input
              id="site-name"
              type="text"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
            />
          </div>
          <div>
            <label htmlFor="site-description" className="mb-1.5 block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="site-description"
              rows={3}
              value={siteDescription}
              onChange={(e) => setSiteDescription(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100 resize-none"
            />
            <p className="mt-1 text-xs text-gray-400">{siteDescription.length}/200 characters</p>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Public Search Access</p>
              <p className="text-xs text-gray-500">Allow unauthenticated users to search the graph</p>
            </div>
            <button
              role="switch"
              aria-checked={allowPublicSearch}
              onClick={() => setAllowPublicSearch((v) => !v)}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-nexus-300",
                allowPublicSearch ? "bg-nexus-600" : "bg-gray-300"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                  allowPublicSearch ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveSettings}
              className="rounded-lg bg-nexus-600 px-4 py-2 text-sm font-semibold text-white hover:bg-nexus-700 transition-colors"
            >
              Save Changes
            </button>
            {settingsSaved && (
              <span className="flex items-center gap-1.5 text-sm text-green-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Saved
              </span>
            )}
          </div>
        </div>
      </section>

      {/* API Keys */}
      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">API Keys</h2>
            <p className="mt-0.5 text-sm text-gray-500">Keys for programmatic access to the Nexus API.</p>
          </div>
          <button
            onClick={() => setCreateKeyOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-nexus-600 px-3 py-2 text-sm font-semibold text-white hover:bg-nexus-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Key
          </button>
        </div>

        <div className="divide-y divide-gray-50">
          {apiKeys.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-gray-400">No API keys yet.</div>
          )}
          {apiKeys.map((key) => (
            <div key={key.id} className="flex items-center gap-4 px-6 py-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{key.name}</p>
                <p className="text-xs text-gray-400 font-mono">{key.prefix}••••••••••••</p>
              </div>
              <div className="hidden sm:block text-right">
                <p className="text-xs text-gray-400">Created {formatDate(key.createdAt)}</p>
                {key.lastUsedAt && (
                  <p className="text-xs text-gray-400">Last used {formatDate(key.lastUsedAt)}</p>
                )}
              </div>
              <button
                onClick={() => handleRevokeKey(key.id)}
                className="ml-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors shrink-0"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Backup & Export */}
      <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Backup & Export</h2>
          <p className="mt-0.5 text-sm text-gray-500">Download your knowledge graph data.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export as JSON
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export as CSV
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Export as GraphML
            </button>
          </div>
          <p className="text-xs text-gray-400">Last backup: March 17, 2026 at 03:00 UTC</p>
        </div>
      </section>

      {/* Danger zone */}
      <section className="rounded-xl border border-red-200 bg-white shadow-sm">
        <div className="border-b border-red-100 px-6 py-4">
          <h2 className="text-base font-semibold text-red-700">Danger Zone</h2>
          <p className="mt-0.5 text-sm text-gray-500">Irreversible and destructive actions.</p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-red-100 bg-red-50/40 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">Delete All Data</p>
              <p className="text-xs text-gray-500">Permanently delete all nodes, edges, and associated data. This cannot be undone.</p>
            </div>
            <button
              onClick={() => setDangerConfirmOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              Delete All Data
            </button>
          </div>
        </div>
      </section>

      {/* Create API key modal */}
      <Modal
        open={createKeyOpen}
        onClose={handleCloseKeyModal}
        title={generatedKey ? "API Key Created" : "Create API Key"}
        description={generatedKey ? "Copy your key now — it won't be shown again." : "Give this key a descriptive name."}
        footer={
          generatedKey ? (
            <button
              onClick={handleCloseKeyModal}
              className="rounded-lg bg-nexus-600 px-4 py-2 text-sm font-semibold text-white hover:bg-nexus-700 transition-colors"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={handleCloseKeyModal}
                className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateKey}
                disabled={!newKeyName.trim()}
                className="rounded-lg bg-nexus-600 px-4 py-2 text-sm font-semibold text-white hover:bg-nexus-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Key
              </button>
            </>
          )
        }
      >
        {generatedKey ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 flex items-start gap-2">
              <svg className="h-4 w-4 text-green-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <p className="text-xs text-green-700">Key created successfully. This is the only time you'll see it.</p>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-800 break-all">
                {generatedKey}
              </code>
              <button
                onClick={handleCopyKey}
                className={cn(
                  "shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  keyCopied
                    ? "border-green-300 bg-green-50 text-green-700"
                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                )}
              >
                {keyCopied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="key-name" className="mb-1.5 block text-sm font-medium text-gray-700">
              Key Name <span className="text-red-500">*</span>
            </label>
            <input
              id="key-name"
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Production API, CI/CD Pipeline…"
              autoFocus
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-nexus-400 focus:outline-none focus:ring-2 focus:ring-nexus-100"
            />
          </div>
        )}
      </Modal>

      {/* Danger confirm modal */}
      <Modal
        open={dangerConfirmOpen}
        onClose={() => { setDangerConfirmOpen(false); setDangerConfirmText(""); }}
        title="Delete All Data"
        description="This will permanently delete all nodes, edges, users, and settings."
        size="sm"
        footer={
          <>
            <button
              onClick={() => { setDangerConfirmOpen(false); setDangerConfirmText(""); }}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={dangerConfirmText !== "delete all data"}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              I understand, delete everything
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-xs text-red-700 font-medium">This action is irreversible. All data will be permanently lost.</p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm text-gray-700">
              Type <span className="font-mono font-semibold">delete all data</span> to confirm:
            </label>
            <input
              type="text"
              value={dangerConfirmText}
              onChange={(e) => setDangerConfirmText(e.target.value)}
              placeholder="delete all data"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
