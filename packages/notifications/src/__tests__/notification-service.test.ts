// NotificationService tests

import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationService } from '../notification-service.js';
import { InMemoryNotificationStore } from '../store.js';
import { NotificationType } from '../types.js';

function makeService() {
  const store = new InMemoryNotificationStore();
  const service = new NotificationService(store);
  return { service, store };
}

function createInput(userId = 'user-1', type = NotificationType.NodeShared) {
  return {
    userId,
    type,
    title: 'Test notification',
    body: 'Test body',
    metadata: { ref: 'abc' },
  };
}

// ── Create ───────────────────────────────────────────────────────────────────

describe('NotificationService.create', () => {
  it('creates a notification with a generated id', () => {
    const { service } = makeService();
    const n = service.create(createInput());
    expect(n.id).toBeTruthy();
    expect(n.userId).toBe('user-1');
    expect(n.type).toBe(NotificationType.NodeShared);
    expect(n.read).toBe(false);
    expect(n.createdAt).toBeInstanceOf(Date);
  });

  it('sets expiresAt when ttlMs is provided', () => {
    const { service } = makeService();
    const n = service.create({ ...createInput(), ttlMs: 60_000 });
    expect(n.expiresAt).toBeInstanceOf(Date);
    expect(n.expiresAt!.getTime()).toBeGreaterThan(n.createdAt.getTime());
  });

  it('does not set expiresAt when ttlMs is omitted', () => {
    const { service } = makeService();
    const n = service.create(createInput());
    expect(n.expiresAt).toBeUndefined();
  });
});

// ── GetById ───────────────────────────────────────────────────────────────────

describe('NotificationService.getById', () => {
  it('returns the notification', () => {
    const { service } = makeService();
    const n = service.create(createInput());
    expect(service.getById(n.id)?.id).toBe(n.id);
  });

  it('returns undefined for unknown id', () => {
    const { service } = makeService();
    expect(service.getById('no-such-id')).toBeUndefined();
  });
});

// ── List ──────────────────────────────────────────────────────────────────────

describe('NotificationService.list', () => {
  it('returns only notifications for the specified user', () => {
    const { service } = makeService();
    service.create(createInput('user-1'));
    service.create(createInput('user-2'));
    const result = service.listForUser('user-1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.userId).toBe('user-1');
  });

  it('paginates correctly', () => {
    const { service } = makeService();
    for (let i = 0; i < 5; i++) service.create(createInput());
    const page1 = service.listForUser('user-1', { limit: 2, offset: 0 });
    expect(page1.items).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    const page2 = service.listForUser('user-1', { limit: 2, offset: 4 });
    expect(page2.items).toHaveLength(1);
    expect(page2.hasMore).toBe(false);
  });

  it('filters by type', () => {
    const { service } = makeService();
    service.create(createInput('user-1', NotificationType.NodeShared));
    service.create(createInput('user-1', NotificationType.Comment));
    const result = service.listByType('user-1', NotificationType.Comment);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.type).toBe(NotificationType.Comment);
  });

  it('filters unread notifications', () => {
    const { service } = makeService();
    const n1 = service.create(createInput());
    service.create(createInput());
    service.markRead(n1.id);
    const unread = service.listUnread('user-1');
    expect(unread.items).toHaveLength(1);
  });
});

// ── Unread count ──────────────────────────────────────────────────────────────

describe('NotificationService.unreadCount', () => {
  it('returns correct unread count', () => {
    const { service } = makeService();
    const n1 = service.create(createInput());
    service.create(createInput());
    expect(service.unreadCount('user-1')).toBe(2);
    service.markRead(n1.id);
    expect(service.unreadCount('user-1')).toBe(1);
  });
});

// ── Mark read/unread ──────────────────────────────────────────────────────────

describe('NotificationService mark read/unread', () => {
  it('marks a notification as read', () => {
    const { service } = makeService();
    const n = service.create(createInput());
    const updated = service.markRead(n.id);
    expect(updated?.read).toBe(true);
    expect(updated?.readAt).toBeInstanceOf(Date);
  });

  it('marks a notification as unread', () => {
    const { service } = makeService();
    const n = service.create(createInput());
    service.markRead(n.id);
    const updated = service.markUnread(n.id);
    expect(updated?.read).toBe(false);
    expect(updated?.readAt).toBeUndefined();
  });

  it('returns undefined for unknown id', () => {
    const { service } = makeService();
    expect(service.markRead('no-such')).toBeUndefined();
  });
});

// ── Batch mark read ───────────────────────────────────────────────────────────

describe('NotificationService.batchMarkRead', () => {
  it('marks multiple notifications as read', () => {
    const { service } = makeService();
    const n1 = service.create(createInput());
    const n2 = service.create(createInput());
    const result = service.batchMarkRead([n1.id, n2.id]);
    expect(result.updated).toBe(2);
    expect(result.notFound).toBe(0);
    expect(service.unreadCount('user-1')).toBe(0);
  });

  it('reports not-found ids', () => {
    const { service } = makeService();
    const n = service.create(createInput());
    const result = service.batchMarkRead([n.id, 'ghost-id']);
    expect(result.updated).toBe(1);
    expect(result.notFound).toBe(1);
  });
});

// ── Mark all read ─────────────────────────────────────────────────────────────

describe('NotificationService.markAllRead', () => {
  it('marks all unread notifications for a user as read', () => {
    const { service } = makeService();
    service.create(createInput());
    service.create(createInput());
    const count = service.markAllRead('user-1');
    expect(count).toBe(2);
    expect(service.unreadCount('user-1')).toBe(0);
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────

describe('NotificationService.delete', () => {
  it('deletes a notification by id', () => {
    const { service } = makeService();
    const n = service.create(createInput());
    expect(service.delete(n.id)).toBe(true);
    expect(service.getById(n.id)).toBeUndefined();
  });

  it('returns false for unknown id', () => {
    const { service } = makeService();
    expect(service.delete('ghost')).toBe(false);
  });

  it('deletes all notifications for a user', () => {
    const { service } = makeService();
    service.create(createInput('user-1'));
    service.create(createInput('user-1'));
    service.create(createInput('user-2'));
    const count = service.deleteAllForUser('user-1');
    expect(count).toBe(2);
    expect(service.listForUser('user-1').total).toBe(0);
    expect(service.listForUser('user-2').total).toBe(1);
  });
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

describe('NotificationService.cleanup', () => {
  it('removes notifications older than maxAgeMs', async () => {
    const { service } = makeService();
    service.create(createInput());
    // Wait 50ms then cleanup anything older than 10ms
    await new Promise((r) => setTimeout(r, 50));
    const removed = service.cleanup(10);
    expect(removed).toBe(1);
    expect(service.listForUser('user-1').total).toBe(0);
  });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

describe('NotificationService.stats', () => {
  it('returns total and unread count', () => {
    const { service } = makeService();
    service.create(createInput('user-1', NotificationType.NodeShared));
    const n2 = service.create(createInput('user-1', NotificationType.Comment));
    service.markRead(n2.id);
    const stats = service.stats('user-1');
    expect(stats.total).toBe(2);
    expect(stats.unread).toBe(1);
    expect(stats.byType[NotificationType.NodeShared]).toBe(1);
    expect(stats.byType[NotificationType.Comment]).toBe(1);
  });
});
