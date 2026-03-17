// PreferencesManager - per-user notification preferences with quiet hours and digest config

import {
  type NotificationPreferences,
  type ChannelPreference,
  NotificationChannel,
  NotificationType,
  DigestFrequency,
} from './types.js';

const DEFAULT_CHANNELS: ChannelPreference[] = [
  {
    channel: NotificationChannel.InApp,
    enabled: true,
    digestFrequency: DigestFrequency.Immediate,
  },
  {
    channel: NotificationChannel.Email,
    enabled: true,
    digestFrequency: DigestFrequency.Daily,
  },
];

function buildDefaultPreferences(userId: string): NotificationPreferences {
  return {
    userId,
    globalEnabled: true,
    timezone: 'UTC',
    quietHoursStart: undefined,
    quietHoursEnd: undefined,
    defaultChannels: DEFAULT_CHANNELS.map((c) => ({ ...c })),
    perType: {},
  };
}

export class PreferencesManager {
  private readonly store = new Map<string, NotificationPreferences>();

  // ── Get / create ─────────────────────────────────────────────────────────

  get(userId: string): NotificationPreferences {
    const prefs = this.store.get(userId);
    if (prefs) return this.clone(prefs);
    const defaults = buildDefaultPreferences(userId);
    this.store.set(userId, defaults);
    return this.clone(defaults);
  }

  // ── Update ───────────────────────────────────────────────────────────────

  update(userId: string, patch: Partial<Omit<NotificationPreferences, 'userId'>>): NotificationPreferences {
    const prefs = this.get(userId);
    const updated: NotificationPreferences = {
      ...prefs,
      ...patch,
      userId,
    };
    this.store.set(userId, updated);
    return this.clone(updated);
  }

  setGlobalEnabled(userId: string, enabled: boolean): void {
    const prefs = this.get(userId);
    prefs.globalEnabled = enabled;
    this.store.set(userId, prefs);
  }

  setQuietHours(userId: string, start: number, end: number): void {
    if (start < 0 || start > 23 || end < 0 || end > 23) {
      throw new RangeError('Quiet hours must be between 0 and 23');
    }
    const prefs = this.get(userId);
    prefs.quietHoursStart = start;
    prefs.quietHoursEnd = end;
    this.store.set(userId, prefs);
  }

  clearQuietHours(userId: string): void {
    const prefs = this.get(userId);
    prefs.quietHoursStart = undefined;
    prefs.quietHoursEnd = undefined;
    this.store.set(userId, prefs);
  }

  setChannelForType(
    userId: string,
    type: NotificationType,
    channelPrefs: ChannelPreference[],
  ): void {
    const prefs = this.get(userId);
    prefs.perType[type] = channelPrefs.map((c) => ({ ...c }));
    this.store.set(userId, prefs);
  }

  setDigestFrequency(
    userId: string,
    channel: NotificationChannel,
    frequency: DigestFrequency,
  ): void {
    const prefs = this.get(userId);
    for (const cp of prefs.defaultChannels) {
      if (cp.channel === channel) {
        cp.digestFrequency = frequency;
      }
    }
    this.store.set(userId, prefs);
  }

  // ── Query helpers ────────────────────────────────────────────────────────

  /** Returns the effective channel preferences for a given notification type */
  getChannelsForType(userId: string, type: NotificationType): ChannelPreference[] {
    const prefs = this.get(userId);
    const perType = prefs.perType[type];
    return (perType ?? prefs.defaultChannels).filter((c) => c.enabled);
  }

  /**
   * Returns true if the current UTC hour falls within quiet hours.
   * Supports overnight ranges (e.g. 22–6).
   */
  isQuietHour(userId: string, nowHour?: number): boolean {
    const prefs = this.get(userId);
    if (prefs.quietHoursStart === undefined || prefs.quietHoursEnd === undefined) {
      return false;
    }
    const hour = nowHour ?? new Date().getUTCHours();
    const { quietHoursStart: start, quietHoursEnd: end } = prefs;
    if (start <= end) {
      return hour >= start && hour < end;
    }
    // Overnight: e.g. start=22, end=6
    return hour >= start || hour < end;
  }

  /** Returns true if notifications are globally enabled and not in quiet hours */
  canSend(userId: string, nowHour?: number): boolean {
    const prefs = this.get(userId);
    if (!prefs.globalEnabled) return false;
    return !this.isQuietHour(userId, nowHour);
  }

  // ── Reset ────────────────────────────────────────────────────────────────

  reset(userId: string): NotificationPreferences {
    const defaults = buildDefaultPreferences(userId);
    this.store.set(userId, defaults);
    return this.clone(defaults);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private clone(prefs: NotificationPreferences): NotificationPreferences {
    return {
      ...prefs,
      defaultChannels: prefs.defaultChannels.map((c) => ({ ...c })),
      perType: Object.fromEntries(
        Object.entries(prefs.perType).map(([k, v]) => [
          k,
          v?.map((c) => ({ ...c })) ?? [],
        ]),
      ) as NotificationPreferences['perType'],
    };
  }
}
