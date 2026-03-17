// Template engine for notification content - HTML, plain text, and subject lines

import { NotificationType, NotificationChannel } from './types.js';
import type { Notification } from './types.js';

// ── Template definition ──────────────────────────────────────────────────────

export interface RenderedTemplate {
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

export interface TemplateVars {
  actorName: string;
  actorUrl: string;
  targetTitle: string;
  targetUrl: string;
  appName: string;
  appUrl: string;
  unsubscribeUrl: string;
  [key: string]: string | number | boolean;
}

type TemplateDefinition = {
  subject: string;
  bodyText: string;
  bodyHtml: string;
};

// ── Variable interpolation ───────────────────────────────────────────────────

function interpolate(template: string, vars: Record<string, string | number | boolean>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const val = vars[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

// ── Built-in templates ───────────────────────────────────────────────────────

const TEMPLATES: Record<NotificationType, TemplateDefinition> = {
  [NotificationType.NodeShared]: {
    subject: '{{actorName}} shared a node with you',
    bodyText: `Hi,

{{actorName}} has shared "{{targetTitle}}" with you.

View it here: {{targetUrl}}

—
{{appName}}
Unsubscribe: {{unsubscribeUrl}}`,
    bodyHtml: `<p>Hi,</p>
<p><strong>{{actorName}}</strong> has shared <a href="{{targetUrl}}">{{targetTitle}}</a> with you.</p>
<p><a href="{{targetUrl}}">View Node →</a></p>
<hr/>
<p style="font-size:12px;color:#888;">You received this because you have sharing notifications enabled.
<a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },

  [NotificationType.EdgeCreated]: {
    subject: '{{actorName}} created a connection in {{targetTitle}}',
    bodyText: `Hi,

{{actorName}} created a new connection in "{{targetTitle}}".

View it here: {{targetUrl}}

—
{{appName}}
Unsubscribe: {{unsubscribeUrl}}`,
    bodyHtml: `<p><strong>{{actorName}}</strong> created a new connection in <a href="{{targetUrl}}">{{targetTitle}}</a>.</p>
<p><a href="{{targetUrl}}">View Connection →</a></p>
<hr/>
<p style="font-size:12px;color:#888;"><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },

  [NotificationType.Mention]: {
    subject: '{{actorName}} mentioned you in {{targetTitle}}',
    bodyText: `Hi,

{{actorName}} mentioned you in "{{targetTitle}}".

View it here: {{targetUrl}}

—
{{appName}}
Unsubscribe: {{unsubscribeUrl}}`,
    bodyHtml: `<p><strong>{{actorName}}</strong> mentioned you in <a href="{{targetUrl}}">{{targetTitle}}</a>.</p>
<p><a href="{{targetUrl}}">View Mention →</a></p>
<hr/>
<p style="font-size:12px;color:#888;"><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },

  [NotificationType.Comment]: {
    subject: '{{actorName}} commented on {{targetTitle}}',
    bodyText: `Hi,

{{actorName}} left a comment on "{{targetTitle}}".

View it here: {{targetUrl}}

—
{{appName}}
Unsubscribe: {{unsubscribeUrl}}`,
    bodyHtml: `<p><strong>{{actorName}}</strong> commented on <a href="{{targetUrl}}">{{targetTitle}}</a>.</p>
<p><a href="{{targetUrl}}">View Comment →</a></p>
<hr/>
<p style="font-size:12px;color:#888;"><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },

  [NotificationType.CommentReply]: {
    subject: '{{actorName}} replied to your comment on {{targetTitle}}',
    bodyText: `Hi,

{{actorName}} replied to your comment on "{{targetTitle}}".

View it here: {{targetUrl}}

—
{{appName}}
Unsubscribe: {{unsubscribeUrl}}`,
    bodyHtml: `<p><strong>{{actorName}}</strong> replied to your comment on <a href="{{targetUrl}}">{{targetTitle}}</a>.</p>
<p><a href="{{targetUrl}}">View Reply →</a></p>
<hr/>
<p style="font-size:12px;color:#888;"><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },

  [NotificationType.NodeUpdated]: {
    subject: '{{actorName}} updated {{targetTitle}}',
    bodyText: `Hi,

{{actorName}} made changes to "{{targetTitle}}".

View the latest version: {{targetUrl}}

—
{{appName}}
Unsubscribe: {{unsubscribeUrl}}`,
    bodyHtml: `<p><strong>{{actorName}}</strong> made changes to <a href="{{targetUrl}}">{{targetTitle}}</a>.</p>
<p><a href="{{targetUrl}}">View Changes →</a></p>
<hr/>
<p style="font-size:12px;color:#888;"><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },

  [NotificationType.NodeDeleted]: {
    subject: '{{actorName}} deleted {{targetTitle}}',
    bodyText: `Hi,

{{actorName}} deleted "{{targetTitle}}".

—
{{appName}}
Unsubscribe: {{unsubscribeUrl}}`,
    bodyHtml: `<p><strong>{{actorName}}</strong> deleted <strong>{{targetTitle}}</strong>.</p>
<hr/>
<p style="font-size:12px;color:#888;"><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },

  [NotificationType.CollaboratorAdded]: {
    subject: 'You were added to {{targetTitle}}',
    bodyText: `Hi,

{{actorName}} added you as a collaborator to "{{targetTitle}}".

Open it here: {{targetUrl}}

—
{{appName}}
Unsubscribe: {{unsubscribeUrl}}`,
    bodyHtml: `<p><strong>{{actorName}}</strong> added you as a collaborator to <a href="{{targetUrl}}">{{targetTitle}}</a>.</p>
<p><a href="{{targetUrl}}">Open →</a></p>
<hr/>
<p style="font-size:12px;color:#888;"><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },

  [NotificationType.CollaboratorRemoved]: {
    subject: 'You were removed from {{targetTitle}}',
    bodyText: `Hi,

{{actorName}} removed you from "{{targetTitle}}".

—
{{appName}}
Unsubscribe: {{unsubscribeUrl}}`,
    bodyHtml: `<p><strong>{{actorName}}</strong> removed you from <strong>{{targetTitle}}</strong>.</p>
<hr/>
<p style="font-size:12px;color:#888;"><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },

  [NotificationType.WeeklyDigest]: {
    subject: 'Your weekly Nexus digest',
    bodyText: `Hi,

Here is your weekly digest of activity in {{appName}}:

{{digestContent}}

Visit your feed: {{appUrl}}

—
{{appName}}
Unsubscribe: {{unsubscribeUrl}}`,
    bodyHtml: `<h2>Your weekly {{appName}} digest</h2>
<div>{{digestContent}}</div>
<p><a href="{{appUrl}}">Visit your feed →</a></p>
<hr/>
<p style="font-size:12px;color:#888;"><a href="{{unsubscribeUrl}}">Unsubscribe</a></p>`,
  },

  [NotificationType.SystemAlert]: {
    subject: 'System alert from {{appName}}',
    bodyText: `Hi,

{{body}}

—
{{appName}}`,
    bodyHtml: `<p>{{body}}</p>
<hr/>
<p style="font-size:12px;color:#888;">{{appName}}</p>`,
  },
};

// ── Template engine ──────────────────────────────────────────────────────────

export interface TemplateEngineConfig {
  appName: string;
  appUrl: string;
  unsubscribeBaseUrl: string;
}

export class TemplateEngine {
  private readonly config: TemplateEngineConfig;
  private readonly customTemplates = new Map<NotificationType, TemplateDefinition>();

  constructor(config: TemplateEngineConfig) {
    this.config = config;
  }

  /**
   * Register a custom template, overriding the built-in for the given type.
   */
  registerTemplate(type: NotificationType, tpl: TemplateDefinition): void {
    this.customTemplates.set(type, tpl);
  }

  /**
   * Renders a notification into subject + body text + body HTML.
   */
  render(
    notification: Notification,
    extraVars: Record<string, string | number | boolean> = {},
  ): RenderedTemplate {
    const tpl = this.customTemplates.get(notification.type) ?? TEMPLATES[notification.type];
    if (!tpl) {
      throw new Error(`No template registered for notification type: ${notification.type}`);
    }

    const vars: Record<string, string | number | boolean> = {
      appName: this.config.appName,
      appUrl: this.config.appUrl,
      unsubscribeUrl: `${this.config.unsubscribeBaseUrl}/${notification.userId}`,
      actorName: notification.actor?.name ?? 'Someone',
      actorUrl: notification.actor?.avatarUrl ?? '',
      targetTitle: notification.target?.title ?? '',
      targetUrl: notification.target?.url ?? this.config.appUrl,
      body: notification.body,
      ...extraVars,
    };

    return {
      subject: interpolate(tpl.subject, vars),
      bodyText: interpolate(tpl.bodyText, vars),
      bodyHtml: interpolate(tpl.bodyHtml, vars),
    };
  }

  /**
   * Renders a digest of multiple notifications as a single email.
   */
  renderDigest(userId: string, notifications: Notification[]): RenderedTemplate {
    const digestContent = notifications
      .map((n) => `- ${n.title}: ${n.body}`)
      .join('\n');

    const digestHtml = notifications
      .map((n) => `<li><strong>${n.title}</strong>: ${n.body}</li>`)
      .join('');

    const syntheticNotification: Notification = {
      id: 'digest',
      userId,
      type: NotificationType.WeeklyDigest,
      title: 'Weekly Digest',
      body: '',
      metadata: {},
      read: false,
      createdAt: new Date(),
    };

    return this.render(syntheticNotification, {
      digestContent,
      digestContentHtml: `<ul>${digestHtml}</ul>`,
    });
  }

  listTypes(): NotificationType[] {
    return Object.values(NotificationType);
  }
}
