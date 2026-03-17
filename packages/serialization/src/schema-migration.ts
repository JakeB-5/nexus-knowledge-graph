// Schema migration system: register version migrations, auto-chain them,
// validate data, detect version, check backward compatibility, dry-run, batch.

import type { MigrationFn, SchemaVersion } from './types.js';

export interface MigrationRecord {
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  migrate: MigrationFn;
  description?: string;
}

export interface MigrationResult<T = unknown> {
  data: T;
  appliedMigrations: Array<{ from: SchemaVersion; to: SchemaVersion }>;
  finalVersion: SchemaVersion;
}

export interface DryRunResult {
  wouldApply: Array<{ from: SchemaVersion; to: SchemaVersion; description?: string }>;
  path: SchemaVersion[];
  feasible: boolean;
}

export interface BatchMigrationResult<T = unknown> {
  migrated: MigrationResult<T>[];
  errors: Array<{ index: number; error: string }>;
  successCount: number;
  failureCount: number;
}

type VersionedData = { __version?: SchemaVersion } & Record<string, unknown>;

function isVersionedData(data: unknown): data is VersionedData {
  return typeof data === 'object' && data !== null;
}

export class SchemaMigration {
  private migrations: Map<string, MigrationRecord> = new Map();
  private validators: Map<SchemaVersion, (data: unknown) => boolean> = new Map();

  // Register a migration from one version to another
  registerMigration(record: MigrationRecord): void {
    const key = this.migrationKey(record.fromVersion, record.toVersion);
    this.migrations.set(key, record);
  }

  // Register a validator for a specific schema version
  registerValidator(version: SchemaVersion, validate: (data: unknown) => boolean): void {
    this.validators.set(version, validate);
  }

  // Find migration path from one version to another using BFS
  findPath(from: SchemaVersion, to: SchemaVersion): SchemaVersion[] | null {
    if (from === to) return [from];

    const visited = new Set<SchemaVersion>();
    const queue: Array<{ version: SchemaVersion; path: SchemaVersion[] }> = [
      { version: from, path: [from] },
    ];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const { version, path } = current;

      if (visited.has(version)) continue;
      visited.add(version);

      // Find all direct migrations from this version
      for (const record of this.migrations.values()) {
        if (record.fromVersion === version && !visited.has(record.toVersion)) {
          const newPath = [...path, record.toVersion];
          if (record.toVersion === to) return newPath;
          queue.push({ version: record.toVersion, path: newPath });
        }
      }
    }

    return null;
  }

  // Migrate data from its current version to the target version
  migrate<TFrom = unknown, TTo = unknown>(
    data: TFrom,
    fromVersion: SchemaVersion,
    toVersion: SchemaVersion,
  ): MigrationResult<TTo> {
    const path = this.findPath(fromVersion, toVersion);
    if (!path) {
      throw new Error(
        `No migration path found from version "${fromVersion}" to "${toVersion}"`,
      );
    }

    const appliedMigrations: Array<{ from: SchemaVersion; to: SchemaVersion }> = [];
    let current: unknown = data;

    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i]!;
      const to = path[i + 1]!;
      const key = this.migrationKey(from, to);
      const record = this.migrations.get(key);
      if (!record) {
        throw new Error(`Migration not found: ${from} → ${to}`);
      }
      current = record.migrate(current, from, to);
      appliedMigrations.push({ from, to });
    }

    return {
      data: current as TTo,
      appliedMigrations,
      finalVersion: toVersion,
    };
  }

  // Validate data against a specific schema version
  validate(data: unknown, version: SchemaVersion): boolean {
    const validator = this.validators.get(version);
    if (!validator) {
      // No validator registered — assume valid
      return true;
    }
    return validator(data);
  }

  // Detect schema version from data (looks for __version field)
  detectVersion(data: unknown): SchemaVersion | null {
    if (!isVersionedData(data)) return null;
    return data['__version'] ?? null;
  }

  // Check if data at fromVersion is backward compatible with toVersion
  // (i.e., can be used without migration)
  isBackwardCompatible(fromVersion: SchemaVersion, toVersion: SchemaVersion): boolean {
    // Simple heuristic: check if there's a direct migration between adjacent versions
    // In practice, this would involve schema comparison logic
    const key = this.migrationKey(fromVersion, toVersion);
    const reverseKey = this.migrationKey(toVersion, fromVersion);
    return this.migrations.has(key) || this.migrations.has(reverseKey);
  }

  // Preview what migrations would be applied without executing them
  dryRun(fromVersion: SchemaVersion, toVersion: SchemaVersion): DryRunResult {
    const path = this.findPath(fromVersion, toVersion);
    if (!path) {
      return { wouldApply: [], path: [], feasible: false };
    }

    const wouldApply: DryRunResult['wouldApply'] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i]!;
      const to = path[i + 1]!;
      const key = this.migrationKey(from, to);
      const record = this.migrations.get(key);
      wouldApply.push({ from, to, description: record?.description });
    }

    return { wouldApply, path, feasible: true };
  }

  // Batch migrate a collection of items
  async batchMigrate<TFrom = unknown, TTo = unknown>(
    items: TFrom[],
    fromVersion: SchemaVersion,
    toVersion: SchemaVersion,
    options: { continueOnError?: boolean } = {},
  ): Promise<BatchMigrationResult<TTo>> {
    const migrated: MigrationResult<TTo>[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const result = this.migrate<TFrom, TTo>(items[i]!, fromVersion, toVersion);
        migrated.push(result);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        errors.push({ index: i, error });
        if (!options.continueOnError) {
          break;
        }
      }
    }

    return {
      migrated,
      errors,
      successCount: migrated.length,
      failureCount: errors.length,
    };
  }

  // List all registered migrations
  listMigrations(): MigrationRecord[] {
    return Array.from(this.migrations.values());
  }

  // List all known versions (union of from/to across all migrations)
  listVersions(): SchemaVersion[] {
    const versions = new Set<SchemaVersion>();
    for (const record of this.migrations.values()) {
      versions.add(record.fromVersion);
      versions.add(record.toVersion);
    }
    return Array.from(versions).sort();
  }

  private migrationKey(from: SchemaVersion, to: SchemaVersion): string {
    return `${from}→${to}`;
  }
}
