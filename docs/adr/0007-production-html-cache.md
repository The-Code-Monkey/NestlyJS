# Production page HTML is cached in memory

`nestly start` caches rendered page HTML in a small in-memory LRU keyed by URL path. The default limit is 100 entries; `NESTLY_HTML_CACHE_SIZE=0` disables it. Builds are treated as immutable, so there is no TTL or cross-process invalidation.

Re-rendering every request is simpler, but pages are deterministic server renders and the cache removes repeated work cheaply. Consequence: pages must not depend on per-request headers or cookies for their HTML, cache entries disappear on worker restart, and each cluster worker has its own cache. A shared cache or invalidation layer is deferred.
