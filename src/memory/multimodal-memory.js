/**
 * Multi-modal Memory - 存储图表、截图、K线形态
 *
 * Supports storing and retrieving:
 * - Trading charts/screenshots
 * - K-line patterns
 * - Technical indicator images
 * - Custom visual content
 *
 * Uses embedding-based similarity matching for chart retrieval.
 */

import * as fs from 'fs';
import * as path from 'path';

export class MultiModalMemory {
  constructor(basePath) {
    this.basePath = basePath;
    this.imagesPath = path.join(basePath, 'images');
    this.indexPath = path.join(basePath, 'multimodal-index.json');
    this.index = new Map();
    this._init();
  }

  _init() {
    try {
      fs.mkdirSync(this.imagesPath, { recursive: true });
      if (fs.existsSync(this.indexPath)) {
        this.index = new Map(JSON.parse(fs.readFileSync(this.indexPath, 'utf-8')));
      }
    } catch (e) {
      console.error('[MultiModalMemory] Failed to init:', e.message);
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.indexPath, JSON.stringify(
        Array.from(this.index.entries()),
        null, 2
      ));
    } catch (e) {
      console.error('[MultiModalMemory] Failed to save:', e.message);
    }
  }

  /**
   * Save an image with metadata
   * @param {string} imageData - Base64 or file path
   * @param {object} metadata - Image metadata
   */
  async saveImage(imageData, metadata = {}) {
    const imageId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const ext = metadata.format || 'png';
    const filename = `${imageId}.${ext}`;
    const filepath = path.join(this.imagesPath, filename);

    try {
      // If base64, decode and save
      if (imageData.startsWith('data:')) {
        const base64Data = imageData.split(',')[1];
        fs.writeFileSync(filepath, Buffer.from(base64Data, 'base64'));
      } else if (imageData.startsWith('/') || imageData.startsWith('./')) {
        // Copy from file path
        fs.copyFileSync(imageData, filepath);
      } else {
        // Assume raw base64
        fs.writeFileSync(filepath, Buffer.from(imageData, 'base64'));
      }

      // Generate simple embedding from metadata
      const embedding = this._generateEmbedding(metadata);

      const entry = {
        id: imageId,
        filename,
        filepath,
        metadata: {
          ...metadata,
          savedAt: new Date().toISOString()
        },
        embedding,
        tags: metadata.tags || [],
        description: metadata.description || ''
      };

      this.index.set(imageId, entry);
      this._save();

      return { success: true, id: imageId, path: filepath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Generate embedding from metadata
   */
  _generateEmbedding(metadata) {
    const text = [
      metadata.type || '',
      metadata.symbol || '',
      metadata.pattern || '',
      metadata.description || '',
      (metadata.tags || []).join(' ')
    ].join(' ');

    // Simple hash-based vector
    const dim = 512;
    const vector = new Array(dim).fill(0);
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      vector[i % dim] += char;
      vector[(i * 7) % dim] += char * 2;
    }
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map(v => v / magnitude);
  }

  /**
   * Cosine similarity
   */
  _cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Find similar images by query
   */
  async findSimilar(query, limit = 5) {
    const queryEmbedding = this._generateEmbedding(query);
    const results = [];

    for (const [id, entry] of this.index.entries()) {
      const similarity = this._cosineSimilarity(queryEmbedding, entry.embedding);
      if (similarity > 0.5) {
        results.push({
          id,
          filename: entry.filename,
          metadata: entry.metadata,
          description: entry.description,
          tags: entry.tags,
          similarity
        });
      }
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  /**
   * Get image by ID
   */
  getImage(imageId) {
    const entry = this.index.get(imageId);
    if (!entry) return null;

    try {
      const data = fs.readFileSync(entry.filepath);
      const base64 = data.toString('base64');
      const ext = entry.filename.split('.').pop();
      return {
        id: imageId,
        data: `data:image/${ext};base64,${base64}`,
        metadata: entry.metadata,
        description: entry.description,
        tags: entry.tags
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * List all images with filters
   */
  listImages(filters = {}) {
    let images = Array.from(this.index.values());

    if (filters.symbol) {
      images = images.filter(img =>
        img.metadata.symbol?.toUpperCase() === filters.symbol.toUpperCase()
      );
    }

    if (filters.type) {
      images = images.filter(img => img.metadata.type === filters.type);
    }

    if (filters.pattern) {
      images = images.filter(img =>
        img.metadata.pattern?.toLowerCase().includes(filters.pattern.toLowerCase())
      );
    }

    return images.map(img => ({
      id: img.id,
      filename: img.filename,
      metadata: img.metadata,
      description: img.description,
      tags: img.tags
    }));
  }

  /**
   * Delete image
   */
  deleteImage(imageId) {
    const entry = this.index.get(imageId);
    if (!entry) return { success: false, error: 'Image not found' };

    try {
      if (fs.existsSync(entry.filepath)) {
        fs.unlinkSync(entry.filepath);
      }
      this.index.delete(imageId);
      this._save();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * Add tag to image
   */
  addTag(imageId, tag) {
    const entry = this.index.get(imageId);
    if (!entry) return { success: false, error: 'Image not found' };

    if (!entry.tags.includes(tag)) {
      entry.tags.push(tag);
      this._save();
    }
    return { success: true, tags: entry.tags };
  }

  /**
   * Get memory statistics
   */
  getStats() {
    const images = Array.from(this.index.values());
    const symbols = [...new Set(images.map(img => img.metadata.symbol).filter(Boolean))];
    const types = [...new Set(images.map(img => img.metadata.type).filter(Boolean))];
    const totalSize = images.reduce((sum, img) => {
      try {
        const stat = fs.statSync(img.filepath);
        return sum + stat.size;
      } catch {
        return sum;
      }
    }, 0);

    return {
      totalImages: images.length,
      symbols,
      types,
      totalSize,
      avgSize: images.length > 0 ? Math.round(totalSize / images.length) : 0
    };
  }
}

export default MultiModalMemory;