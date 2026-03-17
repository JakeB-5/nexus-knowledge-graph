// @nexus/cache - caching utilities package

export type { CacheProvider, CacheOptions, CacheStats, SerializedEntry, SerializedCache } from './types.js';

export { LRUCache } from './lru.js';
export type { LRUCacheOptions } from './lru.js';

export { TtlCache } from './ttl-cache.js';
export type { TtlCacheOptions } from './ttl-cache.js';

export { MultiTierCache } from './multi-tier.js';
export type { MultiTierCacheOptions, TierConfig } from './multi-tier.js';

export { memoize, memoizeAsync, defaultKeySerializer, namespacedKeySerializer, firstArgKeySerializer } from './cache-decorator.js';
export type { MemoizeOptions, AsyncMemoizeOptions, MemoizedFunction, AsyncMemoizedFunction, KeySerializer } from './cache-decorator.js';
