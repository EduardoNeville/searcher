#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
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

    // File state tracking for polling-based monitoring
    this.fileStates = new Map(); // path -> {mtime, size}
    this.pollInterval = 30000; // Poll every 30 seconds
    this.pollTimer = null;

    this.init();
  }

  async init() {
    console.log('🐕 File Watchdog starting (polling mode)...');

    // Wait for Elasticsearch to be ready
    await this.waitForElasticsearch();

    // Cold start - full reindex
    await this.coldStartIndexer();

    // Build initial file state map
    await this.buildFileStateMap();

    // Start polling-based monitoring
    this.startPollingMonitor();

    console.log('🐕 Watchdog is now monitoring your files (polling every 30s)...');
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
    console.log('🧊 Checking index status...');

    try {
      // Check if index exists
      const indexExists = await this.client.indices.exists({ index: this.indexName });

      if (indexExists) {
        console.log('✅ Index already exists, skipping full re-index');
        console.log('📊 The watchdog will monitor for file changes incrementally');

        // Get current document count
        try {
          const countResponse = await this.client.count({ index: this.indexName });
          const count = countResponse.body?.count || countResponse.count || 0;
          console.log(`📚 Current index contains ${count} document(s)`);
        } catch (error) {
          console.log('⚠️  Could not get document count:', error.message);
        }

        // Check for completeness - verify all files are indexed
        await this.checkIndexCompleteness();
      } else {
        console.log('🆕 Index does not exist, performing initial indexing...');
        // Run the indexer for first-time setup
        await this.runIndexer();
        console.log('✅ Initial indexing completed!');
      }
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

  async buildFileStateMap() {
    console.log('📊 Building file state map...');
    let fileCount = 0;

    const walkDirectory = async (dirPath) => {
      try {
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
          // Skip hidden items
          if (item.startsWith('.')) continue;

          const fullPath = path.join(dirPath, item);

          try {
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
              // Skip directories we don't care about
              if (this.skipDirs.includes(item)) continue;

              // Recursively walk subdirectories
              await walkDirectory(fullPath);
            } else if (stats.isFile() && this.shouldIndexFile(fullPath)) {
              // Track file state
              this.fileStates.set(fullPath, {
                mtime: stats.mtimeMs,
                size: stats.size
              });
              fileCount++;
            }
          } catch (err) {
            // Skip files we can't access
            continue;
          }
        }
      } catch (err) {
        // Skip directories we can't read
        return;
      }
    };

    await walkDirectory(this.baseDir);
    console.log(`📊 Tracking ${fileCount} files`);
  }

  startPollingMonitor() {
    console.log('🔄 Starting polling monitor...');

    const pollFiles = async () => {
      try {
        await this.checkForChanges();
      } catch (error) {
        console.error('❌ Error during polling:', error.message);
      }

      // Schedule next poll
      this.pollTimer = setTimeout(pollFiles, this.pollInterval);
    };

    // Start polling
    pollFiles();

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down watchdog...');
      if (this.pollTimer) {
        clearTimeout(this.pollTimer);
      }
      process.exit(0);
    });
  }

  async checkForChanges() {
    const changes = {
      added: [],
      modified: [],
      removed: []
    };

    // Build current state
    const currentFiles = new Set();

    const walkDirectory = async (dirPath) => {
      try {
        const items = fs.readdirSync(dirPath);

        for (const item of items) {
          if (item.startsWith('.')) continue;

          const fullPath = path.join(dirPath, item);

          try {
            const stats = fs.statSync(fullPath);

            if (stats.isDirectory()) {
              if (this.skipDirs.includes(item)) continue;
              await walkDirectory(fullPath);
            } else if (stats.isFile() && this.shouldIndexFile(fullPath)) {
              currentFiles.add(fullPath);

              const oldState = this.fileStates.get(fullPath);

              if (!oldState) {
                // New file
                changes.added.push(fullPath);
                this.fileStates.set(fullPath, {
                  mtime: stats.mtimeMs,
                  size: stats.size
                });
              } else if (oldState.mtime !== stats.mtimeMs || oldState.size !== stats.size) {
                // Modified file
                changes.modified.push(fullPath);
                this.fileStates.set(fullPath, {
                  mtime: stats.mtimeMs,
                  size: stats.size
                });
              }
            }
          } catch (err) {
            continue;
          }
        }
      } catch (err) {
        return;
      }
    };

    await walkDirectory(this.baseDir);

    // Check for removed files
    for (const trackedPath of this.fileStates.keys()) {
      if (!currentFiles.has(trackedPath)) {
        changes.removed.push(trackedPath);
        this.fileStates.delete(trackedPath);
      }
    }

    // Process changes
    const totalChanges = changes.added.length + changes.modified.length + changes.removed.length;

    if (totalChanges > 0) {
      console.log(`🔄 Detected ${totalChanges} changes (${changes.added.length} added, ${changes.modified.length} modified, ${changes.removed.length} removed)`);

      // Process all changes
      for (const filePath of changes.removed) {
        await this.removeFileFromIndex(filePath);
      }

      for (const filePath of [...changes.added, ...changes.modified]) {
        await this.indexSingleFile(filePath);
      }

      // Refresh index
      await this.client.indices.refresh({ index: this.indexName });
      console.log('✅ Changes processed');
    }
  }


  chunkContent(content, chunkSize = 500000) {
    // Split content into chunks with overlap for better search continuity
    const chunks = [];
    const overlapSize = 5000; // 5KB overlap between chunks

    if (!content || content.length <= chunkSize) {
      return [content || ''];
    }

    let position = 0;
    let chunkIndex = 0;

    while (position < content.length) {
      const end = Math.min(position + chunkSize, content.length);
      const chunk = content.substring(position, end);
      chunks.push({
        content: chunk,
        chunkIndex: chunkIndex,
        chunkStart: position,
        chunkEnd: end
      });

      position += chunkSize - overlapSize;
      chunkIndex++;
    }

    return chunks;
  }

  shouldIndexFile(filePath) {
    // Only index PDF, DOCX, and PPTX files
    const ext = path.extname(filePath).toLowerCase();
    const indexableExtensions = ['.pdf', '.docx', '.pptx'];

    if (!indexableExtensions.includes(ext)) {
      return false;
    }

    // Skip hidden files (files starting with .)
    const basename = path.basename(filePath);
    if (basename.startsWith('.')) {
      return false;
    }

    // Skip files in hidden directories
    const normalizedPath = path.normalize(filePath);
    const pathParts = normalizedPath.split(path.sep);
    for (const part of pathParts) {
      if (part.startsWith('.')) {
        return false;
      }
    }

    // Check if in a skipped directory
    for (const skipDir of this.skipDirs) {
      if (normalizedPath.includes(`/${skipDir}/`) || normalizedPath.includes(`\\${skipDir}\\`)) {
        return false;
      }
    }

    return true;
  }

  async checkIndexCompleteness() {
    console.log('🔍 Checking index completeness...');

    try {
      // Build a set of all files on disk
      const filesOnDisk = new Set();
      let diskFileCount = 0;

      const walkDirectory = async (dirPath) => {
        try {
          const items = fs.readdirSync(dirPath);

          for (const item of items) {
            if (item.startsWith('.')) continue;

            const fullPath = path.join(dirPath, item);

            try {
              const stats = fs.statSync(fullPath);

              if (stats.isDirectory()) {
                if (this.skipDirs.includes(item)) continue;
                await walkDirectory(fullPath);
              } else if (stats.isFile() && this.shouldIndexFile(fullPath)) {
                const relativePath = path.relative(this.baseDir, fullPath);
                filesOnDisk.add(relativePath);
                diskFileCount++;
              }
            } catch (err) {
              continue;
            }
          }
        } catch (err) {
          return;
        }
      };

      await walkDirectory(this.baseDir);
      console.log(`   Found ${diskFileCount} indexable files on disk`);

      // Get all unique paths from the index (excluding chunks)
      const indexedPaths = new Set();
      let scrollId = null;
      let totalHits = 0;

      // Use scroll API to get all documents
      let response = await this.client.search({
        index: this.indexName,
        scroll: '1m',
        size: 1000,
        body: {
          query: {
            match_all: {}
          },
          _source: ['path']
        }
      });

      scrollId = response.body?.scroll_id || response._scroll_id;
      let hits = response.body?.hits?.hits || response.hits?.hits || [];
      totalHits = response.body?.hits?.total?.value || response.hits?.total?.value || 0;

      // Process first batch
      for (const hit of hits) {
        const docPath = hit._source.path;
        indexedPaths.add(docPath);
      }

      // Continue scrolling to get all documents
      while (hits.length > 0) {
        response = await this.client.scroll({
          scroll_id: scrollId,
          scroll: '1m'
        });

        hits = response.body?.hits?.hits || response.hits?.hits || [];
        for (const hit of hits) {
          const docPath = hit._source.path;
          indexedPaths.add(docPath);
        }
      }

      // Clear scroll
      if (scrollId) {
        await this.client.clearScroll({ scroll_id: scrollId });
      }

      console.log(`   Found ${indexedPaths.size} unique files in index (${totalHits} total documents including chunks)`);

      // Find missing files (on disk but not in index)
      const missingFiles = [];
      for (const diskPath of filesOnDisk) {
        if (!indexedPaths.has(diskPath)) {
          missingFiles.push(diskPath);
        }
      }

      if (missingFiles.length > 0) {
        console.log(`   ⚠️  Missing ${missingFiles.length} files from index:`);
        // Show first 10 missing files
        const toShow = missingFiles.slice(0, 10);
        toShow.forEach(file => console.log(`      - ${file}`));
        if (missingFiles.length > 10) {
          console.log(`      ... and ${missingFiles.length - 10} more`);
        }

        // Index missing files immediately
        console.log(`   📄 Indexing missing files...`);
        for (const relativePath of missingFiles) {
          const fullPath = path.join(this.baseDir, relativePath);
          await this.indexSingleFile(fullPath);
        }

        // Refresh index
        await this.client.indices.refresh({ index: this.indexName });
        console.log(`   ✅ Indexed ${missingFiles.length} missing files`);
      } else {
        console.log(`   ✅ All files are indexed`);
      }

      return {
        total: diskFileCount,
        indexed: indexedPaths.size,
        missing: missingFiles.length
      };
    } catch (error) {
      console.error('   ❌ Error checking completeness:', error.message);
      return { total: 0, indexed: 0, missing: 0 };
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

      // Log file size for large files
      if (stats.size > 10 * 1024 * 1024) {
        console.log(`📄 Indexing large file: ${filePath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
      } else {
        console.log(`📄 Indexing: ${filePath}`);
      }
      const content = await this.documentProcessor.extractText(filePath);

      const filename = path.basename(filePath);
      const extension = path.extname(filePath);
      const fileType = this.documentProcessor.getFileType(filePath);

      // Convert container path to host path
      const hostPath = filePath.replace(this.CONTAINER_BASE, this.HOST_BASE);
      const relativePath = path.relative(this.baseDir, filePath);

      // Delete existing document and all chunks with same path (if any)
      await this.removeFileFromIndex(filePath);

      // Chunk the content for large documents
      const chunks = this.chunkContent(content);

      if (chunks.length > 1) {
        console.log(`  📦 Splitting into ${chunks.length} chunks (content size: ${content.length} chars)`);
      }

      // Index each chunk as a separate document
      for (const chunk of chunks) {
        const docId = chunks.length > 1
          ? `${relativePath}::chunk${chunk.chunkIndex}`
          : relativePath;

        await this.client.index({
          index: this.indexName,
          id: docId,
          body: {
            filename,
            path: relativePath,
            hostPath: hostPath,
            content: chunk.content,
            size: stats.size,
            modified: stats.mtime,
            extension,
            fileType,
            // Chunk metadata
            isChunked: chunks.length > 1,
            chunkIndex: chunk.chunkIndex,
            totalChunks: chunks.length,
            chunkStart: chunk.chunkStart,
            chunkEnd: chunk.chunkEnd
          }
        });
      }

      console.log(`✅ Indexed: ${relativePath}`);
    } catch (error) {
      console.error(`❌ Error indexing ${filePath}:`, error.message);
    }
  }

  async removeFileFromIndex(filePath) {
    try {
      const relativePath = path.relative(this.baseDir, filePath);

      // Search for all documents (including chunks) by path
      const searchResult = await this.client.search({
        index: this.indexName,
        size: 1000, // Ensure we get all chunks
        body: {
          query: {
            term: {
              'path.keyword': relativePath
            }
          }
        }
      });

      // Delete all matching documents (including all chunks)
      if (searchResult.hits.hits.length > 0) {
        for (const hit of searchResult.hits.hits) {
          await this.client.delete({
            index: this.indexName,
            id: hit._id
          });
        }
        console.log(`🗑️  Removed from index: ${relativePath} (${searchResult.hits.hits.length} document(s))`);
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