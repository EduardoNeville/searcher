#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');
const { Client } = require('@elastic/elasticsearch');
const DocumentProcessor = require('./documentProcessor');

class FileWatchdog {
  constructor() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
    });
    this.documentProcessor = new DocumentProcessor();
    // Container always uses /home/user as the mount point
    const mountDir = '/home/user';
    this.watchedDirectories = [mountDir];
    this.baseDir = mountDir;
    this.isIndexing = false;
    this.pendingUpdates = new Set();
    this.updateTimeout = null;
    this.indexName = 'files';

    // Path mapping constants
    this.CONTAINER_BASE = '/home/user';
    this.HOST_BASE = process.env.HOST_HOME || process.env.HOME || '/home/user';

    // Directories to skip
    this.skipDirs = [
      'node_modules', '.git', '.svn', 'dist', 'build', 'target', '.next', '.nuxt',
      '__pycache__', '.pytest_cache', 'venv', 'env', '.venv', '.env',
      '.cache', '.npm', '.yarn', 'coverage', '.coverage', '.nyc_output',
      'tmp', 'temp', '.tmp', '.DS_Store', 'Thumbs.db'
    ];

    this.init();
  }

  async init() {
    console.log('🐕 File Watchdog starting...');

    // Wait for Elasticsearch to be ready
    await this.waitForElasticsearch();

    // Cold start - full reindex
    await this.coldStartIndexer();

    // Start file system watcher
    this.startFileWatcher();

    console.log('🐕 Watchdog is now monitoring your files...');
  }

  async waitForElasticsearch() {
    console.log('⏳ Waiting for Elasticsearch to be ready...');

    while (true) {
      try {
        await this.client.ping();
        console.log('✅ Elasticsearch is ready!');
        break;
      } catch (error) {
        console.log('⏳ Elasticsearch not ready, waiting 5 seconds...');
        await this.sleep(5000);
      }
    }
  }

  async coldStartIndexer() {
    console.log('🧊 Starting cold indexing...');

    try {
      // Delete existing index
      try {
        await this.client.indices.delete({ index: 'files' });
        console.log('🗑️  Deleted existing index');
      } catch (error) {
        // Index might not exist, that's fine
      }

      // Run the indexer
      await this.runIndexer();

      console.log('✅ Cold start indexing completed!');
    } catch (error) {
      console.error('❌ Cold start failed:', error.message);
      process.exit(1);
    }
  }

  runIndexer() {
    return new Promise((resolve, reject) => {
      console.log('📇 Running file indexer...');

      const indexer = spawn('node', ['indexer.js'], {
        cwd: __dirname,
        stdio: 'pipe'
      });

      let output = '';

      indexer.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stdout.write(text);
      });

      indexer.stderr.on('data', (data) => {
        const text = data.toString();
        output += text;
        process.stderr.write(text);
      });

      indexer.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Indexer completed successfully');
          resolve(output);
        } else {
          console.error(`❌ Indexer failed with code ${code}`);
          reject(new Error(`Indexer failed with exit code ${code}`));
        }
      });

      indexer.on('error', (error) => {
        console.error('❌ Failed to start indexer:', error);
        reject(error);
      });
    });
  }

  startFileWatcher() {
    console.log('👁️  Starting file system watcher...');

    const watcher = chokidar.watch(this.watchedDirectories, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: false,
      depth: 10,
      ignored: [
        // Skip common uninteresting directories
        new RegExp(`(${this.skipDirs.join('|')})`),
        /\.git\//,
        /node_modules\//,
        /\.cache\//,
        // Skip temporary files
        /.*\.tmp$/,
        /.*\.temp$/,
        /.*~$/,
        /.*\.swp$/,
        /.*\.swo$/,
        // Skip system files
        /\.DS_Store$/,
        /Thumbs\.db$/
      ]
    });

    // Handle file events
    watcher
      .on('add', (filePath) => this.handleFileChange('added', filePath))
      .on('change', (filePath) => this.handleFileChange('changed', filePath))
      .on('unlink', (filePath) => this.handleFileChange('removed', filePath))
      .on('ready', () => {
        console.log('👁️  File watcher is ready and monitoring changes');
      })
      .on('error', (error) => {
        console.error('👁️  Watcher error:', error);
      });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down watchdog...');
      watcher.close();
      process.exit(0);
    });
  }

  handleFileChange(eventType, filePath) {
    // Skip if not a file we care about
    if (!this.shouldIndexFile(filePath)) {
      return;
    }

    console.log(`📄 File ${eventType}: ${filePath}`);

    // Add to pending updates
    this.pendingUpdates.add({ eventType, filePath });

    // Debounce updates - wait for 2 seconds of quiet before processing
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    this.updateTimeout = setTimeout(() => {
      this.processPendingUpdates();
    }, 2000);
  }

  shouldIndexFile(filePath) {
    // Only index PDF, DOCX, and PPTX files
    const ext = path.extname(filePath).toLowerCase();
    const indexableExtensions = ['.pdf', '.docx', '.pptx'];

    if (!indexableExtensions.includes(ext)) {
      return false;
    }

    // Check if in a skipped directory
    const normalizedPath = path.normalize(filePath);
    for (const skipDir of this.skipDirs) {
      if (normalizedPath.includes(`/${skipDir}/`) || normalizedPath.includes(`\\${skipDir}\\`)) {
        return false;
      }
    }

    return true;
  }

  async processPendingUpdates() {
    if (this.isIndexing || this.pendingUpdates.size === 0) {
      return;
    }

    this.isIndexing = true;
    const updates = Array.from(this.pendingUpdates);
    this.pendingUpdates.clear();

    console.log(`🔄 Processing ${updates.length} file updates...`);

    try {
      for (const update of updates) {
        const { eventType, filePath } = update;

        if (eventType === 'removed') {
          await this.removeFileFromIndex(filePath);
        } else {
          // For 'added' or 'changed' events, index/update the file
          await this.indexSingleFile(filePath);
        }
      }

      // Refresh the index to make changes visible
      await this.client.indices.refresh({ index: this.indexName });
      console.log('✅ File updates processed successfully');
    } catch (error) {
      console.error('❌ Failed to process file updates:', error.message);
    } finally {
      this.isIndexing = false;
    }
  }

  async indexSingleFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found, skipping: ${filePath}`);
        return;
      }

      const stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        return;
      }

      // Skip large files (> 50MB)
      const maxSize = 50 * 1024 * 1024;
      if (stats.size > maxSize) {
        console.log(`⚠️  Skipping large file: ${filePath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
        return;
      }

      console.log(`📄 Indexing: ${filePath}`);
      let content = await this.documentProcessor.extractText(filePath);

      // Limit content size to prevent Elasticsearch issues with huge documents
      // Keep first 1MB of text content (approximately 1 million characters)
      const maxContentLength = 1000000;
      if (content && content.length > maxContentLength) {
        console.log(`  ⚠️  Truncating content from ${content.length} to ${maxContentLength} characters`);
        content = content.substring(0, maxContentLength);
      }

      const filename = path.basename(filePath);
      const extension = path.extname(filePath);
      const fileType = this.documentProcessor.getFileType(filePath);

      // Convert container path to host path
      const hostPath = filePath.replace(this.CONTAINER_BASE, this.HOST_BASE);
      const relativePath = path.relative(this.baseDir, filePath);

      // Delete existing document with same path (if any)
      await this.removeFileFromIndex(filePath);

      // Index the new/updated document
      await this.client.index({
        index: this.indexName,
        body: {
          filename,
          path: relativePath,
          hostPath: hostPath,
          content,
          size: stats.size,
          modified: stats.mtime,
          extension,
          fileType
        }
      });

      console.log(`✅ Indexed: ${relativePath}`);
    } catch (error) {
      console.error(`❌ Error indexing ${filePath}:`, error.message);
    }
  }

  async removeFileFromIndex(filePath) {
    try {
      const relativePath = path.relative(this.baseDir, filePath);

      // Search for the document by path
      const searchResult = await this.client.search({
        index: this.indexName,
        body: {
          query: {
            term: {
              'path.keyword': relativePath
            }
          }
        }
      });

      // Delete all matching documents
      if (searchResult.hits.hits.length > 0) {
        for (const hit of searchResult.hits.hits) {
          await this.client.delete({
            index: this.indexName,
            id: hit._id
          });
        }
        console.log(`🗑️  Removed from index: ${relativePath}`);
      }
    } catch (error) {
      if (error.meta?.statusCode === 404) {
        // Index or document doesn't exist, that's fine
        return;
      }
      console.error(`❌ Error removing ${filePath} from index:`, error.message);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start the watchdog if this file is run directly
if (require.main === module) {
  new FileWatchdog();
}

module.exports = FileWatchdog;