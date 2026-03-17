// @nexus/notifications - notification management package

export {
  NotificationType,
  NotificationChannel,
  DeliveryStatus,
  DigestFrequency,
} from './types.js';
export type {
  NotificationActor,
  NotificationTarget,
  Notification,
  DeliveryRecord,
  NotificationTemplate,
  ChannelPreference,
  NotificationPreferences,
  ListNotificationsOptions,
  NotificationStats,
} from './types.js';

export { InMemoryNotificationStore } from './store.js';
export type { PaginatedResult } from './store.js';

export { NotificationService } from './notification-service.js';
export type { CreateNotificationInput, BatchReadResult } from './notification-service.js';

export { PreferencesManager } from './preferences.js';

export { TemplateEngine } from './templates.js';
export type { RenderedTemplate, TemplateVars, TemplateEngineConfig } from './templates.js';

export {
  NotificationDispatcher,
  InAppHandler,
  EmailHandler,
  WebhookHandler,
} from './dispatcher.js';
export type {
  ChannelHandler,
  DispatcherConfig,
  EmailSender,
} from './dispatcher.js';
