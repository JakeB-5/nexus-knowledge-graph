// Core types for the notifications package

export enum NotificationType {
  NodeShared = 'node_shared',
  EdgeCreated = 'edge_created',
  Mention = 'mention',
  Comment = 'comment',
  CommentReply = 'comment_reply',
  NodeUpdated = 'node_updated',
  NodeDeleted = 'node_deleted',
  CollaboratorAdded = 'collaborator_added',
  CollaboratorRemoved = 'collaborator_removed',
  WeeklyDigest = 'weekly_digest',
  SystemAlert = 'system_alert',
}

export enum NotificationChannel {
  InApp = 'in_app',
  Email = 'email',
  Webhook = 'webhook',
}

export enum DeliveryStatus {
  Pending = 'pending',
  Delivered = 'delivered',
  Failed = 'failed',
  Skipped = 'skipped',
}

export enum DigestFrequency {
  Immediate = 'immediate',
  Hourly = 'hourly',
  Daily = 'daily',
}

export interface NotificationActor {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface NotificationTarget {
  id: string;
  type: 'node' | 'edge' | 'graph' | 'comment';
  title: string;
  url?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  actor?: NotificationActor;
  target?: NotificationTarget;
  metadata: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
  readAt?: Date;
  expiresAt?: Date;
}

export interface DeliveryRecord {
  notificationId: string;
  channel: NotificationChannel;
  status: DeliveryStatus;
  attemptedAt: Date;
  deliveredAt?: Date;
  error?: string;
  attempts: number;
}

export interface NotificationTemplate {
  type: NotificationType;
  channel: NotificationChannel;
  subject?: string;
  bodyHtml?: string;
  bodyText: string;
  titleTemplate: string;
}

export interface ChannelPreference {
  channel: NotificationChannel;
  enabled: boolean;
  digestFrequency: DigestFrequency;
  webhookUrl?: string;
}

export interface NotificationPreferences {
  userId: string;
  globalEnabled: boolean;
  quietHoursStart?: number; // 0-23 hour
  quietHoursEnd?: number;   // 0-23 hour
  timezone: string;
  perType: Partial<Record<NotificationType, ChannelPreference[]>>;
  defaultChannels: ChannelPreference[];
}

export interface ListNotificationsOptions {
  userId: string;
  type?: NotificationType;
  read?: boolean;
  limit?: number;
  offset?: number;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: Partial<Record<NotificationType, number>>;
  deliveryRate: number;
}
