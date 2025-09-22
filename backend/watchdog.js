#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');
const { Client } = require('@elastic/elasticsearch');

class FileWatchdog {
  constructor() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
    });
    this.watchedDirectories = ['/home/eduardoneville'];
    this.isIndexing = false;
    this.pendingUpdates = new Set();
    this.updateTimeout = null;

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
    // Check file extension
    const ext = path.extname(filePath).toLowerCase();
    const indexableExtensions = [
      '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h',
      '.css', '.scss', '.sass', '.html', '.htm', '.xml', '.json', '.yml', '.yaml',
      '.go', '.rs', '.php', '.rb', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat',
      '.sql', '.r', '.m', '.swift', '.kt', '.scala', '.clj', '.hs', '.elm',
      '.pdf', '.doc', '.docx', '.rtf', '.odt', '.tex',
      '.ppt', '.pptx', '.ppsx', '.potx', '.xls', '.xlsx'
    ];

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
      // For now, we'll do a simple approach: re-run the indexer for any changes
      // In a production system, you'd want to handle individual file updates
      await this.runIndexer();
      console.log('✅ File updates processed successfully');
    } catch (error) {
      console.error('❌ Failed to process file updates:', error.message);
    } finally {
      this.isIndexing = false;
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