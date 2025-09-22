#!/usr/bin/env node

const DocumentProcessor = require('./documentProcessor');
const fs = require('fs');
const path = require('path');

async function testDocumentProcessing() {
  const processor = new DocumentProcessor();
  const testDir = '/home/eduardoneville';

  console.log('🧪 Testing Document Processing Capabilities\n');

  // Find sample files to test
  const testFiles = [];

  // Look for PDF files
  console.log('📄 Looking for PDF files...');
  await findFiles(testDir, ['.pdf'], testFiles, 3);

  // Look for PowerPoint files
  console.log('📊 Looking for PowerPoint files...');
  await findFiles(testDir, ['.ppt', '.pptx', '.ppsx'], testFiles, 3);

  if (testFiles.length === 0) {
    console.log('⚠️  No PDF or PowerPoint files found for testing');
    return;
  }

  console.log(`\n🔍 Found ${testFiles.length} test files:\n`);

  for (const filePath of testFiles) {
    const ext = path.extname(filePath).toLowerCase();
    const fileSize = fs.statSync(filePath).size;
    console.log(`📁 Testing: ${path.basename(filePath)} (${ext}) - ${formatBytes(fileSize)}`);

    try {
      const startTime = Date.now();

      // Test if file is supported
      if (!processor.isSupported(filePath)) {
        console.log(`   ❌ File type not supported`);
        continue;
      }

      // Extract text
      const text = await processor.extractText(filePath);
      const extractionTime = Date.now() - startTime;

      // Get file type
      const fileType = processor.getFileType(filePath);

      console.log(`   ✅ Extraction successful in ${extractionTime}ms`);
      console.log(`   📝 File Type: ${fileType}`);
      console.log(`   📄 Text Length: ${text.length} characters`);

      if (text.length > 0) {
        const preview = text.substring(0, 200).replace(/\s+/g, ' ').trim();
        console.log(`   👁️  Preview: "${preview}${text.length > 200 ? '...' : ''}"`);
      } else {
        console.log(`   ⚠️  No text extracted`);
      }

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }

    console.log('');
  }

  console.log('🏁 Document processing test completed!');
}

async function findFiles(dir, extensions, results, maxFiles) {
  if (results.length >= maxFiles) return;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxFiles) break;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip certain directories
        if (['node_modules', '.git', '.cache', 'tmp', 'temp'].includes(entry.name)) {
          continue;
        }

        // Recursively search subdirectories (limited depth)
        if (dir.split('/').length < 6) {
          await findFiles(fullPath, extensions, results, maxFiles);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          const stats = fs.statSync(fullPath);
          // Skip very large files (> 50MB) for testing
          if (stats.size < 50 * 1024 * 1024) {
            results.push(fullPath);
          }
        }
      }
    }
  } catch (error) {
    // Skip directories we can't read
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Run the test if this file is executed directly
if (require.main === module) {
  testDocumentProcessing().catch(console.error);
}

module.exports = testDocumentProcessing;