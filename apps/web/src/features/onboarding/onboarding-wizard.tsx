"use client";

import React, { useState } from "react";
import Link from "next/link";

const TOTAL_STEPS = 6;

const USE_CASES = [
  { id: "research", label: "Research", description: "Academic papers, experiments, findings", icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5", color: "border-blue-200 bg-blue-50 text-blue-700" },
  { id: "project", label: "Project Management", description: "Tasks, milestones, dependencies", icon: "M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 004.5 9v.878m13.5-3A2.25 2.25 0 0119.5 9v.878m0 0a2.246 2.246 0 00-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0121 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6c0-.98.626-1.813 1.5-2.122", color: "border-green-200 bg-green-50 text-green-700" },
  { id: "wiki", label: "Personal Wiki", description: "Notes, ideas, bookmarks, references", icon: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25", color: "border-purple-200 bg-purple-50 text-purple-700" },
  { id: "team", label: "Team Knowledge", description: "Shared knowledge, documentation, processes", icon: "M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z", color: "border-orange-200 bg-orange-50 text-orange-700" },
];

const TEMPLATE_CHOICES = [
  { id: "blank", label: "Start Blank", description: "Empty workspace — total freedom", icon: "M12 4.5v15m7.5-7.5h-15", featured: false },
  { id: "research", label: "Research Notes", description: "Papers, concepts, experiments", icon: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5", featured: true },
  { id: "project", label: "Project Management", description: "Tasks, milestones, team", icon: "M6 6.878V6a2.25 2.25 0 012.25-2.25h7.5A2.25 2.25 0 0118 6v.878", featured: false },
  { id: "wiki", label: "Personal Wiki", description: "Notes, links, ideas", icon: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25", featured: false },
];

const NODE_TYPES = ["Concept", "Paper", "Person", "Place", "Event", "Idea", "Tool", "Method"];

interface WizardState {
  name: string;
  useCase: string;
  template: string;
  firstNodeTitle: string;
  firstNodeType: string;
  firstEdgeTarget: string;
  firstEdgeType: string;
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`transition-all duration-300 rounded-full ${
            i < current
              ? "w-6 h-2 bg-nexus-600"
              : i === current
              ? "w-8 h-2 bg-nexus-600"
              : "w-2 h-2 bg-gray-200"
          }`}
        />
      ))}
    </div>
  );
}

function StepWelcome({ state, setState }: { state: WizardState; setState: (s: WizardState) => void }) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 rounded-3xl bg-nexus-600 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-nexus-200">
        <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="3" />
          <path strokeLinecap="round" d="M12 3v2M12 19v2M3 12h2M19 12h2M5.636 5.636l1.414 1.414M16.95 16.95l1.414 1.414M5.636 18.364l1.414-1.414M16.95 7.05l1.414-1.414" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Nexus</h2>
      <p className="text-gray-500 mb-8 max-w-sm mx-auto">
        Let&apos;s set up your knowledge graph in a few quick steps. What should we call you?
      </p>
      <div className="max-w-xs mx-auto">
        <input
          type="text"
          value={state.name}
          onChange={(e) => setState({ ...state, name: e.target.value })}
          placeholder="Your name"
          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm text-center font-medium focus:outline-none focus:border-nexus-500 transition-colors"
          autoFocus
        />
      </div>
    </div>
  );
}

function StepUseCase({ state, setState }: { state: WizardState; setState: (s: WizardState) => void }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1 text-center">What will you use Nexus for?</h2>
      <p className="text-gray-400 text-sm text-center mb-6">We&apos;ll tailor your experience to your needs</p>
      <div className="grid grid-cols-2 gap-3">
        {USE_CASES.map((uc) => (
          <button
            key={uc.id}
            onClick={() => setState({ ...state, useCase: uc.id })}
            className={`p-4 rounded-2xl border-2 text-left transition-all ${
              state.useCase === uc.id
                ? "border-nexus-500 bg-nexus-50 shadow-sm"
                : "border-gray-100 hover:border-gray-200"
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${uc.color}`}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={uc.icon} />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-900">{uc.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{uc.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepTemplate({ state, setState }: { state: WizardState; setState: (s: WizardState) => void }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1 text-center">Start with a template or blank?</h2>
      <p className="text-gray-400 text-sm text-center mb-6">Templates come with pre-built structure</p>
      <div className="space-y-3">
        {TEMPLATE_CHOICES.map((t) => (
          <button
            key={t.id}
            onClick={() => setState({ ...state, template: t.id })}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
              state.template === t.id
                ? "border-nexus-500 bg-nexus-50"
                : "border-gray-100 hover:border-gray-200"
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${state.template === t.id ? "bg-nexus-100" : "bg-gray-100"}`}>
              <svg className={`w-4 h-4 ${state.template === t.id ? "text-nexus-600" : "text-gray-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
              </svg>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-900">{t.label}</p>
                {t.featured && (
                  <span className="text-[10px] bg-nexus-100 text-nexus-700 px-1.5 py-0.5 rounded-full font-semibold">Popular</span>
                )}
              </div>
              <p className="text-xs text-gray-400">{t.description}</p>
            </div>
            {state.template === t.id && (
              <svg className="w-5 h-5 text-nexus-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepFirstNode({ state, setState }: { state: WizardState; setState: (s: WizardState) => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 justify-center mb-1">
        <div className="w-6 h-6 rounded-full bg-nexus-100 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-nexus-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-nexus-600 uppercase tracking-wide">Step: Create First Node</span>
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-1 text-center">Create your first node</h2>
      <p className="text-gray-400 text-sm text-center mb-6">
        A node represents a piece of knowledge — a concept, paper, person, or idea.
      </p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Node Title</label>
          <input
            type="text"
            value={state.firstNodeTitle}
            onChange={(e) => setState({ ...state, firstNodeTitle: e.target.value })}
            placeholder="e.g. Quantum Computing, Project Alpha..."
            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-nexus-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Node Type</label>
          <div className="grid grid-cols-4 gap-2">
            {NODE_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setState({ ...state, firstNodeType: type })}
                className={`py-1.5 px-2 rounded-lg border text-xs font-medium transition-colors ${
                  state.firstNodeType === type
                    ? "border-nexus-500 bg-nexus-50 text-nexus-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>
      {state.firstNodeTitle && (
        <div className="mt-5 p-4 bg-nexus-50 border border-nexus-200 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-nexus-100 flex items-center justify-center">
              <svg className="w-4 h-4 text-nexus-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-nexus-900">{state.firstNodeTitle}</p>
              <p className="text-xs text-nexus-500">{state.firstNodeType || "Concept"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepFirstEdge({ state, setState }: { state: WizardState; setState: (s: WizardState) => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 justify-center mb-1">
        <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
          </svg>
        </div>
        <span className="text-xs font-semibold text-purple-600 uppercase tracking-wide">Step: Create First Edge</span>
      </div>
      <h2 className="text-xl font-bold text-gray-900 mb-1 text-center">Connect it to another node</h2>
      <p className="text-gray-400 text-sm text-center mb-6">
        Edges are the connections that make your knowledge graph powerful.
      </p>

      {/* Source node */}
      <div className="flex items-center gap-3 p-3 bg-nexus-50 border border-nexus-200 rounded-xl mb-3">
        <div className="w-8 h-8 rounded-lg bg-nexus-100 flex items-center justify-center">
          <svg className="w-4 h-4 text-nexus-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <div>
          <p className="text-xs text-nexus-500">From</p>
          <p className="text-sm font-semibold text-nexus-900">{state.firstNodeTitle || "Your first node"}</p>
        </div>
      </div>

      {/* Edge type */}
      <div className="mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-1">Relationship type</label>
        <select
          value={state.firstEdgeType}
          onChange={(e) => setState({ ...state, firstEdgeType: e.target.value })}
          className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-nexus-500"
        >
          <option value="">Select a relationship</option>
          {["Related To", "Builds On", "Cites", "Contradicts", "Supports", "Part Of", "Created By"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Target node */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">To node (title)</label>
        <input
          type="text"
          value={state.firstEdgeTarget}
          onChange={(e) => setState({ ...state, firstEdgeTarget: e.target.value })}
          placeholder="e.g. Machine Learning, Team Alpha..."
          className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-nexus-500 transition-colors"
        />
      </div>

      {state.firstEdgeTarget && state.firstEdgeType && (
        <div className="mt-4 flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
          <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          <p className="text-sm text-green-700">
            <span className="font-semibold">{state.firstNodeTitle}</span>{" "}
            <span className="text-green-500">{state.firstEdgeType.toLowerCase()}</span>{" "}
            <span className="font-semibold">{state.firstEdgeTarget}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function StepComplete({ state }: { state: WizardState }) {
  return (
    <div className="text-center">
      <div className="w-20 h-20 rounded-3xl bg-green-500 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-green-200">
        <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        You&apos;re all set{state.name ? `, ${state.name}` : ""}!
      </h2>
      <p className="text-gray-500 mb-6 max-w-sm mx-auto">
        Your knowledge graph is ready. Head to the explorer to start connecting ideas.
      </p>

      <div className="flex flex-col gap-3 max-w-xs mx-auto mb-6">
        {[
          { label: `Created node: ${state.firstNodeTitle || "First Node"}`, done: !!state.firstNodeTitle },
          { label: `First edge created`, done: !!(state.firstEdgeTarget && state.firstEdgeType) },
          { label: `Workspace set up`, done: true },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${item.done ? "bg-green-500" : "bg-gray-200"}`}>
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <span className="text-sm text-gray-700">{item.label}</span>
          </div>
        ))}
      </div>

      <Link
        href="/visualize"
        className="inline-flex items-center gap-2 px-6 py-3 bg-nexus-600 text-white rounded-xl text-sm font-semibold hover:bg-nexus-700 transition-colors shadow-sm"
      >
        Open Graph Explorer
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
        </svg>
      </Link>
    </div>
  );
}

interface OnboardingWizardProps {
  onComplete?: () => void;
  onSkip?: () => void;
}

export function OnboardingWizard({ onComplete, onSkip }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>({
    name: "",
    useCase: "",
    template: "blank",
    firstNodeTitle: "",
    firstNodeType: "Concept",
    firstEdgeTarget: "",
    firstEdgeType: "",
  });

  const isLast = step === TOTAL_STEPS - 1;

  function canProceed() {
    if (step === 0) return state.name.trim().length > 0;
    if (step === 1) return state.useCase.length > 0;
    if (step === 3) return state.firstNodeTitle.trim().length > 0;
    return true;
  }

  function handleNext() {
    if (isLast) {
      onComplete?.();
      return;
    }
    setStep((s) => s + 1);
  }

  const steps = [
    <StepWelcome key={0} state={state} setState={setState} />,
    <StepUseCase key={1} state={state} setState={setState} />,
    <StepTemplate key={2} state={state} setState={setState} />,
    <StepFirstNode key={3} state={state} setState={setState} />,
    <StepFirstEdge key={4} state={state} setState={setState} />,
    <StepComplete key={5} state={state} />,
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-nexus-50 via-white to-purple-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
        {/* Top bar */}
        <div className="px-8 pt-8 pb-4">
          <div className="flex items-center justify-between mb-6">
            <StepIndicator current={step} total={TOTAL_STEPS} />
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 font-medium">
                {step + 1} / {TOTAL_STEPS}
              </span>
              {step < TOTAL_STEPS - 1 && (
                <button
                  onClick={onSkip}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Skip setup
                </button>
              )}
            </div>
          </div>

          {/* Step content with animated transition */}
          <div className="min-h-[380px] flex flex-col justify-center">
            {steps[step]}
          </div>
        </div>

        {/* Navigation */}
        {step < TOTAL_STEPS - 1 && (
          <div className="px-8 py-5 border-t border-gray-100 flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={!canProceed()}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                canProceed()
                  ? "bg-nexus-600 text-white hover:bg-nexus-700"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {step === TOTAL_STEPS - 2 ? "Finish Setup" : "Continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
