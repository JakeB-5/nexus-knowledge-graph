// NotificationDispatcher tests

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotificationDispatcher, type ChannelHandler } from '../dispatcher.js';
import { InMemoryNotificationStore } from '../store.js';
import { PreferencesManager } from '../preferences.js';
import { TemplateEngine } from '../templates.js';
import {
  type Notification,
  NotificationType,
  NotificationChannel,
  DeliveryStatus,
  DigestFrequency,
} from '../types.js';

const ENGINE_CONFIG = {
  appName: 'Nexus',
  appUrl: 'https://nexus.example.com',
  unsubscribeBaseUrl: 'https://nexus.example.com/unsubscribe',
};

function makeNotification(override: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1',
    userId: 'user-1',
    type: NotificationType.NodeShared,
    title: 'Alice shared a node',
    body: 'Check it out',
    actor: { id: 'actor-1', name: 'Alice' },
    target: { id: 'node-1', type: 'node', title: 'My Graph', url: 'https://nexus.example.com/nodes/1' },
    metadata: {},
    read: false,
    createdAt: new Date(),
    ...override,
  };
}

function makeDispatcher(opts: { rateLimit?: number; retryDelayMs?: number } = {}) {
  const store = new InMemoryNotificationStore();
  const preferences = new PreferencesManager();
  const templateEngine = new TemplateEngine(ENGINE_CONFIG);

  const dispatcher = new NotificationDispatcher({
    store,
    preferences,
    templateEngine,
    maxAttempts: 2,
    retryDelayMs: opts.retryDelayMs ?? 0,
    rateLimit: opts.rateLimit ?? 100,
    rateLimitWindowMs: 60_000,
  });

  return { dispatcher, store, preferences };
}

// ── In-app delivery ───────────────────────────────────────────────────────────

describe('NotificationDispatcher - in-app delivery', () => {
  it('delivers to in-app channel by default', async () => {
    const { dispatcher, store } = makeDispatcher();
    const notification = makeNotification();
    store.save(notification);

    await dispatcher.dispatch(notification);

    const deliveries = store.getDeliveries(notification.id);
    const inApp = deliveries.find((d) => d.channel === NotificationChannel.InApp);
    expect(inApp?.status).toBe(DeliveryStatus.Delivered);
  });
});

// ── Custom channel handler ────────────────────────────────────────────────────

describe('NotificationDispatcher - custom channel handler', () => {
  it('calls the registered handler for the channel', async () => {
    const { dispatcher, store, preferences } = makeDispatcher();

    const mockSend = vi.fn().mockResolvedValue(undefined);
    const customHandler: ChannelHandler = {
      channel: NotificationChannel.Email,
      send: mockSend,
    };
    dispatcher.registerHandler(customHandler);

    // Enable email channel for user-1
    preferences.update('user-1', {
      defaultChannels: [
        { channel: NotificationChannel.Email, enabled: true, digestFrequency: DigestFrequency.Immediate },
      ],
    });

    const notification = makeNotification();
    store.save(notification);

    await dispatcher.dispatch(notification);

    expect(mockSend).toHaveBeenCalledOnce();
  });
});

// ── Global disabled ───────────────────────────────────────────────────────────

describe('NotificationDispatcher - global disabled', () => {
  it('skips delivery when global notifications are disabled', async () => {
    const { dispatcher, store, preferences } = makeDispatcher();
    preferences.setGlobalEnabled('user-1', false);

    const notification = makeNotification();
    store.save(notification);

    await dispatcher.dispatch(notification);

    const deliveries = store.getDeliveries(notification.id);
    expect(deliveries.every((d) => d.status === DeliveryStatus.Skipped)).toBe(true);
  });
});

// ── Retry on failure ──────────────────────────────────────────────────────────

describe('NotificationDispatcher - retry on failure', () => {
  it('retries and eventually marks as failed', async () => {
    const { dispatcher, store, preferences } = makeDispatcher({ retryDelayMs: 0 });

    const failingHandler: ChannelHandler = {
      channel: NotificationChannel.Email,
      send: vi.fn().mockRejectedValue(new Error('SMTP down')),
    };
    dispatcher.registerHandler(failingHandler);

    preferences.update('user-1', {
      defaultChannels: [
        { channel: NotificationChannel.Email, enabled: true, digestFrequency: DigestFrequency.Immediate },
      ],
    });

    const notification = makeNotification();
    store.save(notification);

    await dispatcher.dispatch(notification);

    const deliveries = store.getDeliveries(notification.id);
    const email = deliveries.find((d) => d.channel === NotificationChannel.Email);
    expect(email?.status).toBe(DeliveryStatus.Failed);
    expect(email?.attempts).toBe(2); // maxAttempts = 2
  });

  it('succeeds on second attempt', async () => {
    const { dispatcher, store, preferences } = makeDispatcher({ retryDelayMs: 0 });

    let callCount = 0;
    const flakeyHandler: ChannelHandler = {
      channel: NotificationChannel.Email,
      send: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('temporary error');
      }),
    };
    dispatcher.registerHandler(flakeyHandler);

    preferences.update('user-1', {
      defaultChannels: [
        { channel: NotificationChannel.Email, enabled: true, digestFrequency: DigestFrequency.Immediate },
      ],
    });

    const notification = makeNotification();
    store.save(notification);

    await dispatcher.dispatch(notification);

    const deliveries = store.getDeliveries(notification.id);
    const email = deliveries.find((d) => d.channel === NotificationChannel.Email);
    expect(email?.status).toBe(DeliveryStatus.Delivered);
    expect(callCount).toBe(2);
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe('NotificationDispatcher - rate limiting', () => {
  it('skips delivery when rate limit is exceeded', async () => {
    const { dispatcher, store, preferences } = makeDispatcher({ rateLimit: 1 });

    const mockSend = vi.fn().mockResolvedValue(undefined);
    const handler: ChannelHandler = {
      channel: NotificationChannel.InApp,
      send: mockSend,
    };
    dispatcher.registerHandler(handler);

    const n1 = makeNotification({ id: 'n1' });
    const n2 = makeNotification({ id: 'n2' });
    store.save(n1);
    store.save(n2);

    await dispatcher.dispatch(n1);
    await dispatcher.dispatch(n2);

    const d2 = store.getDeliveries('n2');
    const inApp2 = d2.find((d) => d.channel === NotificationChannel.InApp);
    expect(inApp2?.status).toBe(DeliveryStatus.Skipped);
  });
});

// ── Digest buffering ──────────────────────────────────────────────────────────

describe('NotificationDispatcher - digest mode', () => {
  it('buffers notifications for digest channels', async () => {
    const { dispatcher, store, preferences } = makeDispatcher();

    preferences.update('user-1', {
      defaultChannels: [
        { channel: NotificationChannel.Email, enabled: true, digestFrequency: DigestFrequency.Daily },
      ],
    });

    const mockSend = vi.fn().mockResolvedValue(undefined);
    dispatcher.registerHandler({ channel: NotificationChannel.Email, send: mockSend });

    const notification = makeNotification();
    store.save(notification);

    await dispatcher.dispatch(notification);

    // Should NOT have sent yet
    expect(mockSend).not.toHaveBeenCalled();

    // Buffer should contain the entry
    const buffered = dispatcher.getDigestBuffer('user-1', NotificationChannel.Email);
    expect(buffered).toHaveLength(1);
  });
});

// ── No handler skips ─────────────────────────────────────────────────────────

describe('NotificationDispatcher - missing handler', () => {
  it('skips when no handler registered for channel', async () => {
    const { dispatcher, store, preferences } = makeDispatcher();

    // Only webhook channel, no handler registered
    preferences.update('user-1', {
      defaultChannels: [
        { channel: NotificationChannel.Webhook, enabled: true, digestFrequency: DigestFrequency.Immediate },
      ],
    });

    const notification = makeNotification();
    store.save(notification);

    await dispatcher.dispatch(notification);

    const deliveries = store.getDeliveries(notification.id);
    const webhook = deliveries.find((d) => d.channel === NotificationChannel.Webhook);
    expect(webhook?.status).toBe(DeliveryStatus.Skipped);
  });
});

// ── retryFailed ───────────────────────────────────────────────────────────────

describe('NotificationDispatcher.retryFailed', () => {
  it('retries deliveries that previously failed', async () => {
    const { dispatcher, store, preferences } = makeDispatcher({ retryDelayMs: 0 });

    let attempt = 0;
    const handler: ChannelHandler = {
      channel: NotificationChannel.Email,
      send: vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt < 2) throw new Error('fail');
      }),
    };
    dispatcher.registerHandler(handler);

    preferences.update('user-1', {
      defaultChannels: [
        { channel: NotificationChannel.Email, enabled: true, digestFrequency: DigestFrequency.Immediate },
      ],
    });

    const notification = makeNotification();
    store.save(notification);

    // First dispatch will fail (maxAttempts=2, both attempts fail because attempt<2 on first call pair)
    // To make it simpler: fail on all, then succeed on retry
    attempt = 0;
    let retryMode = false;
    const mockHandler: ChannelHandler = {
      channel: NotificationChannel.Email,
      send: vi.fn().mockImplementation(async () => {
        if (!retryMode) throw new Error('initial fail');
      }),
    };
    dispatcher.registerHandler(mockHandler);

    await dispatcher.dispatch(notification);

    const beforeRetry = store.getDeliveries(notification.id)
      .find((d) => d.channel === NotificationChannel.Email);
    expect(beforeRetry?.status).toBe(DeliveryStatus.Failed);

    retryMode = true;
    const retried = await dispatcher.retryFailed();
    expect(retried).toBeGreaterThan(0);

    const afterRetry = store.getDeliveries(notification.id)
      .find((d) => d.channel === NotificationChannel.Email);
    expect(afterRetry?.status).toBe(DeliveryStatus.Delivered);
  });
});
