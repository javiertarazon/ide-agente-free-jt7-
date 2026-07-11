/**
 * Context Hierarchy Management
 * Implements Option A: Hierarchical Compression with Smart Memory Tiers
 * 
 * Pattern: Inspired by Claurst's compact.rs, adapted for JavaScript runtime
 * Purpose: Autonomously manage context tokens across three memory tiers
 */

const { estimateTokens, stringifyBudgetInput } = require('../core/context-budget');

class ContextHierarchy {
  constructor(config = {}) {
    this.hotCapacity = config.hotCapacity || 50000;      // Current turn context
    this.warmCapacity = config.warmCapacity || 30000;     // Recent history (compressed)
    this.coldCapacity = config.coldCapacity || Infinity;  // Archive (permanent)
    
    this.hotMemory = [];        // Full fidelity - current conversation
    this.warmMemory = [];       // Compressed - session history
    this.coldMemory = [];       // Archived - permanent record (JSONL)
    
    this.compressionRules = config.compressionRules || DEFAULT_RULES;
    this.lastCompactionTime = Date.now();
    this.compactionIntervalMs = config.compactionIntervalMs || 3600000; // 1 hour
  }

  /**
   * Estimate token count (rough heuristic: 4 chars ≈ 1 token)
   */
  estimateTokens(text) {
    return estimateTokens(text);
  }

  _normalizeMessageContent(message) {
    return stringifyBudgetInput(message);
  }

  /**
   * Add message to hot memory (current turn)
   * Automatically promotes old hot entries to warm if needed
   */
  pushHotMemory(message) {
    const content = this._normalizeMessageContent(message);
    this.hotMemory.push({
      timestamp: Date.now(),
      content,
      raw: message,
      type: this._detectType(content),
      tokens: this.estimateTokens(content)
    });

    // Check if we need promotion
    const hotTokens = this._totalTokens(this.hotMemory);
    if (hotTokens > this.hotCapacity) {
      this._promoteOldestHot();
    }
  }

  /**
   * Promote oldest hot memory entries to warm (with compression)
   */
  _promoteOldestHot() {
    while (this.hotMemory.length > 0 && this._totalTokens(this.hotMemory) > this.hotCapacity * 0.9) {
      const entry = this.hotMemory.shift();
      const compressed = this._compress(entry);
      
      this.warmMemory.push({
        ...entry,
        compressedAt: Date.now(),
        originalTokens: entry.tokens,
        compressedTokens: this.estimateTokens(compressed),
        content: compressed // Replace with compressed version
      });
    }

    // Prune warm if needed
    if (this._totalTokens(this.warmMemory) > this.warmCapacity) {
      this._archiveOldestWarm();
    }
  }

  /**
   * Archive oldest warm entries to cold (permanent storage)
   */
  _archiveOldestWarm() {
    while (this.warmMemory.length > 0 && this._totalTokens(this.warmMemory) > this.warmCapacity * 0.9) {
      const entry = this.warmMemory.shift();
      this.coldMemory.push({
        ...entry,
        archivedAt: Date.now()
      });
    }
  }

  /**
   * Hierarchical compression algorithm (Option A)
   * Extracts atomic units (tool calls + results) and decision points
   */
  _compress(entry) {
    const rules = this.compressionRules[entry.type] || this.compressionRules.default;
    
    if (!rules) return entry.content;

    let compressed = this._normalizeMessageContent(entry.content);

    // Rule 1: Remove repeated explanations
    compressed = compressed.replace(/(\b\w{10,}\b)(.{0,100})\1/g, '$1 [repeated]');

    // Rule 2: Collapse multi-line identical text
    const lines = compressed.split('\n');
    const deduped = [lines[0]];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] !== lines[i-1]) {
        deduped.push(lines[i]);
      }
    }
    compressed = deduped.join('\n');

    // Rule 3: Extract decision points
    if (entry.type === 'agent-reasoning') {
      compressed = this._extractDecisionPoints(compressed);
    }

    // Rule 4: Tool result atomicity
    if (entry.type === 'tool-result') {
      compressed = this._compressTool(compressed, rules);
    }

    return compressed;
  }

  /**
   * Extract only decision points from verbose reasoning
   */
  _extractDecisionPoints(text) {
    const decisionKeywords = [
      'decide',
      'chose',
      'selected',
      'option',
      'recommended',
      'priority',
      'next step'
    ];

    const lines = text.split('\n');
    const decisions = lines.filter(line =>
      decisionKeywords.some(kw => line.toLowerCase().includes(kw))
    );

    if (decisions.length === 0) {
      // Fallback: take first and last meaningful lines
      return [lines[0], lines[lines.length - 1]].filter(l => l.length > 10).join('\n...\n');
    }

    return decisions.slice(0, 5).join('\n');
  }

  /**
   * Compress tool result to atomic unit (path/hash + outcome)
   */
  _compressTool(text, rules) {
    // Extract file path if present
    const pathMatch = text.match(/(?:file|path|uri):\s*([^\s\n]+)/i);
    const path = pathMatch ? pathMatch[1] : '';

    // Extract outcome (success/failure)
    const successMatch = text.match(/success|completed|✅|✓/i);
    const outcome = successMatch ? 'success' : 'unknown';

    // Extract error if present
    const errorMatch = text.match(/error:\s*(.+?)(?:\n|$)/i);
    const error = errorMatch ? errorMatch[1].slice(0, 50) : '';

    // Reconstruct minimally
    let result = `[Tool] ${outcome}`;
    if (path) result += ` | ${path}`;
    if (error) result += ` | Error: ${error}`;

    return result;
  }

  /**
   * Identify message type for compression selection
   */
  _detectType(message) {
    const text = this._normalizeMessageContent(message);
    if (text.includes('deciding') || text.includes('analyzing')) return 'agent-reasoning';
    if (text.includes('<function_calls>')) return 'tool-call';
    if (text.includes('function_results')) return 'tool-result';
    if (text.includes('error') || text.includes('Error')) return 'error';
    return 'default';
  }

  /**
   * Calculate total tokens in memory tier
   */
  _totalTokens(tier) {
    return tier.reduce((sum, entry) => sum + entry.tokens, 0);
  }

  /**
   * Get current context statistics
   */
  getStats() {
    return {
      hot: {
        entries: this.hotMemory.length,
        tokens: this._totalTokens(this.hotMemory),
        capacity: this.hotCapacity,
        utilization: (this._totalTokens(this.hotMemory) / this.hotCapacity * 100).toFixed(1) + '%'
      },
      warm: {
        entries: this.warmMemory.length,
        tokens: this._totalTokens(this.warmMemory),
        capacity: this.warmCapacity,
        utilization: (this._totalTokens(this.warmMemory) / this.warmCapacity * 100).toFixed(1) + '%',
        compressionRatio: this._calculateCompressionRatio()
      },
      cold: {
        entries: this.coldMemory.length,
        archiveSize: this._totalTokens(this.coldMemory)
      },
      totalTokens: this._totalTokens(this.hotMemory) + this._totalTokens(this.warmMemory),
      efficiency: ((1 - (this._totalTokens(this.hotMemory) + this._totalTokens(this.warmMemory)) / 200000) * 100).toFixed(1) + '%'
    };
  }

  /**
   * Calculate how much compression saved
   */
  _calculateCompressionRatio() {
    const totalOriginal = this.warmMemory.reduce((sum, e) => sum + (e.originalTokens || 0), 0);
    const totalCompressed = this._totalTokens(this.warmMemory);
    if (totalOriginal === 0) return '0%';
    return ((1 - totalCompressed / totalOriginal) * 100).toFixed(1) + '%';
  }

  /**
   * Get compressible context (warm memory) for reinjection if needed
   * This is the lazy-loader interface (Option C)
   */
  async getWarmMemory(query) {
    // Simple keyword search in warm memory
    const matches = this.warmMemory.filter(entry =>
      entry.content.toLowerCase().includes(query.toLowerCase())
    );

    return matches.slice(0, 10).map(e => ({
      timestamp: e.timestamp,
      content: e.content,
      originalSize: e.originalTokens,
      compressed: true
    }));
  }

  /**
   * Periodic automatic compaction (Claurst auto_dream pattern)
   */
  shouldCompact() {
    const now = Date.now();
    const timeSinceCompaction = now - this.lastCompactionTime;
    const hotUtilization = this._totalTokens(this.hotMemory) / this.hotCapacity;

    // Compact if: time elapsed OR utilization high
    return (timeSinceCompaction > this.compactionIntervalMs) || (hotUtilization > 0.95);
  }

  performCompaction() {
    if (this.shouldCompact()) {
      this._promoteOldestHot();
      this.lastCompactionTime = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Export current context as JSON (for serialization/debugging)
   */
  export() {
    return {
      timestamp: Date.now(),
      hotMemory: this.hotMemory,
      warmMemory: this.warmMemory,
      stats: this.getStats()
    };
  }

  /**
   * Import saved context (for session restoration)
   */
  import(data) {
    if (data.hotMemory) this.hotMemory = data.hotMemory;
    if (data.warmMemory) this.warmMemory = data.warmMemory;
    this.lastCompactionTime = data.timestamp || Date.now();
  }
}

/**
 * Default compression rules by message type
 */
const DEFAULT_RULES = {
  'agent-reasoning': {
    extractDecisions: true,
    maxLines: 5,
    removeRepeats: true
  },
  'tool-result': {
    atomicFormat: true,
    preservePath: true,
    compressOutcome: true
  },
  'tool-call': {
    preserveSignature: true,
    preserveParams: true,
    compressExplanation: true
  },
  'default': {
    removeRepeats: true,
    collapseWhitespace: true
  }
};

module.exports = {
  ContextHierarchy,
  DEFAULT_RULES
};
