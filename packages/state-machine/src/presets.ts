/**
 * Pre-built state machine definitions for common workflows.
 */
import type { BaseEvent, StateMachineDefinition } from "./types.js";

// ─── Document Lifecycle ───────────────────────────────────────────────────────

export interface DocumentContext {
  id: string;
  title: string;
  author: string;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  archivedAt?: number;
  reviewers: string[];
  comments: string[];
}

export type DocumentEvent =
  | { type: "SUBMIT_FOR_REVIEW"; reviewer: string }
  | { type: "APPROVE"; reviewer: string }
  | { type: "REJECT"; reason: string }
  | { type: "PUBLISH" }
  | { type: "ARCHIVE" }
  | { type: "RESTORE" }
  | { type: "ADD_COMMENT"; comment: string };

type DocumentBaseEvent = DocumentEvent & BaseEvent;

export function createDocumentLifecycle(
  initialContext: Partial<DocumentContext> = {}
): StateMachineDefinition<DocumentContext, DocumentBaseEvent> {
  const context: DocumentContext = {
    id: initialContext.id ?? "",
    title: initialContext.title ?? "Untitled",
    author: initialContext.author ?? "unknown",
    createdAt: initialContext.createdAt ?? Date.now(),
    updatedAt: initialContext.updatedAt ?? Date.now(),
    publishedAt: initialContext.publishedAt,
    archivedAt: initialContext.archivedAt,
    reviewers: initialContext.reviewers ?? [],
    comments: initialContext.comments ?? [],
  };

  return {
    id: "document-lifecycle",
    initial: "draft",
    context,
    final: ["archived"],
    states: new Map([
      ["draft", {
        id: "draft",
        type: "initial",
        onEntry: [],
        onExit: [(ctx) => ({ ...ctx, updatedAt: Date.now() })],
      }],
      ["review", {
        id: "review",
        onEntry: [(ctx, evt) => {
          const e = evt as { type: string; reviewer?: string };
          return { ...ctx, reviewers: [...ctx.reviewers, e.reviewer ?? ""], updatedAt: Date.now() };
        }],
        onExit: [],
      }],
      ["published", {
        id: "published",
        onEntry: [(ctx) => ({ ...ctx, publishedAt: Date.now(), updatedAt: Date.now() })],
        onExit: [],
      }],
      ["archived", {
        id: "archived",
        type: "final",
        onEntry: [(ctx) => ({ ...ctx, archivedAt: Date.now(), updatedAt: Date.now() })],
        onExit: [],
      }],
    ]),
    transitions: [
      {
        from: "draft",
        event: "SUBMIT_FOR_REVIEW",
        to: "review",
        guards: [(ctx) => ctx.title.trim().length > 0],
        description: "Submit draft for review (title must not be empty)",
      },
      {
        from: "review",
        event: "APPROVE",
        to: "published",
        actions: [],
        description: "Approve the document",
      },
      {
        from: "review",
        event: "REJECT",
        to: "draft",
        actions: [(ctx, evt) => {
          const e = evt as { type: string; reason?: string };
          return { ...ctx, comments: [...ctx.comments, `Rejected: ${e.reason ?? ""}`] };
        }],
        description: "Reject back to draft",
      },
      {
        from: "published",
        event: "ARCHIVE",
        to: "archived",
        description: "Archive the document",
      },
      {
        from: "draft",
        event: "ARCHIVE",
        to: "archived",
        description: "Archive draft directly",
      },
      {
        from: "review",
        event: "ADD_COMMENT",
        to: "review",
        actions: [(ctx, evt) => {
          const e = evt as { type: string; comment?: string };
          return { ...ctx, comments: [...ctx.comments, e.comment ?? ""] };
        }],
        description: "Add comment during review",
      },
    ],
  };
}

// ─── Node Workflow ────────────────────────────────────────────────────────────

export interface NodeContext {
  id: string;
  label: string;
  type: string;
  createdAt: number;
  activatedAt?: number;
  flaggedAt?: number;
  deletedAt?: number;
  flagReason?: string;
  metadata: Record<string, unknown>;
}

export type NodeEvent =
  | { type: "ACTIVATE" }
  | { type: "FLAG"; reason: string }
  | { type: "UNFLAG" }
  | { type: "DELETE" }
  | { type: "RESTORE" };

type NodeBaseEvent = NodeEvent & BaseEvent;

export function createNodeWorkflow(
  initialContext: Partial<NodeContext> = {}
): StateMachineDefinition<NodeContext, NodeBaseEvent> {
  const context: NodeContext = {
    id: initialContext.id ?? "",
    label: initialContext.label ?? "",
    type: initialContext.type ?? "generic",
    createdAt: initialContext.createdAt ?? Date.now(),
    activatedAt: initialContext.activatedAt,
    flaggedAt: initialContext.flaggedAt,
    deletedAt: initialContext.deletedAt,
    flagReason: initialContext.flagReason,
    metadata: initialContext.metadata ?? {},
  };

  return {
    id: "node-workflow",
    initial: "created",
    context,
    final: ["deleted"],
    states: new Map([
      ["created", { id: "created", type: "initial" }],
      ["active", {
        id: "active",
        onEntry: [(ctx) => ({ ...ctx, activatedAt: Date.now() })],
      }],
      ["flagged", {
        id: "flagged",
        onEntry: [(ctx, evt) => {
          const e = evt as { type: string; reason?: string };
          return { ...ctx, flaggedAt: Date.now(), flagReason: e.reason ?? "" };
        }],
      }],
      ["deleted", {
        id: "deleted",
        type: "final",
        onEntry: [(ctx) => ({ ...ctx, deletedAt: Date.now() })],
      }],
    ]),
    transitions: [
      { from: "created", event: "ACTIVATE", to: "active" },
      { from: "active", event: "FLAG", to: "flagged" },
      { from: "flagged", event: "UNFLAG", to: "active" },
      { from: "flagged", event: "DELETE", to: "deleted" },
      { from: "active", event: "DELETE", to: "deleted" },
      { from: "created", event: "DELETE", to: "deleted" },
    ],
  };
}

// ─── Auth Flow ────────────────────────────────────────────────────────────────

export interface AuthContext {
  userId?: string;
  email?: string;
  token?: string;
  expiresAt?: number;
  loginAttempts: number;
  lastLoginAt?: number;
  errorMessage?: string;
}

export type AuthEvent =
  | { type: "LOGIN"; email: string; password: string }
  | { type: "LOGIN_SUCCESS"; userId: string; token: string; expiresAt: number }
  | { type: "LOGIN_FAILURE"; message: string }
  | { type: "LOGOUT" }
  | { type: "REFRESH"; token: string; expiresAt: number }
  | { type: "EXPIRE" };

type AuthBaseEvent = AuthEvent & BaseEvent;

export function createAuthFlow(
  initialContext: Partial<AuthContext> = {}
): StateMachineDefinition<AuthContext, AuthBaseEvent> {
  const context: AuthContext = {
    userId: initialContext.userId,
    email: initialContext.email,
    token: initialContext.token,
    expiresAt: initialContext.expiresAt,
    loginAttempts: initialContext.loginAttempts ?? 0,
    lastLoginAt: initialContext.lastLoginAt,
    errorMessage: initialContext.errorMessage,
  };

  return {
    id: "auth-flow",
    initial: "unauthenticated",
    context,
    final: [],
    states: new Map([
      ["unauthenticated", {
        id: "unauthenticated",
        type: "initial",
        onEntry: [(ctx) => ({ ...ctx, userId: undefined, token: undefined, expiresAt: undefined })],
      }],
      ["authenticating", {
        id: "authenticating",
        onEntry: [(ctx, evt) => {
          const e = evt as { type: string; email?: string };
          return { ...ctx, email: e.email ?? ctx.email, loginAttempts: ctx.loginAttempts + 1 };
        }],
      }],
      ["authenticated", {
        id: "authenticated",
        onEntry: [(ctx, evt) => {
          const e = evt as { type: string; userId?: string; token?: string; expiresAt?: number };
          return {
            ...ctx,
            userId: e.userId ?? ctx.userId,
            token: e.token ?? ctx.token,
            expiresAt: e.expiresAt ?? ctx.expiresAt,
            lastLoginAt: Date.now(),
            loginAttempts: 0,
            errorMessage: undefined,
          };
        }],
      }],
      ["expired", {
        id: "expired",
        onEntry: [(ctx) => ({ ...ctx, token: undefined })],
      }],
    ]),
    transitions: [
      { from: "unauthenticated", event: "LOGIN", to: "authenticating" },
      { from: "authenticating", event: "LOGIN_SUCCESS", to: "authenticated" },
      {
        from: "authenticating",
        event: "LOGIN_FAILURE",
        to: "unauthenticated",
        actions: [(ctx, evt) => {
          const e = evt as { type: string; message?: string };
          return { ...ctx, errorMessage: e.message ?? "Login failed" };
        }],
      },
      { from: "authenticated", event: "LOGOUT", to: "unauthenticated" },
      {
        from: "authenticated",
        event: "EXPIRE",
        to: "expired",
      },
      {
        from: "authenticated",
        event: "REFRESH",
        to: "authenticated",
        actions: [(ctx, evt) => {
          const e = evt as { type: string; token?: string; expiresAt?: number };
          return { ...ctx, token: e.token ?? ctx.token, expiresAt: e.expiresAt ?? ctx.expiresAt };
        }],
      },
      { from: "expired", event: "LOGIN", to: "authenticating" },
      { from: "expired", event: "LOGOUT", to: "unauthenticated" },
    ],
  };
}

// ─── Import Job ───────────────────────────────────────────────────────────────

export interface ImportJobContext {
  jobId: string;
  filename: string;
  totalRows: number;
  processedRows: number;
  failedRows: number;
  errors: string[];
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
}

export type ImportJobEvent =
  | { type: "START" }
  | { type: "VALIDATION_PASSED"; totalRows: number }
  | { type: "VALIDATION_FAILED"; errors: string[] }
  | { type: "PROGRESS"; processedRows: number; failedRows: number }
  | { type: "COMPLETE" }
  | { type: "FAIL"; errors: string[] }
  | { type: "RETRY" };

type ImportBaseEvent = ImportJobEvent & BaseEvent;

export function createImportJob(
  initialContext: Partial<ImportJobContext> = {}
): StateMachineDefinition<ImportJobContext, ImportBaseEvent> {
  const context: ImportJobContext = {
    jobId: initialContext.jobId ?? "",
    filename: initialContext.filename ?? "",
    totalRows: initialContext.totalRows ?? 0,
    processedRows: initialContext.processedRows ?? 0,
    failedRows: initialContext.failedRows ?? 0,
    errors: initialContext.errors ?? [],
    startedAt: initialContext.startedAt,
    completedAt: initialContext.completedAt,
    failedAt: initialContext.failedAt,
  };

  return {
    id: "import-job",
    initial: "pending",
    context,
    final: ["completed", "failed"],
    states: new Map([
      ["pending", { id: "pending", type: "initial" }],
      ["validating", {
        id: "validating",
        onEntry: [(ctx) => ({ ...ctx, startedAt: Date.now() })],
      }],
      ["importing", {
        id: "importing",
        onEntry: [(ctx, evt) => {
          const e = evt as { type: string; totalRows?: number };
          return { ...ctx, totalRows: e.totalRows ?? ctx.totalRows };
        }],
      }],
      ["completed", {
        id: "completed",
        type: "final",
        onEntry: [(ctx) => ({ ...ctx, completedAt: Date.now() })],
      }],
      ["failed", {
        id: "failed",
        type: "final",
        onEntry: [(ctx, evt) => {
          const e = evt as { type: string; errors?: string[] };
          return { ...ctx, failedAt: Date.now(), errors: [...ctx.errors, ...(e.errors ?? [])] };
        }],
      }],
    ]),
    transitions: [
      { from: "pending", event: "START", to: "validating" },
      {
        from: "validating",
        event: "VALIDATION_PASSED",
        to: "importing",
        actions: [(ctx, evt) => {
          const e = evt as { type: string; totalRows?: number };
          return { ...ctx, totalRows: e.totalRows ?? ctx.totalRows };
        }],
      },
      {
        from: "validating",
        event: "VALIDATION_FAILED",
        to: "failed",
        actions: [(ctx, evt) => {
          const e = evt as { type: string; errors?: string[] };
          return { ...ctx, errors: e.errors ?? [] };
        }],
      },
      {
        from: "importing",
        event: "PROGRESS",
        to: "importing",
        actions: [(ctx, evt) => {
          const e = evt as { type: string; processedRows?: number; failedRows?: number };
          return { ...ctx, processedRows: e.processedRows ?? ctx.processedRows, failedRows: e.failedRows ?? ctx.failedRows };
        }],
      },
      { from: "importing", event: "COMPLETE", to: "completed" },
      {
        from: "importing",
        event: "FAIL",
        to: "failed",
        actions: [(ctx, evt) => {
          const e = evt as { type: string; errors?: string[] };
          return { ...ctx, errors: [...ctx.errors, ...(e.errors ?? [])] };
        }],
      },
      { from: "failed", event: "RETRY", to: "pending",
        actions: [(ctx) => ({ ...ctx, errors: [], processedRows: 0, failedRows: 0, failedAt: undefined })],
      },
    ],
  };
}
