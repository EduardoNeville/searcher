const fs = require('fs');
const path = require('path');
const { Client } = require('@elastic/elasticsearch');
const mime = require('mime-types');
const DocumentProcessor = require('./documentProcessor');

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
});

const INDEX_NAME = 'files';

const documentProcessor = new DocumentProcessor();

// Path translation between container and host
// The container always uses /home/user, but the host path comes from HOST_HOME
const CONTAINER_BASE = '/home/user';
const HOST_BASE = process.env.HOST_HOME || process.env.HOME || '/home/user';

function containerToHostPath(containerPath) {
  return containerPath.replace(CONTAINER_BASE, HOST_BASE);
}

function hostToContainerPath(hostPath) {
  return hostPath.replace(HOST_BASE, CONTAINER_BASE);
}

// Directories to skip
const SKIP_DIRS = [
  'node_modules', '.git', '.svn', 'dist', 'build', 'target', '.next', '.nuxt',
  '__pycache__', '.pytest_cache', 'venv', 'env', '.venv', '.env',
  'vendor', 'bower_components', '.sass-cache', 'tmp', 'temp'
];

async function createIndex() {
  try {
    const indexExists = await client.indices.exists({ index: INDEX_NAME });

    if (indexExists) {
      console.log('Index already exists, deleting...');
      await client.indices.delete({ index: INDEX_NAME });
    }

    await client.indices.create({
      index: INDEX_NAME,
      body: {
        settings: {
          analysis: {
            analyzer: {
              content_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'stop']
              }
            }
          }
        },
        mappings: {
          properties: {
            filename: { type: 'text', analyzer: 'content_analyzer' },
            path: { type: 'keyword' },
            hostPath: { type: 'keyword' },
            content: { type: 'text', analyzer: 'content_analyzer' },
            size: { type: 'long' },
            modified: { type: 'date' },
            extension: { type: 'keyword' },
            fileType: { type: 'keyword' },
            syncStatus: { type: 'keyword' },
            syncError: { type: 'text' },
            lastSyncAttempt: { type: 'date' }
          }
        }
      }
    });

    console.log('Index created successfully');
  } catch (error) {
    console.error('Error creating index:', error);
  }
}

function shouldSkipPath(filePath) {
  const parts = filePath.split(path.sep);
  // Skip if any part of the path starts with '.' (hidden directories or files)
  // or if it's in the SKIP_DIRS list
  return parts.some(part => part.startsWith('.') || SKIP_DIRS.includes(part));
}

function isHiddenFile(filePath) {
  // Check if the file itself is hidden (starts with .)
  const basename = path.basename(filePath);
  return basename.startsWith('.');
}

function isAllowedFile(filePath) {
  // Only allow PDF, DOCX, and PPTX files
  const ext = path.extname(filePath).toLowerCase();
  const allowedExtensions = ['.pdf', '.docx', '.pptx'];

  if (!allowedExtensions.includes(ext)) {
    return false;
  }

  // Skip Microsoft Office temporary/lock files (start with ~$)
  const basename = path.basename(filePath);
  if (basename.startsWith('~$')) {
    return false;
  }

  return true;
}

async function trackPlaceholderFile(filePath, relativePath, reason) {
  try {
    const stats = fs.statSync(filePath);
    const filename = path.basename(filePath);
    const extension = path.extname(filePath);
    const fileType = documentProcessor.getFileType(filePath);
    const hostPath = containerToHostPath(filePath);

    await client.index({
      index: INDEX_NAME,
      id: relativePath,
      body: {
        filename,
        path: relativePath,
        hostPath: hostPath,
        content: '',
        size: stats.size,
        modified: stats.mtime,
        extension,
        fileType,
        syncStatus: 'pending_sync',
        syncError: reason,
        lastSyncAttempt: new Date()
      }
    });
  } catch (error) {
    console.error(`Error tracking placeholder ${filePath}:`, error.message);
  }
}

function chunkContent(content, chunkSize = 500000) {
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

async function indexFile(filePath, relativePath, retryInfo = { attempt: 1, maxRetries: 3 }) {
  try {
    const stats = fs.statSync(filePath);

    if (!stats.isFile() || !isAllowedFile(filePath)) {
      return { success: false, reason: 'not_allowed' };
    }

    // Log file size for large files
    if (stats.size > 10 * 1024 * 1024) {
      console.log(`Processing large file: ${relativePath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
    } else {
      console.log(`Processing: ${relativePath}`);
    }
    const content = await documentProcessor.extractText(filePath);

    const filename = path.basename(filePath);
    const extension = path.extname(filePath);
    const fileType = documentProcessor.getFileType(filePath);

    const hostPath = containerToHostPath(filePath);
    const hostRelativePath = containerToHostPath(relativePath);

    // Chunk the content for large documents
    const chunks = chunkContent(content);

    if (chunks.length > 1) {
      console.log(`  📦 Splitting into ${chunks.length} chunks (content size: ${content.length} chars)`);
    }

    // Index each chunk as a separate document
    for (const chunk of chunks) {
      const docId = chunks.length > 1
        ? `${relativePath}::chunk${chunk.chunkIndex}`
        : relativePath;

      await client.index({
        index: INDEX_NAME,
        id: docId,
        body: {
          filename,
          path: relativePath,
          hostPath: hostPath, // Full absolute path on host machine
          content: chunk.content,
          size: stats.size,
          modified: stats.mtime,
          extension,
          fileType,
          syncStatus: 'synced',
          syncError: null,
          lastSyncAttempt: new Date(),
          // Chunk metadata
          isChunked: chunks.length > 1,
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunks.length,
          chunkStart: chunk.chunkStart,
          chunkEnd: chunk.chunkEnd
        }
      });
    }

    return { success: true };
  } catch (error) {
    // Check if this is a placeholder file
    if (error.message && error.message.startsWith('PLACEHOLDER_FILE:')) {
      const reason = error.message.replace('PLACEHOLDER_FILE: ', '');
      console.warn(`  ⏸️  Placeholder detected: ${relativePath} - ${reason}`);

      // Track the placeholder file in the index
      await trackPlaceholderFile(filePath, relativePath, reason);

      return {
        success: false,
        reason: 'placeholder',
        placeholder: true,
        details: reason,
        filePath,
        relativePath
      };
    }

    console.error(`Error indexing ${filePath}:`, error.message);
    return { success: false, reason: 'error', error: error.message };
  }
}

async function walkDirectory(dirPath, baseDir, placeholderFiles = []) {
  let indexed = 0;
  let skipped = 0;

  try {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      // Skip hidden files/directories immediately
      if (item.startsWith('.')) {
        skipped++;
        continue;
      }

      const itemPath = path.join(dirPath, item);
      const relativePath = path.relative(baseDir, itemPath);

      if (shouldSkipPath(relativePath)) {
        skipped++;
        continue;
      }

      // Check if path exists (handles broken symlinks)
      let stats;
      try {
        stats = fs.statSync(itemPath);
      } catch (statError) {
        if (statError.code === 'ENOENT') {
          console.warn(`  ⚠️  Skipping broken symlink or inaccessible path: ${relativePath}`);
          skipped++;
          continue;
        }
        throw statError;
      }

      if (stats.isDirectory()) {
        const result = await walkDirectory(itemPath, baseDir, placeholderFiles);
        indexed += result.indexed;
        skipped += result.skipped;
      } else {
        const result = await indexFile(itemPath, relativePath);
        if (result.success) {
          indexed++;
          if (indexed % 50 === 0) {
            console.log(`Indexed ${indexed} files...`);
          }
        } else if (result.placeholder) {
          // Track placeholder files for retry
          placeholderFiles.push(result);
          skipped++;
        } else {
          skipped++;
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error.message);
  }

  return { indexed, skipped, placeholderFiles };
}

async function retryPlaceholders(placeholderFiles, maxRetries = 2, delaySeconds = 30) {
  if (placeholderFiles.length === 0) return { indexed: 0, failed: 0 };

  console.log(`\n🔄 Found ${placeholderFiles.length} placeholder/syncing files`);
  console.log(`Will retry after ${delaySeconds} seconds to allow syncing to complete...`);

  let indexed = 0;
  let failed = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (placeholderFiles.length === 0) break;

    console.log(`\n⏳ Waiting ${delaySeconds} seconds before retry attempt ${attempt}/${maxRetries}...`);
    await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));

    console.log(`\n🔄 Retry attempt ${attempt}/${maxRetries} for ${placeholderFiles.length} files...`);
    const stillPlaceholder = [];

    for (const fileInfo of placeholderFiles) {
      console.log(`  Retrying: ${fileInfo.relativePath}`);
      const result = await indexFile(fileInfo.filePath, fileInfo.relativePath);

      if (result.success) {
        indexed++;
        console.log(`  ✓ Successfully indexed`);
      } else if (result.placeholder) {
        stillPlaceholder.push(result);
        console.log(`  ⏸️  Still a placeholder: ${result.details}`);
      } else {
        failed++;
        console.log(`  ✗ Failed: ${result.error || result.reason}`);
      }
    }

    placeholderFiles = stillPlaceholder;
  }

  if (placeholderFiles.length > 0) {
    console.log(`\n⚠️  ${placeholderFiles.length} files still not synced after ${maxRetries} retries:`);
    placeholderFiles.forEach(f => console.log(`   - ${f.relativePath}`));
    failed += placeholderFiles.length;
  }

  return { indexed, failed };
}

async function main() {
  try {
    console.log('Creating Elasticsearch index...');
    await createIndex();

    console.log('Starting file indexing...');
    const startTime = Date.now();

    // Index files from the mounted directory
    // Always use /home/user in the container (this is where MOUNT_DIR is mounted)
    const baseDir = '/home/user';
    console.log(`Indexing directory: ${baseDir} (maps to ${HOST_BASE} on host)`);

    const placeholderFiles = [];
    const result = await walkDirectory(baseDir, baseDir, placeholderFiles);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`\nInitial indexing completed in ${duration.toFixed(2)} seconds`);
    console.log(`Files indexed: ${result.indexed}`);
    console.log(`Files skipped: ${result.skipped}`);
    console.log(`Placeholder files detected: ${placeholderFiles.length}`);

    // Retry placeholder files
    if (placeholderFiles.length > 0) {
      const retryResult = await retryPlaceholders(placeholderFiles, 2, 30);
      console.log(`\n📊 Retry Results:`);
      console.log(`  Successfully indexed: ${retryResult.indexed}`);
      console.log(`  Still failed/pending: ${retryResult.failed}`);
      console.log(`\n📈 Final totals:`);
      console.log(`  Total indexed: ${result.indexed + retryResult.indexed}`);
      console.log(`  Total skipped/failed: ${result.skipped - placeholderFiles.length + retryResult.failed}`);
    }

    // Refresh the index
    await client.indices.refresh({ index: INDEX_NAME });
    console.log('\n✓ Index refreshed');

  } catch (error) {
    console.error('Indexing failed:', error);
  }
}

if (require.main === module) {
  main();
}
