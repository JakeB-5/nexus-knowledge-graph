import { describe, it, expect } from 'vitest';
import { SchemaMigration } from '../schema-migration.js';

interface V1User {
  __version: '1';
  name: string;
}

interface V2User {
  __version: '2';
  firstName: string;
  lastName: string;
}

interface V3User {
  __version: '3';
  firstName: string;
  lastName: string;
  displayName: string;
}

describe('SchemaMigration', () => {
  function buildMigration() {
    const sm = new SchemaMigration();

    sm.registerMigration({
      fromVersion: '1',
      toVersion: '2',
      description: 'Split name into firstName/lastName',
      migrate: (data) => {
        const v1 = data as V1User;
        const [firstName = '', ...rest] = v1.name.split(' ');
        return { __version: '2', firstName, lastName: rest.join(' ') } as V2User;
      },
    });

    sm.registerMigration({
      fromVersion: '2',
      toVersion: '3',
      description: 'Add displayName',
      migrate: (data) => {
        const v2 = data as V2User;
        return {
          __version: '3',
          firstName: v2.firstName,
          lastName: v2.lastName,
          displayName: `${v2.firstName} ${v2.lastName}`,
        } as V3User;
      },
    });

    return sm;
  }

  describe('registerMigration and migrate', () => {
    it('migrates from v1 to v2', () => {
      const sm = buildMigration();
      const v1: V1User = { __version: '1', name: 'Alice Smith' };
      const result = sm.migrate<V1User, V2User>(v1, '1', '2');
      expect(result.data.firstName).toBe('Alice');
      expect(result.data.lastName).toBe('Smith');
      expect(result.appliedMigrations).toHaveLength(1);
      expect(result.finalVersion).toBe('2');
    });

    it('migrates from v2 to v3', () => {
      const sm = buildMigration();
      const v2: V2User = { __version: '2', firstName: 'Bob', lastName: 'Jones' };
      const result = sm.migrate<V2User, V3User>(v2, '2', '3');
      expect(result.data.displayName).toBe('Bob Jones');
    });

    it('auto-chains v1 → v3 via v2', () => {
      const sm = buildMigration();
      const v1: V1User = { __version: '1', name: 'Carol White' };
      const result = sm.migrate<V1User, V3User>(v1, '1', '3');
      expect(result.data.firstName).toBe('Carol');
      expect(result.data.lastName).toBe('White');
      expect(result.data.displayName).toBe('Carol White');
      expect(result.appliedMigrations).toHaveLength(2);
    });

    it('throws when no migration path exists', () => {
      const sm = buildMigration();
      expect(() => sm.migrate({}, '5', '10')).toThrow(/No migration path/);
    });

    it('returns same data when from === to', () => {
      const sm = buildMigration();
      const v2: V2User = { __version: '2', firstName: 'Dan', lastName: 'Brown' };
      const result = sm.migrate<V2User, V2User>(v2, '2', '2');
      expect(result.appliedMigrations).toHaveLength(0);
      expect(result.data).toBe(v2);
    });
  });

  describe('findPath', () => {
    it('finds direct path', () => {
      const sm = buildMigration();
      expect(sm.findPath('1', '2')).toEqual(['1', '2']);
    });

    it('finds chained path', () => {
      const sm = buildMigration();
      expect(sm.findPath('1', '3')).toEqual(['1', '2', '3']);
    });

    it('returns null for non-existent path', () => {
      const sm = buildMigration();
      expect(sm.findPath('1', '99')).toBe(null);
    });

    it('returns single-element path for same version', () => {
      const sm = buildMigration();
      expect(sm.findPath('2', '2')).toEqual(['2']);
    });
  });

  describe('validate', () => {
    it('returns true when no validator registered', () => {
      const sm = buildMigration();
      expect(sm.validate({ anything: true }, '99')).toBe(true);
    });

    it('uses registered validator', () => {
      const sm = buildMigration();
      sm.registerValidator('2', (data) => {
        const d = data as V2User;
        return typeof d.firstName === 'string' && typeof d.lastName === 'string';
      });

      expect(sm.validate({ firstName: 'A', lastName: 'B' }, '2')).toBe(true);
      expect(sm.validate({ name: 'AB' }, '2')).toBe(false);
    });
  });

  describe('detectVersion', () => {
    it('detects __version field', () => {
      const sm = buildMigration();
      expect(sm.detectVersion({ __version: '3', firstName: 'X' })).toBe('3');
    });

    it('returns null when no __version field', () => {
      const sm = buildMigration();
      expect(sm.detectVersion({ name: 'No version' })).toBe(null);
    });

    it('returns null for non-object data', () => {
      const sm = buildMigration();
      expect(sm.detectVersion('string')).toBe(null);
      expect(sm.detectVersion(42)).toBe(null);
    });
  });

  describe('dryRun', () => {
    it('returns migration plan without executing', () => {
      const sm = buildMigration();
      const result = sm.dryRun('1', '3');
      expect(result.feasible).toBe(true);
      expect(result.wouldApply).toHaveLength(2);
      expect(result.wouldApply[0]?.from).toBe('1');
      expect(result.wouldApply[0]?.to).toBe('2');
      expect(result.wouldApply[0]?.description).toBe('Split name into firstName/lastName');
    });

    it('returns infeasible for unknown path', () => {
      const sm = buildMigration();
      const result = sm.dryRun('1', '99');
      expect(result.feasible).toBe(false);
      expect(result.wouldApply).toHaveLength(0);
    });
  });

  describe('batchMigrate', () => {
    it('migrates all items in a collection', async () => {
      const sm = buildMigration();
      const users: V1User[] = [
        { __version: '1', name: 'Alice Smith' },
        { __version: '1', name: 'Bob Jones' },
        { __version: '1', name: 'Carol White' },
      ];
      const result = await sm.batchMigrate<V1User, V3User>(users, '1', '3');
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.migrated[0]?.data.displayName).toBe('Alice Smith');
      expect(result.migrated[2]?.data.displayName).toBe('Carol White');
    });

    it('continues on error when continueOnError is true', async () => {
      const sm = new SchemaMigration();
      sm.registerMigration({
        fromVersion: '1',
        toVersion: '2',
        migrate: (data) => {
          if ((data as { fail?: boolean }).fail) throw new Error('intentional');
          return { migrated: true };
        },
      });

      const items = [{ fail: false }, { fail: true }, { fail: false }];
      const result = await sm.batchMigrate(items, '1', '2', { continueOnError: true });
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.errors[0]?.index).toBe(1);
    });
  });

  describe('listMigrations / listVersions', () => {
    it('lists all registered migrations', () => {
      const sm = buildMigration();
      expect(sm.listMigrations()).toHaveLength(2);
    });

    it('lists all known versions', () => {
      const sm = buildMigration();
      const versions = sm.listVersions();
      expect(versions).toContain('1');
      expect(versions).toContain('2');
      expect(versions).toContain('3');
    });
  });
});
