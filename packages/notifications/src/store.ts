// InMemoryNotificationStore - storage layer for notifications and delivery records

import {
  type Notification,
  type DeliveryRecord,
  type ListNotificationsOptions,
  type NotificationStats,
  NotificationChannel,
  DeliveryStatus,
} from './types.js';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export class InMemoryNotificationStore {
  private notifications = new Map<string, Notification>();
  private deliveryRecords = new Map<string, DeliveryRecord[]>();

  // ── Notifications ────────────────────────────────────────────────────────

  save(notification: Notification): void {
    this.notifications.set(notification.id, { ...notification });
  }

  findById(id: string): Notification | undefined {
    const n = this.notifications.get(id);
    return n ? { ...n } : undefined;
  }

  list(options: ListNotificationsOptions): PaginatedResult<Notification> {
    const { userId, type, read, limit = 20, offset = 0 } = options;

    let items = Array.from(this.notifications.values()).filter(
      (n) => n.userId === userId,
    );

    if (type !== undefined) {
      items = items.filter((n) => n.type === type);
    }
    if (read !== undefined) {
      items = items.filter((n) => n.read === read);
    }

    // Sort newest first
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = items.length;
    const page = items.slice(offset, offset + limit);

    return {
      items: page.map((n) => ({ ...n })),
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
    };
  }

  update(id: string, patch: Partial<Notification>): Notification | undefined {
    const existing = this.notifications.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.notifications.set(id, updated);
    return { ...updated };
  }

  delete(id: string): boolean {
    return this.notifications.delete(id);
  }

  deleteForUser(userId: string): number {
    let count = 0;
    for (const [id, n] of this.notifications) {
      if (n.userId === userId) {
        this.notifications.delete(id);
        count++;
      }
    }
    return count;
  }

  /** Remove notifications older than the given age (in ms) */
  cleanup(maxAgeMs: number): number {
    const cutoff = Date.now() - maxAgeMs;
    let count = 0;
    for (const [id, n] of this.notifications) {
      if (n.createdAt.getTime() < cutoff) {
        this.notifications.delete(id);
        this.deliveryRecords.delete(id);
        count++;
      }
    }
    return count;
  }

  unreadCount(userId: string): number {
    let count = 0;
    for (const n of this.notifications.values()) {
      if (n.userId === userId && !n.read) count++;
    }
    return count;
  }

  // ── Delivery records ─────────────────────────────────────────────────────

  saveDelivery(record: DeliveryRecord): void {
    const existing = this.deliveryRecords.get(record.notificationId) ?? [];
    // Replace record for same channel if exists
    const idx = existing.findIndex((r) => r.channel === record.channel);
    if (idx !== -1) {
      existing[idx] = { ...record };
    } else {
      existing.push({ ...record });
    }
    this.deliveryRecords.set(record.notificationId, existing);
  }

  getDeliveries(notificationId: string): DeliveryRecord[] {
    return (this.deliveryRecords.get(notificationId) ?? []).map((r) => ({ ...r }));
  }

  getPendingDeliveries(): DeliveryRecord[] {
    const result: DeliveryRecord[] = [];
    for (const records of this.deliveryRecords.values()) {
      for (const r of records) {
        if (r.status === DeliveryStatus.Pending) {
          result.push({ ...r });
        }
      }
    }
    return result;
  }

  getFailedDeliveries(maxAttempts: number): DeliveryRecord[] {
    const result: DeliveryRecord[] = [];
    for (const records of this.deliveryRecords.values()) {
      for (const r of records) {
        if (r.status === DeliveryStatus.Failed && r.attempts < maxAttempts) {
          result.push({ ...r });
        }
      }
    }
    return result;
  }

  // ── Statistics ───────────────────────────────────────────────────────────

  stats(userId: string): NotificationStats {
    const userNotifications = Array.from(this.notifications.values()).filter(
      (n) => n.userId === userId,
    );

    const byType: NotificationStats['byType'] = {};
    for (const n of userNotifications) {
      byType[n.type] = (byType[n.type] ?? 0) + 1;
    }

    // Delivery rate: delivered / (delivered + failed) for this user's notifications
    let delivered = 0;
    let attempted = 0;
    for (const n of userNotifications) {
      const records = this.deliveryRecords.get(n.id) ?? [];
      for (const r of records) {
        if (r.status === DeliveryStatus.Delivered) delivered++;
        if (
          r.status === DeliveryStatus.Delivered ||
          r.status === DeliveryStatus.Failed
        ) {
          attempted++;
        }
      }
    }

    return {
      total: userNotifications.length,
      unread: userNotifications.filter((n) => !n.read).length,
      byType,
      deliveryRate: attempted === 0 ? 1 : delivered / attempted,
    };
  }

  // ── Test/dev helpers ─────────────────────────────────────────────────────

  clear(): void {
    this.notifications.clear();
    this.deliveryRecords.clear();
  }

  get notificationCount(): number {
    return this.notifications.size;
  }
}
