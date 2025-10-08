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
            fileType: { type: 'keyword' }
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
  return parts.some(part => SKIP_DIRS.includes(part) || part.startsWith('.'));
}

function isAllowedFile(filePath) {
  // Only allow PDF, DOCX, and PPTX files
  const ext = path.extname(filePath).toLowerCase();
  const allowedExtensions = ['.pdf', '.docx', '.pptx'];
  return allowedExtensions.includes(ext);
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

async function indexFile(filePath, relativePath) {
  try {
    const stats = fs.statSync(filePath);

    if (!stats.isFile() || !isAllowedFile(filePath)) {
      return false;
    }

    // Skip large files (> 50MB for documents, > 10MB for text files)
    const maxSize = documentProcessor.getFileType(filePath) === 'text' ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (stats.size > maxSize) {
      console.log(`Skipping large file: ${relativePath} (${(stats.size / 1024 / 1024).toFixed(1)}MB)`);
      return false;
    }

    console.log(`Processing: ${relativePath}`);
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
          // Chunk metadata
          isChunked: chunks.length > 1,
          chunkIndex: chunk.chunkIndex,
          totalChunks: chunks.length,
          chunkStart: chunk.chunkStart,
          chunkEnd: chunk.chunkEnd
        }
      });
    }

    return true;
  } catch (error) {
    console.error(`Error indexing ${filePath}:`, error.message);
    return false;
  }
}

async function walkDirectory(dirPath, baseDir) {
  let indexed = 0;
  let skipped = 0;

  try {
    const items = fs.readdirSync(dirPath);

    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const relativePath = path.relative(baseDir, itemPath);

      if (shouldSkipPath(relativePath)) {
        skipped++;
        continue;
      }

      const stats = fs.statSync(itemPath);

      if (stats.isDirectory()) {
        const result = await walkDirectory(itemPath, baseDir);
        indexed += result.indexed;
        skipped += result.skipped;
      } else {
        const success = await indexFile(itemPath, relativePath);
        if (success) {
          indexed++;
          if (indexed % 50 === 0) {
            console.log(`Indexed ${indexed} files...`);
          }
        } else {
          skipped++;
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error.message);
  }

  return { indexed, skipped };
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
    const result = await walkDirectory(baseDir, baseDir);

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`\nIndexing completed in ${duration.toFixed(2)} seconds`);
    console.log(`Files indexed: ${result.indexed}`);
    console.log(`Files skipped: ${result.skipped}`);

    // Refresh the index
    await client.indices.refresh({ index: INDEX_NAME });
    console.log('Index refreshed');

  } catch (error) {
    console.error('Indexing failed:', error);
  }
}

if (require.main === module) {
  main();
}
