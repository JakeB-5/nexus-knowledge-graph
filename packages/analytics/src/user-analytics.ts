// User analytics: tracks user actions, sessions, DAU/WAU/MAU, and engagement

export type UserActionType =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "search"
  | "login"
  | "logout"
  | "share"
  | "export";

export interface UserAction {
  userId: string;
  actionType: UserActionType;
  timestamp: number;
  nodeId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface Session {
  sessionId: string;
  userId: string;
  startTime: number;
  endTime?: number;
  actions: UserAction[];
}

export interface EngagementScore {
  userId: string;
  score: number;
  breakdown: {
    views: number;
    creates: number;
    edits: number;
    searches: number;
    sessionCount: number;
    avgSessionDurationMs: number;
  };
}

export interface RetentionCohort {
  /** ISO week string, e.g. "2024-W01" */
  cohortWeek: string;
  /** Initial cohort size (new users that week) */
  size: number;
  /** retention[i] = fraction of cohort still active i weeks later */
  retention: number[];
}

export interface ActivityHeatmap {
  /** matrix[hour][dayOfWeek] = count of actions */
  matrix: number[][];
  hourLabels: string[];
  dayLabels: string[];
}

export class UserAnalytics {
  private actions: UserAction[] = [];
  private sessions: Map<string, Session> = new Map();
  private readonly maxActions: number;

  constructor(maxActions = 500_000) {
    this.maxActions = maxActions;
  }

  // ─── Recording ───────────────────────────────────────────────────────────

  /** Record a single user action */
  recordAction(action: UserAction): void {
    this.actions.push(action);
    if (this.actions.length > this.maxActions) {
      this.actions.splice(0, Math.floor(this.maxActions * 0.1));
    }

    // Update session if sessionId is provided
    if (action.sessionId) {
      const session = this.sessions.get(action.sessionId);
      if (session) {
        session.actions.push(action);
        session.endTime = action.timestamp;
      } else {
        this.sessions.set(action.sessionId, {
          sessionId: action.sessionId,
          userId: action.userId,
          startTime: action.timestamp,
          endTime: action.timestamp,
          actions: [action],
        });
      }
    }
  }

  /** Record multiple actions at once */
  recordActions(actions: UserAction[]): void {
    for (const a of actions) this.recordAction(a);
  }

  /** Explicitly open a session */
  startSession(sessionId: string, userId: string, timestamp = Date.now()): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        sessionId,
        userId,
        startTime: timestamp,
        endTime: timestamp,
        actions: [],
      });
    }
  }

  /** Close a session */
  endSession(sessionId: string, timestamp = Date.now()): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.endTime = timestamp;
    }
  }

  // ─── Active users ─────────────────────────────────────────────────────────

  /** Unique users active on a given day (defaults to today) */
  dau(date = new Date()): number {
    const start = startOfDay(date).getTime();
    const end = start + 24 * 60 * 60 * 1000;
    return this.uniqueUsers(start, end);
  }

  /** Unique users active in the past 7 days */
  wau(referenceDate = new Date()): number {
    const end = startOfDay(referenceDate).getTime() + 24 * 60 * 60 * 1000;
    const start = end - 7 * 24 * 60 * 60 * 1000;
    return this.uniqueUsers(start, end);
  }

  /** Unique users active in the past 30 days */
  mau(referenceDate = new Date()): number {
    const end = startOfDay(referenceDate).getTime() + 24 * 60 * 60 * 1000;
    const start = end - 30 * 24 * 60 * 60 * 1000;
    return this.uniqueUsers(start, end);
  }

  private uniqueUsers(startMs: number, endMs: number): number {
    const users = new Set<string>();
    for (const a of this.actions) {
      if (a.timestamp >= startMs && a.timestamp < endMs) {
        users.add(a.userId);
      }
    }
    return users.size;
  }

  // ─── Engagement score ─────────────────────────────────────────────────────

  /**
   * Compute an engagement score for each user.
   * Weights: create=10, edit=5, search=3, view=1, other=2
   */
  engagementScores(limit = 50): EngagementScore[] {
    const weights: Record<UserActionType, number> = {
      create: 10,
      edit: 5,
      search: 3,
      view: 1,
      delete: 2,
      login: 1,
      logout: 0,
      share: 4,
      export: 3,
    };

    const userActions = new Map<string, UserAction[]>();
    for (const a of this.actions) {
      const existing = userActions.get(a.userId);
      if (existing) {
        existing.push(a);
      } else {
        userActions.set(a.userId, [a]);
      }
    }

    const scores: EngagementScore[] = [];

    for (const [userId, acts] of userActions) {
      const views = acts.filter((a) => a.actionType === "view").length;
      const creates = acts.filter((a) => a.actionType === "create").length;
      const edits = acts.filter((a) => a.actionType === "edit").length;
      const searches = acts.filter((a) => a.actionType === "search").length;

      const score = acts.reduce((s, a) => s + (weights[a.actionType] ?? 0), 0);

      // Session stats for this user
      const userSessions = [...this.sessions.values()].filter(
        (s) => s.userId === userId
      );
      const sessionCount = userSessions.length;
      const totalDuration = userSessions.reduce((sum, s) => {
        return sum + ((s.endTime ?? s.startTime) - s.startTime);
      }, 0);
      const avgSessionDurationMs = sessionCount > 0 ? totalDuration / sessionCount : 0;

      scores.push({
        userId,
        score,
        breakdown: { views, creates, edits, searches, sessionCount, avgSessionDurationMs },
      });
    }

    return scores.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Top N most active users by engagement score */
  topUsers(n = 10): Array<{ userId: string; score: number }> {
    return this.engagementScores(n).map(({ userId, score }) => ({ userId, score }));
  }

  // ─── Activity heatmap ─────────────────────────────────────────────────────

  /**
   * Activity heatmap: 24 hours × 7 days matrix.
   * dayOfWeek: 0=Sunday ... 6=Saturday
   */
  activityHeatmap(
    startTime = 0,
    endTime = Infinity
  ): ActivityHeatmap {
    // 24 hours × 7 days
    const matrix: number[][] = Array.from({ length: 24 }, () =>
      new Array(7).fill(0) as number[]
    );

    for (const a of this.actions) {
      if (a.timestamp < startTime || a.timestamp > endTime) continue;
      const date = new Date(a.timestamp);
      const hour = date.getHours();
      const dow = date.getDay(); // 0=Sun
      if (matrix[hour] && matrix[hour][dow] !== undefined) {
        (matrix[hour] as number[])[dow]++;
      }
    }

    const hourLabels = Array.from({ length: 24 }, (_, i) =>
      `${i.toString().padStart(2, "0")}:00`
    );
    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return { matrix, hourLabels, dayLabels };
  }

  // ─── Retention cohort analysis ────────────────────────────────────────────

  /**
   * Retention cohort analysis by week.
   * Groups new users by the ISO week they first appeared,
   * then tracks what fraction is still active in subsequent weeks.
   * weeksToTrack: how many weeks after cohort week to measure (default: 8)
   */
  retentionCohorts(weeksToTrack = 8): RetentionCohort[] {
    // Find first action timestamp per user
    const firstSeen = new Map<string, number>();
    for (const a of this.actions) {
      const existing = firstSeen.get(a.userId);
      if (existing === undefined || a.timestamp < existing) {
        firstSeen.set(a.userId, a.timestamp);
      }
    }

    // Group users by their cohort week
    const cohortUsers = new Map<string, Set<string>>();
    for (const [userId, ts] of firstSeen) {
      const week = isoWeek(new Date(ts));
      const existing = cohortUsers.get(week);
      if (existing) {
        existing.add(userId);
      } else {
        cohortUsers.set(week, new Set([userId]));
      }
    }

    // For each cohort, compute retention for each subsequent week
    const cohorts: RetentionCohort[] = [];

    for (const [cohortWeek, users] of cohortUsers) {
      const cohortStart = isoWeekStart(cohortWeek);
      const retention: number[] = [];

      for (let w = 0; w <= weeksToTrack; w++) {
        const weekStart = cohortStart + w * 7 * 24 * 60 * 60 * 1000;
        const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000;

        const activeInWeek = new Set<string>();
        for (const a of this.actions) {
          if (
            users.has(a.userId) &&
            a.timestamp >= weekStart &&
            a.timestamp < weekEnd
          ) {
            activeInWeek.add(a.userId);
          }
        }

        retention.push(users.size > 0 ? activeInWeek.size / users.size : 0);
      }

      cohorts.push({
        cohortWeek,
        size: users.size,
        retention,
      });
    }

    return cohorts.sort((a, b) => a.cohortWeek.localeCompare(b.cohortWeek));
  }

  // ─── Session stats ────────────────────────────────────────────────────────

  /** Average session duration in milliseconds */
  avgSessionDurationMs(): number {
    const sessions = [...this.sessions.values()];
    if (sessions.length === 0) return 0;
    const total = sessions.reduce((sum, s) => {
      return sum + ((s.endTime ?? s.startTime) - s.startTime);
    }, 0);
    return total / sessions.length;
  }

  /** Get sessions for a specific user */
  userSessions(userId: string): Session[] {
    return [...this.sessions.values()].filter((s) => s.userId === userId);
  }

  /** Number of actions in a time range */
  actionCount(startTime = 0, endTime = Infinity): number {
    return this.actions.filter(
      (a) => a.timestamp >= startTime && a.timestamp <= endTime
    ).length;
  }

  /** Reset all data */
  reset(): void {
    this.actions = [];
    this.sessions = new Map();
  }

  get totalActions(): number {
    return this.actions.length;
  }

  get totalSessions(): number {
    return this.sessions.size;
  }
}

// ─── Date utilities ───────────────────────────────────────────────────────────

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns ISO 8601 week string like "2024-W03"
 */
function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // ISO week: week starts on Monday
  const dayOfWeek = d.getUTCDay() || 7; // Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayOfWeek); // Thursday of current week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, "0")}`;
}

/**
 * Returns the Monday midnight UTC timestamp for the given ISO week string.
 */
function isoWeekStart(weekStr: string): number {
  const [yearStr, weekPart] = weekStr.split("-W");
  const year = parseInt(yearStr ?? "2024", 10);
  const week = parseInt(weekPart ?? "1", 10);

  // Jan 4 is always in week 1 of ISO calendar
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  // Monday of week 1
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);

  const weekStart = new Date(week1Monday);
  weekStart.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return weekStart.getTime();
}
