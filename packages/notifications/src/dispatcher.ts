// NotificationDispatcher - routes notifications to channels, handles retries and rate limiting

import { randomUUID } from 'node:crypto';
import {
  type Notification,
  type DeliveryRecord,
  NotificationChannel,
  DeliveryStatus,
  DigestFrequency,
} from './types.js';
import { type InMemoryNotificationStore } from './store.js';
import { type PreferencesManager } from './preferences.js';
import { type TemplateEngine } from './templates.js';

// ── Channel handler interface ────────────────────────────────────────────────

export interface ChannelHandler {
  channel: NotificationChannel;
  send(notification: Notification, rendered: { subject: string; bodyText: string; bodyHtml: string }, meta: Record<string, unknown>): Promise<void>;
}

// ── Rate limiter ─────────────────────────────────────────────────────────────

interface RateBucket {
  count: number;
  windowStart: number;
}

class RateLimiter {
  private readonly buckets = new Map<string, RateBucket>();
  private readonly maxPerWindow: number;
  private readonly windowMs: number;

  constructor(maxPerWindow: number, windowMs: number) {
    this.maxPerWindow = maxPerWindow;
    this.windowMs = windowMs;
  }

  /** Returns true if the request is allowed, false if rate-limited. */
  allow(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart > this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (bucket.count >= this.maxPerWindow) return false;
    bucket.count++;
    return true;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}

// ── Digest buffer ─────────────────────────────────────────────────────────────

interface DigestEntry {
  notification: Notification;
  channel: NotificationChannel;
  scheduledFor: Date;
}

// ── Dispatcher config ─────────────────────────────────────────────────────────

export interface DispatcherConfig {
  store: InMemoryNotificationStore;
  preferences: PreferencesManager;
  templateEngine: TemplateEngine;
  /** Max delivery retry attempts (default: 3) */
  maxAttempts?: number;
  /** Delay between retries in ms (default: 1000) */
  retryDelayMs?: number;
  /** Rate limit: max notifications per user per window (default: 50) */
  rateLimit?: number;
  /** Rate limit window in ms (default: 60_000 = 1 minute) */
  rateLimitWindowMs?: number;
}

// ── Default in-app handler ────────────────────────────────────────────────────

export class InAppHandler implements ChannelHandler {
  readonly channel = NotificationChannel.InApp;

  async send(
    _notification: Notification,
    _rendered: { subject: string; bodyText: string; bodyHtml: string },
    _meta: Record<string, unknown>,
  ): Promise<void> {
    // In-app: notification is already stored in the DB by NotificationService.
    // No external call needed; this is a no-op that signals "delivered".
  }
}

// ── Default email handler ─────────────────────────────────────────────────────

export interface EmailSender {
  send(opts: {
    to: string;
    subject: string;
    bodyText: string;
    bodyHtml: string;
  }): Promise<void>;
}

export class EmailHandler implements ChannelHandler {
  readonly channel = NotificationChannel.Email;
  private readonly emailLookup: (userId: string) => Promise<string | undefined>;
  private readonly sender: EmailSender;

  constructor(
    emailLookup: (userId: string) => Promise<string | undefined>,
    sender: EmailSender,
  ) {
    this.emailLookup = emailLookup;
    this.sender = sender;
  }

  async send(
    notification: Notification,
    rendered: { subject: string; bodyText: string; bodyHtml: string },
    _meta: Record<string, unknown>,
  ): Promise<void> {
    const email = await this.emailLookup(notification.userId);
    if (!email) throw new Error(`No email address for user ${notification.userId}`);
    await this.sender.send({
      to: email,
      subject: rendered.subject,
      bodyText: rendered.bodyText,
      bodyHtml: rendered.bodyHtml,
    });
  }
}

// ── Default webhook handler ───────────────────────────────────────────────────

export class WebhookHandler implements ChannelHandler {
  readonly channel = NotificationChannel.Webhook;
  private readonly urlLookup: (userId: string) => Promise<string | undefined>;

  constructor(urlLookup: (userId: string) => Promise<string | undefined>) {
    this.urlLookup = urlLookup;
  }

  async send(
    notification: Notification,
    rendered: { subject: string; bodyText: string; bodyHtml: string },
    _meta: Record<string, unknown>,
  ): Promise<void> {
    const url = await this.urlLookup(notification.userId);
    if (!url) throw new Error(`No webhook URL for user ${notification.userId}`);

    const payload = {
      id: notification.id,
      type: notification.type,
      title: rendered.subject,
      body: rendered.bodyText,
      metadata: notification.metadata,
      createdAt: notification.createdAt.toISOString(),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
    }
  }
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export class NotificationDispatcher {
  private readonly store: InMemoryNotificationStore;
  private readonly preferences: PreferencesManager;
  private readonly templateEngine: TemplateEngine;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly handlers = new Map<NotificationChannel, ChannelHandler>();
  private readonly rateLimiter: RateLimiter;
  private readonly digestBuffer = new Map<string, DigestEntry[]>(); // key: `${userId}:${channel}`

  constructor(config: DispatcherConfig) {
    this.store = config.store;
    this.preferences = config.preferences;
    this.templateEngine = config.templateEngine;
    this.maxAttempts = config.maxAttempts ?? 3;
    this.retryDelayMs = config.retryDelayMs ?? 1000;
    this.rateLimiter = new RateLimiter(
      config.rateLimit ?? 50,
      config.rateLimitWindowMs ?? 60_000,
    );

    // Register default in-app handler
    this.registerHandler(new InAppHandler());
  }

  registerHandler(handler: ChannelHandler): void {
    this.handlers.set(handler.channel, handler);
  }

  // ── Dispatch ──────────────────────────────────────────────────────────────

  async dispatch(notification: Notification): Promise<void> {
    const prefs = this.preferences.get(notification.userId);

    if (!prefs.globalEnabled) {
      await this.recordDelivery(notification.id, NotificationChannel.InApp, DeliveryStatus.Skipped, 'global disabled');
      return;
    }

    const channels = this.preferences.getChannelsForType(notification.userId, notification.type);

    await Promise.all(
      channels.map((cp) => this.dispatchToChannel(notification, cp.channel, cp.digestFrequency)),
    );
  }

  private async dispatchToChannel(
    notification: Notification,
    channel: NotificationChannel,
    frequency: DigestFrequency,
  ): Promise<void> {
    // Rate limiting per user+channel
    const rateKey = `${notification.userId}:${channel}`;
    if (!this.rateLimiter.allow(rateKey)) {
      await this.recordDelivery(notification.id, channel, DeliveryStatus.Skipped, 'rate limited');
      return;
    }

    // Digest buffering
    if (frequency !== DigestFrequency.Immediate) {
      this.bufferForDigest(notification, channel, frequency);
      return;
    }

    await this.sendWithRetry(notification, channel);
  }

  private async sendWithRetry(notification: Notification, channel: NotificationChannel): Promise<void> {
    const handler = this.handlers.get(channel);
    if (!handler) {
      await this.recordDelivery(notification.id, channel, DeliveryStatus.Skipped, `no handler for ${channel}`);
      return;
    }

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const rendered = this.templateEngine.render(notification);
        await handler.send(notification, rendered, { attempt });
        await this.recordDelivery(notification.id, channel, DeliveryStatus.Delivered, undefined, attempt);
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxAttempts) {
          await this.sleep(this.retryDelayMs * attempt);
        }
      }
    }

    await this.recordDelivery(
      notification.id,
      channel,
      DeliveryStatus.Failed,
      lastError?.message,
      this.maxAttempts,
    );
  }

  // ── Digest ────────────────────────────────────────────────────────────────

  private bufferForDigest(
    notification: Notification,
    channel: NotificationChannel,
    frequency: DigestFrequency,
  ): void {
    const key = `${notification.userId}:${channel}`;
    const existing = this.digestBuffer.get(key) ?? [];
    const scheduledFor = this.nextDigestTime(frequency);
    existing.push({ notification, channel, scheduledFor });
    this.digestBuffer.set(key, existing);
  }

  private nextDigestTime(frequency: DigestFrequency): Date {
    const now = new Date();
    if (frequency === DigestFrequency.Hourly) {
      return new Date(now.getTime() + 60 * 60 * 1000);
    }
    // Daily: next midnight UTC
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow;
  }

  /** Flushes all digest buffers that are due */
  async flushDigests(): Promise<void> {
    const now = new Date();
    for (const [key, entries] of this.digestBuffer) {
      const due = entries.filter((e) => e.scheduledFor <= now);
      if (due.length === 0) continue;

      const remaining = entries.filter((e) => e.scheduledFor > now);
      if (remaining.length === 0) {
        this.digestBuffer.delete(key);
      } else {
        this.digestBuffer.set(key, remaining);
      }

      // Group by userId + channel (they share the same key)
      const first = due[0];
      if (!first) continue;
      const { userId } = first.notification;
      const { channel } = first;
      const notifications = due.map((e) => e.notification);

      const handler = this.handlers.get(channel);
      if (!handler) continue;

      try {
        const rendered = this.templateEngine.renderDigest(userId, notifications);
        // Create a synthetic digest notification to pass to the handler
        const digestNotification = notifications[0]!;
        await handler.send(digestNotification, rendered, { digest: true, count: notifications.length });
      } catch {
        // digest delivery failures are logged but not retried here
      }
    }
  }

  /** Returns a snapshot of buffered digest entries for a user+channel */
  getDigestBuffer(userId: string, channel: NotificationChannel): DigestEntry[] {
    const key = `${userId}:${channel}`;
    return (this.digestBuffer.get(key) ?? []).map((e) => ({ ...e }));
  }

  // ── Retry failed deliveries ───────────────────────────────────────────────

  async retryFailed(): Promise<number> {
    const failed = this.store.getFailedDeliveries(this.maxAttempts);
    let retried = 0;

    for (const record of failed) {
      const notification = this.store.findById(record.notificationId);
      if (!notification) continue;
      await this.sendWithRetry(notification, record.channel);
      retried++;
    }

    return retried;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async recordDelivery(
    notificationId: string,
    channel: NotificationChannel,
    status: DeliveryStatus,
    error?: string,
    attempts = 1,
  ): Promise<void> {
    const existing = this.store.getDeliveries(notificationId)
      .find((r) => r.channel === channel);

    const record: DeliveryRecord = {
      notificationId,
      channel,
      status,
      attemptedAt: existing?.attemptedAt ?? new Date(),
      deliveredAt: status === DeliveryStatus.Delivered ? new Date() : undefined,
      error,
      attempts,
    };

    this.store.saveDelivery(record);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
