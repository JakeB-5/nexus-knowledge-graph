"use client";

import React, { useState } from "react";
import Link from "next/link";

const WORKSPACE_ID = "1";

const DEFAULT_PERMISSIONS = ["Editor", "Viewer", "No Access"];

function DangerButton({ label, description, action }: { label: string; description: string; action: string }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      {confirming ? (
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
            Confirm {action}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="px-3 py-1.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors whitespace-nowrap"
        >
          {action}
        </button>
      )}
    </div>
  );
}

export default function WorkspaceSettingsPage() {
  const [form, setForm] = useState({
    name: "AI Research Hub",
    description: "Centralized knowledge base for artificial intelligence research papers, experiments, and findings.",
    visibility: "team",
    defaultPermission: "Viewer",
  });
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-400 mb-6">
          <Link href="/workspaces" className="hover:text-nexus-600 transition-colors">Workspaces</Link>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <Link href={`/workspaces/${WORKSPACE_ID}`} className="hover:text-nexus-600 transition-colors">AI Research Hub</Link>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-gray-700 font-medium">Settings</span>
        </nav>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">Workspace Settings</h1>

        {/* General Settings */}
        <section className="bg-white border border-gray-100 rounded-2xl p-6 mb-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">General</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Workspace Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-nexus-500 focus:border-transparent resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">{form.description.length}/500 characters</p>
            </div>
          </div>
        </section>

        {/* Visibility */}
        <section className="bg-white border border-gray-100 rounded-2xl p-6 mb-5">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Visibility</h2>
          <div className="space-y-3">
            {[
              { value: "private", label: "Private", description: "Only invited members can access this workspace.", icon: "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" },
              { value: "team", label: "Team", description: "All members of your organization can view and join.", icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" },
              { value: "public", label: "Public", description: "Anyone with the link can view this workspace.", icon: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" },
            ].map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                  form.visibility === opt.value
                    ? "border-nexus-500 bg-nexus-50"
                    : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={opt.value}
                  checked={form.visibility === opt.value}
                  onChange={() => setForm({ ...form, visibility: opt.value })}
                  className="mt-0.5 accent-nexus-600"
                />
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{opt.description}</p>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Default Permissions */}
        <section className="bg-white border border-gray-100 rounded-2xl p-6 mb-5">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Default Member Permission</h2>
          <p className="text-sm text-gray-400 mb-4">Permission level assigned to new members who join this workspace.</p>
          <select
            value={form.defaultPermission}
            onChange={(e) => setForm({ ...form, defaultPermission: e.target.value })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-nexus-500"
          >
            {DEFAULT_PERMISSIONS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </section>

        {/* Save Button */}
        <div className="flex justify-end mb-8">
          <button
            onClick={handleSave}
            className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              saved
                ? "bg-green-600 text-white"
                : "bg-nexus-600 text-white hover:bg-nexus-700"
            }`}
          >
            {saved ? "Saved!" : "Save Changes"}
          </button>
        </div>

        {/* Danger Zone */}
        <section className="bg-white border border-red-100 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-red-700 mb-1">Danger Zone</h2>
          <p className="text-sm text-gray-400 mb-4">These actions are irreversible. Please proceed with caution.</p>
          <DangerButton
            label="Archive Workspace"
            description="Hide this workspace from all members. Can be restored later."
            action="Archive"
          />
          <DangerButton
            label="Transfer Ownership"
            description="Transfer ownership of this workspace to another member."
            action="Transfer"
          />
          <DangerButton
            label="Delete Workspace"
            description="Permanently delete this workspace and all its nodes, edges, and data."
            action="Delete"
          />
        </section>
      </div>
    </div>
  );
}
