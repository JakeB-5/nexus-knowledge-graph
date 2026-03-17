"use client";

import React, { useState, useRef } from "react";

const STEPS = ["Format", "Upload", "Configure", "Review", "Import"];

const FORMATS = [
  { id: "markdown", label: "Markdown", ext: ".md", icon: "M" },
  { id: "csv", label: "CSV", ext: ".csv", icon: "C" },
  { id: "json", label: "JSON", ext: ".json", icon: "J" },
  { id: "html", label: "HTML", ext: ".html", icon: "H" },
];

const MOCK_PREVIEW = [
  { title: "Introduction to AI", type: "Article", tags: "ai, ml" },
  { title: "Neural Networks 101", type: "Note", tags: "ml, deep-learning" },
  { title: "Ethics in Technology", type: "Article", tags: "ethics, tech" },
  { title: "Graph Theory Basics", type: "Note", tags: "math, graphs" },
];

const CSV_COLUMNS = ["title", "type", "tags", "content", "url"];

export default function ImportPage() {
  const [step, setStep] = useState(0);
  const [format, setFormat] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({
    title: "title", type: "type", tags: "tags",
  });
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const runImport = async () => {
    setImporting(true);
    for (let i = 0; i <= 100; i += 10) {
      await new Promise((r) => setTimeout(r, 150));
      setProgress(i);
    }
    setImporting(false);
    setDone(true);
  };

  const canNext = () => {
    if (step === 0) return !!format;
    if (step === 1) return !!file;
    return true;
  };

  const reset = () => {
    setStep(0); setFormat(""); setFile(null);
    setProgress(0); setDone(false); setImporting(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Import</h1>
          <p className="text-gray-500 text-sm mt-1">Bring your existing knowledge into Nexus</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center mb-8">
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition ${
                  i < step ? "bg-nexus-500 text-white" : i === step ? "bg-nexus-100 text-nexus-700 ring-2 ring-nexus-500" : "bg-gray-100 text-gray-400"
                }`}>
                  {i < step ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${i === step ? "text-gray-900" : "text-gray-400"}`}>{s}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 transition ${i < step ? "bg-nexus-500" : "bg-gray-200"}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {/* Step 0: Format */}
          {step === 0 && (
            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-1">Select format</h2>
              <p className="text-sm text-gray-400 mb-5">What type of files are you importing?</p>
              <div className="grid grid-cols-2 gap-3">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={`p-4 rounded-xl border-2 text-left transition ${format === f.id ? "border-nexus-500 bg-nexus-50" : "border-gray-100 hover:border-gray-200"}`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold mb-3 ${format === f.id ? "bg-nexus-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                      {f.icon}
                    </div>
                    <p className="text-sm font-semibold text-gray-800">{f.label}</p>
                    <p className="text-xs text-gray-400">{f.ext} files</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Upload */}
          {step === 1 && (
            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-1">Upload file</h2>
              <p className="text-sm text-gray-400 mb-5">Drop your {format.toUpperCase()} file here</p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${dragging ? "border-nexus-400 bg-nexus-50" : file ? "border-green-300 bg-green-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}
              >
                <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />
                {file ? (
                  <>
                    <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-800">{file.name}</p>
                    <p className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-700">Drop file here or click to browse</p>
                    <p className="text-xs text-gray-400 mt-1">Supports {format.toUpperCase()} files up to 50MB</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Configure */}
          {step === 2 && (
            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-1">Configure mapping</h2>
              <p className="text-sm text-gray-400 mb-5">Map your columns to Nexus fields</p>
              <div className="space-y-3">
                {Object.entries(columnMap).map(([field, col]) => (
                  <div key={field} className="flex items-center gap-3">
                    <div className="w-28 text-sm font-medium text-gray-700 capitalize">{field}</div>
                    <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <select
                      value={col}
                      onChange={(e) => setColumnMap((m) => ({ ...m, [field]: e.target.value }))}
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-nexus-400"
                    >
                      {CSV_COLUMNS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div>
              <h2 className="text-base font-semibold text-gray-800 mb-1">Review data</h2>
              <p className="text-sm text-gray-400 mb-5">Previewing {MOCK_PREVIEW.length} nodes to import</p>
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Title", "Type", "Tags"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {MOCK_PREVIEW.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-800 font-medium">{row.title}</td>
                        <td className="px-4 py-2.5 text-gray-500">{row.type}</td>
                        <td className="px-4 py-2.5">
                          {row.tags.split(", ").map((t) => (
                            <span key={t} className="inline-block px-2 py-0.5 bg-nexus-50 text-nexus-600 rounded text-xs mr-1">{t}</span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 4: Import */}
          {step === 4 && (
            <div className="text-center py-4">
              {done ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-1">Import complete!</h3>
                  <p className="text-gray-400 text-sm mb-2">{MOCK_PREVIEW.length} nodes added to your graph</p>
                  <p className="text-gray-400 text-sm mb-6">0 errors · 0 duplicates skipped</p>
                  <div className="flex gap-3 justify-center">
                    <button onClick={reset} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition">
                      Import more
                    </button>
                    <button className="px-4 py-2 text-sm bg-nexus-500 text-white rounded-lg hover:bg-nexus-600 transition">
                      View in graph
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-base font-semibold text-gray-800 mb-4">Importing {MOCK_PREVIEW.length} nodes...</h3>
                  {importing ? (
                    <div className="mb-6">
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full bg-nexus-500 rounded-full transition-all duration-150"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-sm text-gray-400">{progress}% complete</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 mb-6">Ready to import. Click the button below to start.</p>
                  )}
                  {!importing && (
                    <button onClick={runImport} className="px-6 py-2.5 bg-nexus-500 text-white text-sm font-medium rounded-lg hover:bg-nexus-600 transition">
                      Start import
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Navigation */}
          {!done && (
            <div className="flex justify-between mt-6 pt-5 border-t border-gray-100">
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back
              </button>
              {step < STEPS.length - 1 && (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!canNext()}
                  className="px-5 py-2 text-sm bg-nexus-500 text-white font-medium rounded-lg hover:bg-nexus-600 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5"
                >
                  Continue
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
