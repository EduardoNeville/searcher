const Database = require('better-sqlite3');
const CryptoJS = require('crypto-js');
const path = require('path');
const fs = require('fs');

class SearchHistory {
  constructor() {
    // Use a persistent location for the database
    const dbDir = process.env.DB_DIR || '/app/data';

    // Ensure directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, 'search_history.db');
    this.db = new Database(dbPath);

    // Generate or use provided encryption key
    this.encryptionKey = process.env.ENCRYPTION_KEY || this.generateKey();

    this.initDatabase();
  }

  generateKey() {
    // Generate a random key if none is provided
    // In production, this should be set via environment variable
    return CryptoJS.lib.WordArray.random(256/8).toString();
  }

  initDatabase() {
    // Create search history table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        encrypted_query TEXT NOT NULL,
        results_count INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_timestamp
      ON search_queries(timestamp DESC)
    `);
  }

  encrypt(text) {
    return CryptoJS.AES.encrypt(text, this.encryptionKey).toString();
  }

  decrypt(encryptedText) {
    try {
      const bytes = CryptoJS.AES.decrypt(encryptedText, this.encryptionKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      console.error('Decryption error:', error);
      return null;
    }
  }

  addQuery(query, resultsCount = 0) {
    try {
      const encryptedQuery = this.encrypt(query);
      const stmt = this.db.prepare(`
        INSERT INTO search_queries (encrypted_query, results_count)
        VALUES (?, ?)
      `);

      const result = stmt.run(encryptedQuery, resultsCount);
      return result.lastInsertRowid;
    } catch (error) {
      console.error('Error adding query:', error);
      return null;
    }
  }

  getRecentQueries(limit = 50) {
    try {
      const stmt = this.db.prepare(`
        SELECT id, encrypted_query, results_count, timestamp
        FROM search_queries
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      const rows = stmt.all(limit);

      // Decrypt queries
      return rows.map(row => ({
        id: row.id,
        query: this.decrypt(row.encrypted_query),
        resultsCount: row.results_count,
        timestamp: row.timestamp
      })).filter(row => row.query !== null); // Filter out failed decryptions
    } catch (error) {
      console.error('Error getting recent queries:', error);
      return [];
    }
  }

  searchQueries(searchTerm, limit = 20) {
    try {
      // Get all recent queries and filter in memory (since they're encrypted)
      const allQueries = this.getRecentQueries(500);

      const searchLower = searchTerm.toLowerCase();
      const filtered = allQueries.filter(item =>
        item.query && item.query.toLowerCase().includes(searchLower)
      );

      return filtered.slice(0, limit);
    } catch (error) {
      console.error('Error searching queries:', error);
      return [];
    }
  }

  deleteQuery(id) {
    try {
      const stmt = this.db.prepare('DELETE FROM search_queries WHERE id = ?');
      stmt.run(id);
      return true;
    } catch (error) {
      console.error('Error deleting query:', error);
      return false;
    }
  }

  clearHistory() {
    try {
      this.db.exec('DELETE FROM search_queries');
      return true;
    } catch (error) {
      console.error('Error clearing history:', error);
      return false;
    }
  }

  getStats() {
    try {
      const stmt = this.db.prepare(`
        SELECT
          COUNT(*) as total_queries,
          COUNT(DISTINCT DATE(timestamp)) as days_active
        FROM search_queries
      `);

      return stmt.get();
    } catch (error) {
      console.error('Error getting stats:', error);
      return { total_queries: 0, days_active: 0 };
    }
  }

  close() {
    this.db.close();
  }
}

module.exports = SearchHistory;
