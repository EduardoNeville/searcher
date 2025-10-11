const fs = require('fs');
const path = require('path');
const { Client } = require('@elastic/elasticsearch');
const mime = require('mime-types');
const DocumentProcessor = require('./documentProcessor');

// Add global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  // Don't exit, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit, just log the error
});

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
      console.log('Index already exists');
      return { existed: true };
    }

    await client.indices.create({
      index: INDEX_NAME,
      body: {
        settings: {
          analysis: {
            analyzer: {
              camelcase_analyzer: {
                type: 'custom',
                tokenizer: 'standard',
                filter: ['lowercase', 'word_delimiter_graph']  // Split CamelCase and joined words
              }
            }
          }
        },
        mappings: {
          properties: {
            filename: { type: 'text', analyzer: 'camelcase_analyzer' },  // Split CamelCase words
            path: { type: 'keyword' },
            hostPath: { type: 'keyword' },
            content: { type: 'text', analyzer: 'camelcase_analyzer' },  // Split CamelCase words
            size: { type: 'long' },
            modified: { type: 'date' },
            created: { type: 'date' },
            extension: { type: 'keyword' },
            fileType: { type: 'keyword' },
            syncStatus: { type: 'keyword' },
            syncError: { type: 'text' },
            lastSyncAttempt: { type: 'date' },
            creator: { type: 'keyword' },
            lastEditor: { type: 'keyword' }
          }
        }
      }
    });

    console.log('Index created successfully');
    return { existed: false };
  } catch (error) {
    console.error('Error creating index:', error);
    throw error;
  }
}

async function cleanupRemovedFolders(currentFolders) {
  try {
    console.log('\n🧹 Checking for documents from removed folders...');

    // Get all unique paths from the index
    const searchResponse = await client.search({
      index: INDEX_NAME,
      body: {
        size: 0,
        aggs: {
          unique_paths: {
            terms: {
              field: 'path',
              size: 10000
            }
          }
        }
      }
    });

    const indexedPaths = searchResponse.body?.aggregations?.unique_paths?.buckets ||
                        searchResponse.aggregations?.unique_paths?.buckets || [];

    if (indexedPaths.length === 0) {
      console.log('   No existing documents found in index');
      return 0;
    }

    // Build a set of configured folder paths for quick lookup
    const configuredFolders = new Set(currentFolders.map(f => f.path));

    // Find paths that don't belong to any configured folder
    const pathsToDelete = [];
    for (const bucket of indexedPaths) {
      const docPath = bucket.key;

      // Check if this path belongs to any configured folder
      const belongsToConfiguredFolder = Array.from(configuredFolders).some(folderPath => {
        // The document path should be the folder path or inside it
        return docPath === folderPath || docPath.startsWith(folderPath + '/');
      });

      if (!belongsToConfiguredFolder) {
        pathsToDelete.push(docPath);
      }
    }

    if (pathsToDelete.length === 0) {
      console.log('   ✓ No orphaned documents found');
      return 0;
    }

    console.log(`   Found ${pathsToDelete.length} document(s) from removed folders`);

    // Delete documents by path (this will also delete all chunks of each document)
    let deletedCount = 0;
    for (const pathToDelete of pathsToDelete) {
      try {
        // Delete by query - this will match the document and all its chunks
        const deleteResponse = await client.deleteByQuery({
          index: INDEX_NAME,
          body: {
            query: {
              term: {
                path: pathToDelete
              }
            }
          },
          refresh: true
        });

        const deleted = deleteResponse.body?.deleted || deleteResponse.deleted || 0;
        deletedCount += deleted;

        if (deleted > 0) {
          console.log(`   🗑️  Deleted ${deleted} document(s) for: ${pathToDelete}`);
        }
      } catch (error) {
        console.error(`   ⚠️  Failed to delete documents for ${pathToDelete}:`, error.message);
      }
    }

    console.log(`   ✓ Cleanup complete: ${deletedCount} document(s) removed\n`);
    return deletedCount;
  } catch (error) {
    console.error('Error during cleanup:', error);
    return 0;
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
  // Allow PDF, Word documents (all formats), and PowerPoint presentations (all formats)
  const ext = path.extname(filePath).toLowerCase();
  const allowedExtensions = [
    // PDF
    '.pdf',
    // Word documents
    '.doc', '.docx', '.docm', '.dot', '.dotx', '.dotm', '.odt', '.rtf',
    // PowerPoint presentations
    '.ppt', '.pptx', '.pptm', '.pot', '.potx', '.potm', '.pps', '.ppsx', '.ppsm'
  ];

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

async function getFileMetadata(filePath, stats) {
  const metadata = {
    creator: null,
    lastEditor: null,
    created: stats.birthtime || stats.ctime
  };

  // Try to get file owner information (works on Linux/Mac)
  try {
    if (process.platform !== 'win32') {
      const { execSync } = require('child_process');

      // Get file owner username
      try {
        const owner = execSync(`stat -c '%U' "${filePath}" 2>/dev/null || stat -f '%Su' "${filePath}" 2>/dev/null`, { encoding: 'utf8' }).trim();
        if (owner) {
          metadata.creator = owner;
          metadata.lastEditor = owner; // Default to same as creator
        }
      } catch (err) {
        // Silently fail if stat command not available
      }
    }
  } catch (error) {
    // Metadata extraction is optional, don't fail indexing
  }

  return metadata;
}

async function trackPlaceholderFile(filePath, relativePath, reason) {
  try {
    const stats = fs.statSync(filePath);
    const filename = path.basename(filePath);
    const extension = path.extname(filePath);
    const fileType = documentProcessor.getFileType(filePath);
    const hostPath = containerToHostPath(filePath);
    const metadata = await getFileMetadata(filePath, stats);

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
        created: metadata.created,
        extension,
        fileType,
        syncStatus: 'pending_sync',
        syncError: reason,
        lastSyncAttempt: new Date(),
        creator: metadata.creator,
        lastEditor: metadata.lastEditor
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
    // Return a properly formatted chunk object even for single chunks
    return [{
      content: content || '',
      chunkIndex: 0,
      chunkStart: 0,
      chunkEnd: (content || '').length
    }];
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

    // Log extraction results
    if (!content || content.length === 0) {
      console.log(`  ⚠️  WARNING: No content extracted from file!`);
    } else {
      // Show first 100 characters of extracted content for verification
      const preview = content.substring(0, 100).replace(/\n/g, ' ');
      console.log(`  📄 Content preview: "${preview}${content.length > 100 ? '...' : ''}"`);
    }

    const filename = path.basename(filePath);
    const extension = path.extname(filePath);
    const fileType = documentProcessor.getFileType(filePath);

    const hostPath = containerToHostPath(filePath);
    const hostRelativePath = containerToHostPath(relativePath);
    const metadata = await getFileMetadata(filePath, stats);

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
          created: metadata.created,
          extension,
          fileType,
          syncStatus: 'synced',
          syncError: null,
          lastSyncAttempt: new Date(),
          creator: metadata.creator,
          lastEditor: metadata.lastEditor,
          // Chunk metadata
          isChunked: chunks.length > 1,
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunks.length,
          chunkStart: chunk.chunkStart,
          chunkEnd: chunk.chunkEnd
        }
      });
    }

    // Log successful processing
    const sizeFormatted = (stats.size / 1024).toFixed(1);
    const contentLength = content.length;
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

    if (chunks.length > 1) {
      console.log(`  ✓ Successfully indexed (${sizeFormatted}KB, ${contentLength} chars, ${wordCount} words, ${chunks.length} chunks)`);
    } else {
      console.log(`  ✓ Successfully indexed (${sizeFormatted}KB, ${contentLength} chars, ${wordCount} words)`);
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

// Helper to load indexed folders
function loadIndexedFolders() {
  const FOLDERS_CONFIG_FILE = path.join(process.env.DB_DIR || '/app/data', 'indexed_folders.json');
  try {
    if (fs.existsSync(FOLDERS_CONFIG_FILE)) {
      const data = fs.readFileSync(FOLDERS_CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading indexed folders:', error);
  }
  // Return default folder
  return [{ path: '/home/user', name: 'Home', addedAt: new Date().toISOString() }];
}

async function deleteDocumentsForFolder(folderPath) {
  try {
    console.log(`\n🗑️  Deleting all documents from folder: ${folderPath}`);

    // Delete all documents where path starts with the folder path
    const deleteResponse = await client.deleteByQuery({
      index: INDEX_NAME,
      body: {
        query: {
          bool: {
            should: [
              { term: { path: folderPath } },
              { prefix: { path: folderPath + '/' } }
            ],
            minimum_should_match: 1
          }
        }
      },
      refresh: true
    });

    const deleted = deleteResponse.body?.deleted || deleteResponse.deleted || 0;
    console.log(`   ✓ Deleted ${deleted} document(s) from ${folderPath}\n`);
    return deleted;
  } catch (error) {
    console.error(`   ⚠️  Failed to delete documents for ${folderPath}:`, error.message);
    return 0;
  }
}

async function main() {
  try {
    // Load indexed folders first
    const folders = loadIndexedFolders();
    console.log(`\n📁 Configured folders (${folders.length}):`);
    folders.forEach(folder => console.log(`   - ${folder.name}: ${folder.path}`));

    console.log('\nCreating/checking Elasticsearch index...');
    const indexInfo = await createIndex();

    if (indexInfo.existed) {
      // Index already exists - clean up documents from removed folders
      await cleanupRemovedFolders(folders);
    }

    console.log('\nStarting file indexing...');
    const startTime = Date.now();

    let totalIndexed = 0;
    let totalSkipped = 0;
    let totalDeleted = 0;
    const allPlaceholderFiles = [];

    // Index each folder
    for (const folder of folders) {
      const baseDir = folder.path;

      // Check if folder exists
      if (!fs.existsSync(baseDir)) {
        console.warn(`\n⚠️  Folder not found: ${baseDir} - skipping`);
        continue;
      }

      console.log(`\n\n📂 Indexing: ${folder.name} (${baseDir})`);
      console.log(`   Maps to ${containerToHostPath(baseDir)} on host\n`);

      // Delete all existing documents for this folder before re-indexing
      // This ensures we don't have stale documents from deleted files
      const deleted = await deleteDocumentsForFolder(baseDir);
      totalDeleted += deleted;

      const placeholderFiles = [];
      const result = await walkDirectory(baseDir, baseDir, placeholderFiles);

      totalIndexed += result.indexed;
      totalSkipped += result.skipped;
      allPlaceholderFiles.push(...placeholderFiles);

      console.log(`\n   ✓ Folder complete: ${result.indexed} indexed, ${result.skipped} skipped`);
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`\n\n═══════════════════════════════════════════════════════`);
    console.log(`Initial indexing completed in ${duration.toFixed(2)} seconds`);
    console.log(`Documents deleted (stale): ${totalDeleted}`);
    console.log(`Files indexed: ${totalIndexed}`);
    console.log(`Files skipped: ${totalSkipped}`);
    console.log(`Placeholder files detected: ${allPlaceholderFiles.length}`);
    console.log(`═══════════════════════════════════════════════════════`);

    // Retry placeholder files
    if (allPlaceholderFiles.length > 0) {
      const retryResult = await retryPlaceholders(allPlaceholderFiles, 2, 30);
      console.log(`\n📊 Retry Results:`);
      console.log(`  Successfully indexed: ${retryResult.indexed}`);
      console.log(`  Still failed/pending: ${retryResult.failed}`);
      console.log(`\n📈 Final totals:`);
      console.log(`  Total indexed: ${totalIndexed + retryResult.indexed}`);
      console.log(`  Total skipped/failed: ${totalSkipped - allPlaceholderFiles.length + retryResult.failed}`);
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
