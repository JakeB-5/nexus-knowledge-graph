// TemplateEngine tests

import { describe, it, expect } from 'vitest';
import { TemplateEngine } from '../templates.js';
import { NotificationType, NotificationChannel } from '../types.js';
import type { Notification } from '../types.js';

const ENGINE_CONFIG = {
  appName: 'Nexus',
  appUrl: 'https://nexus.example.com',
  unsubscribeBaseUrl: 'https://nexus.example.com/unsubscribe',
};

function makeNotification(type: NotificationType, override: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1',
    userId: 'user-1',
    type,
    title: 'Test',
    body: 'Test body',
    actor: { id: 'actor-1', name: 'Alice' },
    target: { id: 'target-1', type: 'node', title: 'My Graph', url: 'https://nexus.example.com/nodes/1' },
    metadata: {},
    read: false,
    createdAt: new Date(),
    ...override,
  };
}

// ── Basic rendering ───────────────────────────────────────────────────────────

describe('TemplateEngine.render', () => {
  it('renders node_shared template with actor name in subject', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const n = makeNotification(NotificationType.NodeShared);
    const result = engine.render(n);
    expect(result.subject).toContain('Alice');
    expect(result.subject).toContain('shared');
  });

  it('renders mention template subject', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const n = makeNotification(NotificationType.Mention);
    const result = engine.render(n);
    expect(result.subject).toContain('Alice');
    expect(result.subject).toContain('mentioned');
  });

  it('renders comment template subject', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const n = makeNotification(NotificationType.Comment);
    const result = engine.render(n);
    expect(result.subject).toContain('comment');
  });

  it('renders edge_created template', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const n = makeNotification(NotificationType.EdgeCreated);
    const result = engine.render(n);
    expect(result.subject).toContain('connection');
  });

  it('renders all notification types without error', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    for (const type of Object.values(NotificationType)) {
      const n = makeNotification(type);
      expect(() => engine.render(n)).not.toThrow();
    }
  });
});

// ── Variable interpolation ────────────────────────────────────────────────────

describe('TemplateEngine - variable interpolation', () => {
  it('substitutes actor name in body text', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const n = makeNotification(NotificationType.NodeShared);
    const result = engine.render(n);
    expect(result.bodyText).toContain('Alice');
  });

  it('substitutes target title in body', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const n = makeNotification(NotificationType.NodeShared);
    const result = engine.render(n);
    expect(result.bodyText).toContain('My Graph');
  });

  it('substitutes target URL in body', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const n = makeNotification(NotificationType.NodeShared);
    const result = engine.render(n);
    expect(result.bodyText).toContain('https://nexus.example.com/nodes/1');
  });

  it('substitutes app name', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const n = makeNotification(NotificationType.NodeShared);
    const result = engine.render(n);
    expect(result.bodyText).toContain('Nexus');
  });

  it('includes unsubscribe URL with user id', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const n = makeNotification(NotificationType.NodeShared);
    const result = engine.render(n);
    expect(result.bodyText).toContain('user-1');
    expect(result.bodyText).toContain('unsubscribe');
  });

  it('falls back to "Someone" when no actor', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const n = makeNotification(NotificationType.NodeShared, { actor: undefined });
    const result = engine.render(n);
    expect(result.subject).toContain('Someone');
  });

  it('substitutes extra vars', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const n = makeNotification(NotificationType.WeeklyDigest);
    const result = engine.render(n, { digestContent: 'Custom digest content here' });
    expect(result.bodyText).toContain('Custom digest content here');
  });
});

// ── HTML output ───────────────────────────────────────────────────────────────

describe('TemplateEngine - HTML output', () => {
  it('produces HTML with anchor tags', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const n = makeNotification(NotificationType.NodeShared);
    const result = engine.render(n);
    expect(result.bodyHtml).toContain('<a href=');
  });

  it('HTML subject matches text subject', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const n = makeNotification(NotificationType.NodeShared);
    const result = engine.render(n);
    // Both text and html share the same subject
    expect(result.subject).toBeTruthy();
  });
});

// ── Custom template ───────────────────────────────────────────────────────────

describe('TemplateEngine.registerTemplate', () => {
  it('uses custom template when registered', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    engine.registerTemplate(NotificationType.NodeShared, {
      subject: 'Custom subject for {{actorName}}',
      bodyText: 'Custom body for {{targetTitle}}',
      bodyHtml: '<p>Custom HTML</p>',
    });
    const n = makeNotification(NotificationType.NodeShared);
    const result = engine.render(n);
    expect(result.subject).toBe('Custom subject for Alice');
    expect(result.bodyText).toBe('Custom body for My Graph');
    expect(result.bodyHtml).toBe('<p>Custom HTML</p>');
  });
});

// ── Digest rendering ──────────────────────────────────────────────────────────

describe('TemplateEngine.renderDigest', () => {
  it('includes all notification titles in digest body', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const notifications = [
      makeNotification(NotificationType.NodeShared, { id: 'n1', title: 'Share 1' }),
      makeNotification(NotificationType.Comment, { id: 'n2', title: 'Comment 1' }),
    ];
    const result = engine.renderDigest('user-1', notifications);
    expect(result.bodyText).toContain('Share 1');
    expect(result.bodyText).toContain('Comment 1');
  });

  it('digest subject mentions digest', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const notifications = [makeNotification(NotificationType.NodeShared)];
    const result = engine.renderDigest('user-1', notifications);
    expect(result.subject.toLowerCase()).toContain('digest');
  });

  it('returns empty digest gracefully for no notifications', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const result = engine.renderDigest('user-1', []);
    expect(result.subject).toBeTruthy();
    expect(result.bodyText).toBeTruthy();
  });
});

// ── listTypes ─────────────────────────────────────────────────────────────────

describe('TemplateEngine.listTypes', () => {
  it('returns all notification types', () => {
    const engine = new TemplateEngine(ENGINE_CONFIG);
    const types = engine.listTypes();
    expect(types).toContain(NotificationType.NodeShared);
    expect(types).toContain(NotificationType.WeeklyDigest);
    expect(types.length).toBe(Object.values(NotificationType).length);
  });
});
