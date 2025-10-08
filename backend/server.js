const express = require('express');
const cors = require('cors');
const { Client } = require('@elastic/elasticsearch');
const SearchHistory = require('./searchHistory');

const app = express();
const port = 3001;

// Path mapping constants
const CONTAINER_BASE = '/home/user';
const HOST_BASE = process.env.HOST_HOME || process.env.HOME || '/home/user';

// Initialize Elasticsearch client
const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
});

// Initialize search history
const searchHistory = new SearchHistory();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const health = await client.cluster.health();
    res.json({ status: 'ok', elasticsearch: health });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Search endpoint
app.get('/search', async (req, res) => {
  try {
    const { q, size = 20 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const searchResponse = await client.search({
      index: 'files',
      body: {
        query: {
          multi_match: {
            query: q,
            fields: ['content^2', 'filename', 'path'],
            type: 'best_fields',
            fuzziness: 'AUTO'
          }
        },
        highlight: {
          fields: {
            content: {
              fragment_size: 150,
              number_of_fragments: 3,
              // Limit highlighting to avoid errors with very large documents
              max_analyzed_offset: 500000
            }
          }
        },
        size: parseInt(size)
      }
    });

    // Handle both old and new Elasticsearch client response formats
    const hits = searchResponse.body?.hits?.hits || searchResponse.hits?.hits || [];

    // Merge chunks from the same file
    const fileMap = new Map();

    for (const hit of hits) {
      const source = hit._source;
      const filePath = source.path;

      if (!fileMap.has(filePath)) {
        // First chunk or non-chunked document for this file
        fileMap.set(filePath, {
          id: hit._id,
          score: hit._score,
          filename: source.filename,
          path: source.hostPath || source.path,
          content: source.content || '', // Ensure content is always a string
          highlights: hit.highlight?.content || [],
          size: source.size,
          modified: source.modified,
          fileType: source.fileType,
          isChunked: source.isChunked || false,
          totalChunks: source.totalChunks || 1,
          chunks: source.isChunked ? [{ index: source.chunkIndex, score: hit._score }] : []
        });
      } else {
        // Additional chunk for existing file - merge with higher score
        const existing = fileMap.get(filePath);
        if (hit._score > existing.score) {
          existing.score = hit._score;
          existing.content = source.content || existing.content || ''; // Use chunk with best match, fallback to existing or empty
          existing.highlights = hit.highlight?.content || existing.highlights;
        }
        if (source.isChunked) {
          existing.chunks.push({ index: source.chunkIndex, score: hit._score });
        }
      }
    }

    // Convert map to array and sort by score
    const results = Array.from(fileMap.values())
      .sort((a, b) => b.score - a.score)
      .map(result => {
        // Remove internal chunks array from response
        const { chunks, ...rest } = result;
        return rest;
      });

    // Handle both old and new Elasticsearch client response formats for total count
    const totalHits = searchResponse.body?.hits?.total?.value ||
                      searchResponse.body?.hits?.total ||
                      searchResponse.hits?.total?.value ||
                      searchResponse.hits?.total || 0;

    // Save query to search history
    if (q && results.length > 0) {
      searchHistory.addQuery(q, results.length);
    }

    res.json({
      total: results.length, // Total unique files (not chunks)
      totalChunks: totalHits, // Total chunks matched
      results
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed', message: error.message });
  }
});

// Open/serve file endpoint - Serves files directly in the browser
app.get('/file/*', async (req, res) => {
  try {
    const fs = require('fs');
    const pathModule = require('path');
    const mime = require('mime-types');

    // Extract file path from URL (everything after /file/)
    const filePath = req.path.substring(6); // Remove '/file/' prefix

    // Handle path mapping between search index paths and container mount points
    let absolutePath;
    if (filePath.startsWith(HOST_BASE + '/')) {
      // Map host path to container path
      absolutePath = filePath.replace(HOST_BASE + '/', CONTAINER_BASE + '/');
    } else if (filePath.startsWith(CONTAINER_BASE + '/')) {
      // Already correctly mapped
      absolutePath = filePath;
    } else {
      // Relative path, join with mounted volume root
      absolutePath = pathModule.join(CONTAINER_BASE, filePath);
    }

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get file stats
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      return res.status(400).json({ error: 'Path is not a file' });
    }

    // Get MIME type
    const mimeType = mime.lookup(absolutePath) || 'application/octet-stream';
    const ext = pathModule.extname(absolutePath).toLowerCase();

    // Set appropriate headers
    res.set({
      'Content-Type': mimeType,
      'Content-Length': stats.size,
      'Content-Disposition': `inline; filename="${pathModule.basename(absolutePath)}"`,
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    });

    // For certain file types, force download instead of inline display
    const downloadTypes = ['.exe', '.zip', '.rar', '.tar', '.gz', '.7z'];
    if (downloadTypes.includes(ext)) {
      res.set('Content-Disposition', `attachment; filename="${pathModule.basename(absolutePath)}"`);
    }

    // Stream the file
    const fileStream = fs.createReadStream(absolutePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('File stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to read file' });
      }
    });

  } catch (error) {
    console.error('File serve error:', error);
    res.status(500).json({ error: 'Failed to serve file', message: error.message });
  }
});

// Open file with OS default application
app.post('/open-file', async (req, res) => {
  try {
    const { path } = req.body;

    if (!path) {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Map container path to host path for file opening
    let hostPath = path;
    if (path.startsWith(CONTAINER_BASE + '/')) {
      // Map container path back to host path for the host system
      hostPath = path.replace(CONTAINER_BASE + '/', HOST_BASE + '/');
    }

    // Create a command file for the file opener watcher
    const fs = require('fs');
    const pathModule = require('path');
    const commandDir = '/app/file_commands'; // This is the mounted directory
    const timestamp = Date.now();
    const commandFile = pathModule.join(commandDir, `open_${timestamp}.sh`);

    // Create the shell command to open the file
    const command = `#!/bin/bash
# File to open: ${hostPath}
# Generated at: ${new Date().toISOString()}

# Determine the platform and use appropriate command
case "$(uname -s)" in
  Darwin*)
    open "${hostPath}"
    ;;
  Linux*)
    xdg-open "${hostPath}"
    ;;
  CYGWIN*|MINGW32*|MSYS*|MINGW*)
    start "" "${hostPath}"
    ;;
  *)
    echo "Unsupported platform: $(uname -s)"
    exit 1
    ;;
esac
`;

    // Write the command file
    fs.writeFileSync(commandFile, command, { mode: 0o755 });

    res.json({
      success: true,
      message: 'File opening command created',
      filePath: hostPath,
      commandCreated: true
    });

  } catch (error) {
    console.error('Open file error:', error);
    res.status(500).json({ error: 'Failed to prepare file', message: error.message });
  }
});

// Helper function to detect host OS (kept for potential future use)
app.detectHostOS = function(req) {
  const userAgent = req.headers['user-agent'] || '';

  if (userAgent.includes('Windows')) return 'win32';
  if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS')) return 'darwin';
  if (userAgent.includes('Linux')) return 'linux';

  // Default to linux if unknown
  return 'linux';
};

// Get index stats
app.get('/stats', async (req, res) => {
  try {
    const stats = await client.indices.stats({ index: 'files' });
    const count = await client.count({ index: 'files' });

    // Handle both old and new Elasticsearch client response formats
    const totalFiles = count.body?.count || count.count || 0;
    const indexSize = stats.body?.indices?.files?.total?.store?.size_in_bytes ||
                     stats.indices?.files?.total?.store?.size_in_bytes || 0;

    res.json({
      totalFiles,
      indexSize
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats', message: error.message });
  }
});

// Search history endpoints
app.get('/history', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const history = searchHistory.getRecentQueries(parseInt(limit));
    res.json({ history });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to get history', message: error.message });
  }
});

app.get('/history/search', async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    const history = searchHistory.searchQueries(q, parseInt(limit));
    res.json({ history });
  } catch (error) {
    console.error('History search error:', error);
    res.status(500).json({ error: 'Failed to search history', message: error.message });
  }
});

app.delete('/history/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const success = searchHistory.deleteQuery(parseInt(id));

    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Query not found' });
    }
  } catch (error) {
    console.error('History delete error:', error);
    res.status(500).json({ error: 'Failed to delete query', message: error.message });
  }
});

app.delete('/history', async (req, res) => {
  try {
    const success = searchHistory.clearHistory();

    if (success) {
      res.json({ success: true, message: 'History cleared' });
    } else {
      res.status(500).json({ error: 'Failed to clear history' });
    }
  } catch (error) {
    console.error('History clear error:', error);
    res.status(500).json({ error: 'Failed to clear history', message: error.message });
  }
});

app.get('/history/stats', async (req, res) => {
  try {
    const stats = searchHistory.getStats();
    res.json(stats);
  } catch (error) {
    console.error('History stats error:', error);
    res.status(500).json({ error: 'Failed to get history stats', message: error.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing search history database...');
  searchHistory.close();
  process.exit(0);
});