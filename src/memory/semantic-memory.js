/**
 * Semantic Memory - Embedding-based Semantic Search
 *
 * Provides semantic understanding of memory content using embeddings.
 * Unlike keyword search, semantic search understands meaning.
 *
 * Example:
 *   "上次讨论的那个止损方法" → finds content about stop-loss
 *   even if the word "止损" doesn't appear directly
 */

import * as fs from 'fs';
import * as path from 'path';

const EMBEDDING_DIM = 1536; // OpenAI embedding dimension
const SIMILARITY_THRESHOLD = 0.7;

export class SemanticMemory {
  constructor(basePath) {
    this.basePath = basePath;
    this.indexPath = path.join(basePath, 'semantic-index.json');
    this.embeddingCache = new Map();
    this._loadIndex();
  }

  _loadIndex() {
    try {
      if (fs.existsSync(this.indexPath)) {
        const data = JSON.parse(fs.readFileSync(this.indexPath, 'utf-8'));
        this.embeddingCache = new Map(data.entries || []);
      }
    } catch (e) {
      console.error('[SemanticMemory] Failed to load index:', e.message);
      this.embeddingCache = new Map();
    }
  }

  _saveIndex() {
    try {
      fs.mkdirSync(this.basePath, { recursive: true });
      fs.writeFileSync(this.indexPath, JSON.stringify({
        entries: Array.from(this.embeddingCache.entries()),
        updatedAt: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      console.error('[SemanticMemory] Failed to save index:', e.message);
    }
  }

  /**
   * Generate a simple hash-based embedding for text
   * In production, use OpenAI embeddings or similar
   */
  _simpleEmbedding(text) {
    // Simple hash-based vector for demo purposes
    // In production, replace with actual embedding API
    const vector = new Array(EMBEDDING_DIM).fill(0);
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      vector[i % EMBEDDING_DIM] += char;
      vector[(i * 31) % EMBEDDING_DIM] += char * 2;
    }
    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map(v => v / magnitude);
  }

  /**
   * Cosine similarity between two vectors
   */
  _cosineSimilarity(a, b) {
    if (a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Add content to semantic index
   */
  async addContent(key, content, metadata = {}) {
    const embedding = this._simpleEmbedding(content);
    this.embeddingCache.set(key, {
      embedding,
      content,
      metadata,
      indexedAt: new Date().toISOString()
    });
    this._saveIndex();
    return true;
  }

  /**
   * Search semantic memory
   * @param {string} query - Search query
   * @param {number} limit - Max results
   * @param {number} threshold - Similarity threshold (0-1)
   */
  async search(query, limit = 5, threshold = SIMILARITY_THRESHOLD) {
    const queryEmbedding = this._simpleEmbedding(query);
    const results = [];

    for (const [key, entry] of this.embeddingCache.entries()) {
      const similarity = this._cosineSimilarity(queryEmbedding, entry.embedding);
      if (similarity >= threshold) {
        results.push({
          key,
          content: entry.content,
          metadata: entry.metadata,
          similarity,
          indexedAt: entry.indexedAt
        });
      }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, limit);
  }

  /**
   * Clear semantic memory
   */
  clear() {
    this.embeddingCache.clear();
    this._saveIndex();
  }

  /**
   * Get index statistics
   */
  getStats() {
    return {
      totalEntries: this.embeddingCache.size,
      dimension: EMBEDDING_DIM,
      indexPath: this.indexPath
    };
  }
}

export default SemanticMemory;