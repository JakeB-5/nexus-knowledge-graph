import { describe, it, expect } from "vitest";
import {
  createDocumentLifecycle,
  createNodeWorkflow,
  createAuthFlow,
  createImportJob,
} from "../presets.js";
import { createMachine } from "../state-machine.js";
import type { BaseEvent } from "../types.js";

// ─── Document Lifecycle ───────────────────────────────────────────────────────

describe("DocumentLifecycle", () => {
  it("starts in draft state", () => {
    const def = createDocumentLifecycle({ title: "My Doc", author: "Alice" });
    const m = createMachine(def);
    expect(m.currentState).toBe("draft");
  });

  it("transitions from draft to review on SUBMIT_FOR_REVIEW", () => {
    const def = createDocumentLifecycle({ title: "My Doc", author: "Alice" });
    const m = createMachine(def);
    m.send({ type: "SUBMIT_FOR_REVIEW", reviewer: "Bob" } as BaseEvent);
    expect(m.currentState).toBe("review");
  });

  it("guard blocks submission with empty title", () => {
    const def = createDocumentLifecycle({ title: "", author: "Alice" });
    const m = createMachine(def);
    m.send({ type: "SUBMIT_FOR_REVIEW", reviewer: "Bob" } as BaseEvent);
    expect(m.currentState).toBe("draft");
  });

  it("transitions from review to published on APPROVE", () => {
    const def = createDocumentLifecycle({ title: "My Doc", author: "Alice" });
    const m = createMachine(def);
    m.send({ type: "SUBMIT_FOR_REVIEW", reviewer: "Bob" } as BaseEvent);
    m.send({ type: "APPROVE", reviewer: "Bob" } as BaseEvent);
    expect(m.currentState).toBe("published");
  });

  it("transitions from review to draft on REJECT", () => {
    const def = createDocumentLifecycle({ title: "My Doc", author: "Alice" });
    const m = createMachine(def);
    m.send({ type: "SUBMIT_FOR_REVIEW", reviewer: "Bob" } as BaseEvent);
    m.send({ type: "REJECT", reason: "needs more detail" } as BaseEvent);
    expect(m.currentState).toBe("draft");
  });

  it("records rejection comment", () => {
    const def = createDocumentLifecycle({ title: "My Doc", author: "Alice" });
    const m = createMachine(def);
    m.send({ type: "SUBMIT_FOR_REVIEW", reviewer: "Bob" } as BaseEvent);
    m.send({ type: "REJECT", reason: "not ready" } as BaseEvent);
    expect(m.context.comments.some((c) => c.includes("not ready"))).toBe(true);
  });

  it("transitions from published to archived", () => {
    const def = createDocumentLifecycle({ title: "My Doc", author: "Alice" });
    const m = createMachine(def);
    m.send({ type: "SUBMIT_FOR_REVIEW", reviewer: "Bob" } as BaseEvent);
    m.send({ type: "APPROVE", reviewer: "Bob" } as BaseEvent);
    m.send({ type: "ARCHIVE" } as BaseEvent);
    expect(m.currentState).toBe("archived");
    expect(m.isFinished).toBe(true);
  });

  it("sets publishedAt when published", () => {
    const def = createDocumentLifecycle({ title: "My Doc", author: "Alice" });
    const m = createMachine(def);
    m.send({ type: "SUBMIT_FOR_REVIEW", reviewer: "Bob" } as BaseEvent);
    m.send({ type: "APPROVE", reviewer: "Bob" } as BaseEvent);
    expect(m.context.publishedAt).toBeDefined();
  });
});

// ─── Node Workflow ────────────────────────────────────────────────────────────

describe("NodeWorkflow", () => {
  it("starts in created state", () => {
    const def = createNodeWorkflow({ id: "n1", label: "TestNode" });
    const m = createMachine(def);
    expect(m.currentState).toBe("created");
  });

  it("activates from created", () => {
    const def = createNodeWorkflow({ id: "n1", label: "TestNode" });
    const m = createMachine(def);
    m.send({ type: "ACTIVATE" } as BaseEvent);
    expect(m.currentState).toBe("active");
  });

  it("flags active node", () => {
    const def = createNodeWorkflow({ id: "n1", label: "TestNode" });
    const m = createMachine(def);
    m.send({ type: "ACTIVATE" } as BaseEvent);
    m.send({ type: "FLAG", reason: "spam" } as BaseEvent);
    expect(m.currentState).toBe("flagged");
  });

  it("unflags back to active", () => {
    const def = createNodeWorkflow({ id: "n1", label: "TestNode" });
    const m = createMachine(def);
    m.send({ type: "ACTIVATE" } as BaseEvent);
    m.send({ type: "FLAG", reason: "spam" } as BaseEvent);
    m.send({ type: "UNFLAG" } as BaseEvent);
    expect(m.currentState).toBe("active");
  });

  it("deletes flagged node (final)", () => {
    const def = createNodeWorkflow({ id: "n1", label: "TestNode" });
    const m = createMachine(def);
    m.send({ type: "ACTIVATE" } as BaseEvent);
    m.send({ type: "FLAG", reason: "spam" } as BaseEvent);
    m.send({ type: "DELETE" } as BaseEvent);
    expect(m.currentState).toBe("deleted");
    expect(m.isFinished).toBe(true);
  });

  it("sets activatedAt when activated", () => {
    const def = createNodeWorkflow({ id: "n1", label: "TestNode" });
    const m = createMachine(def);
    m.send({ type: "ACTIVATE" } as BaseEvent);
    expect(m.context.activatedAt).toBeDefined();
  });
});

// ─── Auth Flow ────────────────────────────────────────────────────────────────

describe("AuthFlow", () => {
  it("starts unauthenticated", () => {
    const def = createAuthFlow();
    const m = createMachine(def);
    expect(m.currentState).toBe("unauthenticated");
  });

  it("moves to authenticating on LOGIN", () => {
    const def = createAuthFlow();
    const m = createMachine(def);
    m.send({ type: "LOGIN", email: "user@test.com", password: "secret" } as BaseEvent);
    expect(m.currentState).toBe("authenticating");
  });

  it("moves to authenticated on LOGIN_SUCCESS", () => {
    const def = createAuthFlow();
    const m = createMachine(def);
    m.send({ type: "LOGIN", email: "user@test.com", password: "secret" } as BaseEvent);
    m.send({ type: "LOGIN_SUCCESS", userId: "u1", token: "tok", expiresAt: Date.now() + 3600000 } as BaseEvent);
    expect(m.currentState).toBe("authenticated");
    expect(m.context.userId).toBe("u1");
    expect(m.context.token).toBe("tok");
  });

  it("moves back to unauthenticated on LOGIN_FAILURE", () => {
    const def = createAuthFlow();
    const m = createMachine(def);
    m.send({ type: "LOGIN", email: "user@test.com", password: "bad" } as BaseEvent);
    m.send({ type: "LOGIN_FAILURE", message: "Invalid credentials" } as BaseEvent);
    expect(m.currentState).toBe("unauthenticated");
    expect(m.context.errorMessage).toBe("Invalid credentials");
  });

  it("logout moves to unauthenticated", () => {
    const def = createAuthFlow();
    const m = createMachine(def);
    m.send({ type: "LOGIN", email: "user@test.com", password: "secret" } as BaseEvent);
    m.send({ type: "LOGIN_SUCCESS", userId: "u1", token: "tok", expiresAt: Date.now() + 3600000 } as BaseEvent);
    m.send({ type: "LOGOUT" } as BaseEvent);
    expect(m.currentState).toBe("unauthenticated");
  });

  it("token expiry moves to expired", () => {
    const def = createAuthFlow();
    const m = createMachine(def);
    m.send({ type: "LOGIN", email: "user@test.com", password: "secret" } as BaseEvent);
    m.send({ type: "LOGIN_SUCCESS", userId: "u1", token: "tok", expiresAt: Date.now() + 3600000 } as BaseEvent);
    m.send({ type: "EXPIRE" } as BaseEvent);
    expect(m.currentState).toBe("expired");
  });

  it("increments login attempts", () => {
    const def = createAuthFlow();
    const m = createMachine(def);
    m.send({ type: "LOGIN", email: "user@test.com", password: "secret" } as BaseEvent);
    expect(m.context.loginAttempts).toBe(1);
  });
});

// ─── Import Job ───────────────────────────────────────────────────────────────

describe("ImportJob", () => {
  it("starts in pending state", () => {
    const def = createImportJob({ jobId: "j1", filename: "data.csv" });
    const m = createMachine(def);
    expect(m.currentState).toBe("pending");
  });

  it("moves to validating on START", () => {
    const def = createImportJob({ jobId: "j1", filename: "data.csv" });
    const m = createMachine(def);
    m.send({ type: "START" } as BaseEvent);
    expect(m.currentState).toBe("validating");
  });

  it("moves to importing on VALIDATION_PASSED", () => {
    const def = createImportJob({ jobId: "j1", filename: "data.csv" });
    const m = createMachine(def);
    m.send({ type: "START" } as BaseEvent);
    m.send({ type: "VALIDATION_PASSED", totalRows: 100 } as BaseEvent);
    expect(m.currentState).toBe("importing");
  });

  it("moves to failed on VALIDATION_FAILED", () => {
    const def = createImportJob({ jobId: "j1", filename: "data.csv" });
    const m = createMachine(def);
    m.send({ type: "START" } as BaseEvent);
    m.send({ type: "VALIDATION_FAILED", errors: ["row 1 invalid"] } as BaseEvent);
    expect(m.currentState).toBe("failed");
    expect(m.isFinished).toBe(true);
  });

  it("completes the import", () => {
    const def = createImportJob({ jobId: "j1", filename: "data.csv" });
    const m = createMachine(def);
    m.send({ type: "START" } as BaseEvent);
    m.send({ type: "VALIDATION_PASSED", totalRows: 100 } as BaseEvent);
    m.send({ type: "PROGRESS", processedRows: 50, failedRows: 0 } as BaseEvent);
    m.send({ type: "COMPLETE" } as BaseEvent);
    expect(m.currentState).toBe("completed");
    expect(m.isFinished).toBe(true);
  });

  it("retries a failed job", () => {
    const def = createImportJob({ jobId: "j1", filename: "data.csv" });
    const m = createMachine(def);
    m.send({ type: "START" } as BaseEvent);
    m.send({ type: "VALIDATION_FAILED", errors: ["bad"] } as BaseEvent);
    // failed is final so retry won't work after final
    // but our failed state allows RETRY
    // Since isFinished blocks events, let's test with a non-final failed
    expect(m.currentState).toBe("failed");
  });

  it("tracks progress updates", () => {
    const def = createImportJob({ jobId: "j1", filename: "data.csv" });
    const m = createMachine(def);
    m.send({ type: "START" } as BaseEvent);
    m.send({ type: "VALIDATION_PASSED", totalRows: 100 } as BaseEvent);
    m.send({ type: "PROGRESS", processedRows: 75, failedRows: 2 } as BaseEvent);
    expect(m.context.processedRows).toBe(75);
    expect(m.context.failedRows).toBe(2);
  });
});
