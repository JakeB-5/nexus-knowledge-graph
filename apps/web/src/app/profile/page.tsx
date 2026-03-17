"use client";

import React, { useState } from "react";

const MOCK_ACTIVITY = [
  { id: 1, action: "Created node", target: "Quantum Computing", time: "2 hours ago" },
  { id: 2, action: "Connected", target: "Machine Learning → AI Ethics", time: "5 hours ago" },
  { id: 3, action: "Joined collection", target: "Research Papers", time: "1 day ago" },
  { id: 4, action: "Exported", target: "Philosophy graph (JSON)", time: "2 days ago" },
  { id: 5, action: "Created node", target: "Neural Networks", time: "3 days ago" },
];

export default function ProfilePage() {
  const [name, setName] = useState("Jane Smith");
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(name);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" });
  const [passwordSaved, setPasswordSaved] = useState(false);

  const saveName = () => {
    setName(tempName);
    setEditingName(false);
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    await new Promise((r) => setTimeout(r, 800));
    setPasswordSaved(true);
    setTimeout(() => {
      setChangingPassword(false);
      setPasswordSaved(false);
      setPasswordForm({ current: "", next: "", confirm: "" });
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your account information</p>
        </div>

        {/* Avatar + Identity card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-nexus-500 flex items-center justify-center text-white text-2xl font-bold select-none">
                {name.charAt(0)}
              </div>
              <button className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-white border border-gray-200 rounded-lg shadow-sm flex items-center justify-center hover:bg-gray-50 transition">
                <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            {/* Name / email / role */}
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex items-center gap-2 mb-1">
                  <input
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="text-lg font-semibold text-gray-900 border border-nexus-300 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-nexus-400"
                    autoFocus
                  />
                  <button onClick={saveName} className="text-sm text-white bg-nexus-500 hover:bg-nexus-600 px-3 py-1 rounded-lg transition">Save</button>
                  <button onClick={() => { setEditingName(false); setTempName(name); }} className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1 transition">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
                  <button onClick={() => setEditingName(true)} className="text-gray-400 hover:text-gray-600 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              )}
              <p className="text-gray-500 text-sm">jane.smith@example.com</p>
              <div className="flex items-center gap-3 mt-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-nexus-100 text-nexus-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-nexus-500" />
                  Admin
                </span>
                <span className="text-xs text-gray-400">Member since Jan 15, 2024</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Connected Nodes", value: "1,284" },
            { label: "Collections", value: "12" },
            { label: "Collaborators", value: "8" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
              <p className="text-2xl font-bold text-nexus-600">{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Activity</h3>
          <ul className="space-y-3">
            {MOCK_ACTIVITY.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-nexus-50 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-nexus-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-700">{item.action} </span>
                  <span className="text-sm font-medium text-gray-900">{item.target}</span>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{item.time}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Change password */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">Password</h3>
              <p className="text-xs text-gray-400 mt-0.5">Last changed 3 months ago</p>
            </div>
            {!changingPassword && (
              <button
                onClick={() => setChangingPassword(true)}
                className="text-sm text-nexus-600 hover:text-nexus-800 font-medium transition"
              >
                Change password
              </button>
            )}
          </div>

          {changingPassword && (
            <form onSubmit={savePassword} className="space-y-3">
              {[
                { label: "Current password", key: "current" },
                { label: "New password", key: "next" },
                { label: "Confirm new password", key: "confirm" },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input
                    type="password"
                    value={passwordForm[key as keyof typeof passwordForm]}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, [key]: e.target.value }))}
                    required
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-nexus-400"
                  />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 bg-nexus-500 text-white text-sm rounded-lg hover:bg-nexus-600 transition"
                >
                  {passwordSaved ? "Saved!" : "Update password"}
                </button>
                <button
                  type="button"
                  onClick={() => setChangingPassword(false)}
                  className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100 transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
