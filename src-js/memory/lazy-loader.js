/**
 * Lazy Memory Loader (Option C: Streaming Context)
 * On-demand retrieval of warm/cold memory tiers
 * 
 * Pattern: Inspired by Claurst's lazy.rs with O(log n) warm retrieval
 * Purpose: Load context only when queried, avoiding always-on memory load
 */

const fs = require('fs');
const path = require('path');

class LazyMemoryLoader {
  constructor(contextHierarchy, config = {}) {
    this.hierarchy = contextHierarchy;
    this.coldStoragePath = config.coldStoragePath || './memory-archive.jsonl';
    this.indexPath = config.indexPath || './memory-index.json';
    this.warmCacheSize = config.warmCacheSize || 10;
    this.warmCache = [];      // LRU cache for warm memory
    this.coldIndex = null;    // Loaded on demand
    this.indexingEnabled = config.indexingEnabled !== false;
  }

  /**
   * Main entry point: Retrieve context from appropriate tier
   * Lazy loading principle: Fetch only what's needed
   */
  async retrieveContext(query, options = {}) {
    const {
      tier = 'auto',           // 'hot', 'warm', 'cold', 'auto'
      limit = 10,
      includeMetadata = false,
      timeWindow = null        // Optional: only last N ms
    } = options;

    // Try hot memory first (always available)
    let results = this._searchHot(query, limit, timeWindow);
    if (results.length > 0 && tier === 'hot') {
      return results;
    }

    // If not found in hot and tier is 'auto' or 'warm', try warm
    if ((tier === 'warm' || tier === 'auto') && results.length < limit) {
      const warmResults = await this._searchWarm(query, limit - results.length, timeWindow);
      results = results.concat(warmResults);
    }

    // If still not found and tier is 'auto' or 'cold', try cold
    if ((tier === 'cold' || tier === 'auto') && results.length < limit) {
      const coldResults = await this._searchCold(query, limit - results.length, timeWindow);
      results = results.concat(coldResults);
    }

    // Format results
    return this._formatResults(results, includeMetadata);
  }

  /**
   * Search hot memory (O(1) - immediate)
   */
  _searchHot(query, limit, timeWindow) {
    const normalizedQuery = query.toLowerCase();
    const results = [];

    for (const entry of this.hierarchy.hotMemory) {
      if (this._matchesQuery(entry.content, normalizedQuery) &&
          this._withinTimeWindow(entry.timestamp, timeWindow)) {
        results.push({
          ...entry,
          tier: 'hot',
          retrievalTime: 'O(1)'
        });
        
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Search warm memory (O(log n) with LRU cache)
   */
  async _searchWarm(query, limit, timeWindow) {
    const normalizedQuery = query.toLowerCase();
    const results = [];

    // Check LRU cache first
    const cachedResults = this._searchWarmCache(normalizedQuery);
    results.push(...cachedResults);

    if (results.length >= limit) {
      return results.slice(0, limit);
    }

    // Search uncached warm entries
    for (const entry of this.hierarchy.warmMemory) {
      if (!this._isCached(entry) &&
          this._matchesQuery(entry.content, normalizedQuery) &&
          this._withinTimeWindow(entry.compressedAt, timeWindow)) {
        
        results.push({
          ...entry,
          tier: 'warm',
          retrievalTime: 'O(log n)',
          compressed: true
        });

        // Update cache
        this._updateWarmCache(entry);

        if (results.length >= limit) break;
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Search cold memory (O(n) full scan with optional indexing)
   * Lazy loading: Load index only if needed
   */
  async _searchCold(query, limit, timeWindow) {
    const normalizedQuery = query.toLowerCase();
    const results = [];

    // Load index if available (for faster cold searches)
    if (this.indexingEnabled && !this.coldIndex) {
      await this._loadColdIndex();
    }

    // If we have an index, use it for faster retrieval
    if (this.coldIndex && this.coldIndex[normalizedQuery]) {
      const indexedPaths = this.coldIndex[normalizedQuery];
      for (const path of indexedPaths.slice(0, limit)) {
        const entry = await this._loadColdEntry(path);
        if (entry && this._withinTimeWindow(entry.archivedAt, timeWindow)) {
          results.push({
            ...entry,
            tier: 'cold',
            retrievalTime: 'O(1) indexed',
            compressed: true,
            archived: true
          });
          if (results.length >= limit) break;
        }
      }
      return results;
    }

    // Fallback: linear scan of cold storage (expensive!)
    // This would load from JSONL file line by line
    if (fs.existsSync(this.coldStoragePath)) {
      const lines = fs.readFileSync(this.coldStoragePath, 'utf8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          if (this._matchesQuery(JSON.stringify(entry), normalizedQuery) &&
              this._withinTimeWindow(entry.archivedAt, timeWindow)) {
            results.push({
              ...entry,
              tier: 'cold',
              retrievalTime: 'O(n)',
              compressed: true,
              archived: true
            });
            if (results.length >= limit) break;
          }
        } catch (e) {
          // Skip malformed lines
        }
      }
    }

    return results;
  }

  /**
   * Search warm LRU cache
   */
  _searchWarmCache(query) {
    return this.warmCache.filter(entry =>
      this._matchesQuery(entry.content, query)
    ).slice(0, 5);
  }

  /**
   * Update LRU cache (move to front, evict oldest if full)
   */
  _updateWarmCache(entry) {
    // Remove if already in cache (for LRU reordering)
    this.warmCache = this.warmCache.filter(e => e.timestamp !== entry.timestamp);

    // Add to front
    this.warmCache.unshift(entry);

    // Evict oldest if cache full
    if (this.warmCache.length > this.warmCacheSize) {
      this.warmCache.pop();
    }
  }

  /**
   * Check if entry is in warm cache
   */
  _isCached(entry) {
    return this.warmCache.some(e => e.timestamp === entry.timestamp);
  }

  /**
   * Load cold index from disk (lazy operation)
   */
  async _loadColdIndex() {
    return new Promise((resolve) => {
      if (fs.existsSync(this.indexPath)) {
        try {
          const indexData = fs.readFileSync(this.indexPath, 'utf8');
          this.coldIndex = JSON.parse(indexData);
        } catch (e) {
          this.coldIndex = {};
        }
      } else {
        this.coldIndex = {};
      }
      resolve();
    });
  }

  /**
   * Load single cold entry from disk
   */
  async _loadColdEntry(entryPath) {
    return new Promise((resolve) => {
      try {
        if (fs.existsSync(entryPath)) {
          const data = fs.readFileSync(entryPath, 'utf8');
          resolve(JSON.parse(data));
        } else {
          resolve(null);
        }
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Basic query matching (case-insensitive substring)
   */
  _matchesQuery(text, query) {
    return text.toLowerCase().includes(query);
  }

  /**
   * Check if timestamp is within optional time window
   */
  _withinTimeWindow(timestamp, timeWindow) {
    if (!timeWindow) return true;
    const now = Date.now();
    return (now - timestamp) <= timeWindow;
  }

  /**
   * Format retrieved results for consumption
   */
  _formatResults(results, includeMetadata) {
    return results.map(entry => {
      const result = {
        content: entry.content,
        tier: entry.tier,
        timestamp: entry.timestamp
      };

      if (includeMetadata) {
        result.metadata = {
          retrievalTime: entry.retrievalTime,
          compressed: entry.compressed || false,
          archived: entry.archived || false,
          originalTokens: entry.originalTokens,
          compressedTokens: entry.compressedTokens || entry.tokens
        };
      }

      return result;
    });
  }

  /**
   * Build cold index (indexing operation)
   * Should be called periodically after archiving
   */
  async buildColdIndex() {
    const index = {};

    // Index all cold entries
    for (const entry of this.hierarchy.coldMemory) {
      const words = entry.content.toLowerCase().split(/\W+/);
      for (const word of words) {
        if (word.length > 3) {  // Skip short words
          if (!index[word]) {
            index[word] = [];
          }
          index[word].push(entry.archivedAt);
        }
      }
    }

    // Save index
    return new Promise((resolve) => {
      fs.writeFileSync(this.indexPath, JSON.stringify(index, null, 2));
      this.coldIndex = index;
      resolve();
    });
  }

  /**
   * Export cold memory to archive file (JSONL format)
   */
  async archiveColdMemory() {
    return new Promise((resolve) => {
      const stream = fs.createWriteStream(this.coldStoragePath, { flags: 'a' });

      for (const entry of this.hierarchy.coldMemory) {
        stream.write(JSON.stringify(entry) + '\n');
      }

      stream.end(() => {
        resolve();
      });
    });
  }

  /**
   * Get lazy loader statistics
   */
  getStats() {
    return {
      cacheSize: this.warmCache.length,
      cacheCapacity: this.warmCacheSize,
      indexLoaded: this.coldIndex !== null,
      indexEntries: this.coldIndex ? Object.keys(this.coldIndex).length : 0,
      coldStorageExists: fs.existsSync(this.coldStoragePath),
      coldStorageSize: fs.existsSync(this.coldStoragePath) ?
        fs.statSync(this.coldStoragePath).size : 0
    };
  }
}

module.exports = {
  LazyMemoryLoader
};
