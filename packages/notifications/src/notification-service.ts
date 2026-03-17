// NotificationService - core CRUD operations for notifications

import { randomUUID } from 'node:crypto';
import {
  type Notification,
  type NotificationActor,
  type NotificationTarget,
  type ListNotificationsOptions,
  NotificationType,
} from './types.js';
import { InMemoryNotificationStore, type PaginatedResult } from './store.js';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  actor?: NotificationActor;
  target?: NotificationTarget;
  metadata?: Record<string, unknown>;
  /** Milliseconds from now until this notification expires */
  ttlMs?: number;
}

export interface BatchReadResult {
  updated: number;
  notFound: number;
}

export class NotificationService {
  private readonly store: InMemoryNotificationStore;

  constructor(store?: InMemoryNotificationStore) {
    this.store = store ?? new InMemoryNotificationStore();
  }

  // ── Create ───────────────────────────────────────────────────────────────

  create(input: CreateNotificationInput): Notification {
    const now = new Date();
    const notification: Notification = {
      id: randomUUID(),
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      actor: input.actor,
      target: input.target,
      metadata: input.metadata ?? {},
      read: false,
      createdAt: now,
      expiresAt: input.ttlMs ? new Date(now.getTime() + input.ttlMs) : undefined,
    };
    this.store.save(notification);
    return notification;
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  getById(id: string): Notification | undefined {
    return this.store.findById(id);
  }

  list(options: ListNotificationsOptions): PaginatedResult<Notification> {
    return this.store.list(options);
  }

  listForUser(
    userId: string,
    opts: { limit?: number; offset?: number } = {},
  ): PaginatedResult<Notification> {
    return this.store.list({ userId, ...opts });
  }

  listByType(
    userId: string,
    type: NotificationType,
    opts: { limit?: number; offset?: number } = {},
  ): PaginatedResult<Notification> {
    return this.store.list({ userId, type, ...opts });
  }

  listUnread(
    userId: string,
    opts: { limit?: number; offset?: number } = {},
  ): PaginatedResult<Notification> {
    return this.store.list({ userId, read: false, ...opts });
  }

  unreadCount(userId: string): number {
    return this.store.unreadCount(userId);
  }

  // ── Mark read/unread ─────────────────────────────────────────────────────

  markRead(id: string): Notification | undefined {
    return this.store.update(id, { read: true, readAt: new Date() });
  }

  markUnread(id: string): Notification | undefined {
    return this.store.update(id, { read: false, readAt: undefined });
  }

  /** Mark multiple notifications as read at once */
  batchMarkRead(ids: string[]): BatchReadResult {
    let updated = 0;
    let notFound = 0;
    const now = new Date();
    for (const id of ids) {
      const result = this.store.update(id, { read: true, readAt: now });
      if (result) {
        updated++;
      } else {
        notFound++;
      }
    }
    return { updated, notFound };
  }

  /** Mark all notifications for a user as read */
  markAllRead(userId: string): number {
    const all = this.store.list({ userId, read: false, limit: 10_000 });
    const now = new Date();
    let count = 0;
    for (const n of all.items) {
      if (this.store.update(n.id, { read: true, readAt: now })) count++;
    }
    return count;
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  deleteAllForUser(userId: string): number {
    return this.store.deleteForUser(userId);
  }

  // ── Maintenance ──────────────────────────────────────────────────────────

  /** Purge notifications older than maxAgeMs */
  cleanup(maxAgeMs: number): number {
    return this.store.cleanup(maxAgeMs);
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  stats(userId: string) {
    return this.store.stats(userId);
  }

  // ── Store access (for dispatcher/tests) ─────────────────────────────────

  getStore(): InMemoryNotificationStore {
    return this.store;
  }
}
