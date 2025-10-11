const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const yauzl = require('yauzl');
const xml2js = require('xml2js');

// Try to import pptx parsers, fall back to manual extraction if not available
let pptxParser;
try {
  pptxParser = require('node-pptx-parser');
} catch (error) {
  console.warn('node-pptx-parser not available, using manual PowerPoint extraction');
}

class DocumentProcessor {
  constructor() {
    this.supportedExtensions = new Set([
      // Text files
      '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.csv', '.xml', '.html', '.css', '.scss',
      '.py', '.java', '.cpp', '.c', '.h', '.cs', '.php', '.rb', '.go', '.rs', '.sh', '.yaml', '.yml',
      '.sql', '.log', '.conf', '.ini', '.env', '.gitignore', '.dockerfile', '.makefile', '.readme',
      // Document files
      '.pdf', '.docx', '.doc', '.pptx', '.ppt', '.ppsx', '.potx', '.xlsx', '.xls', '.odt', '.rtf'
    ]);
  }

  isSupported(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return this.supportedExtensions.has(ext);
  }

  checkIfPlaceholder(filePath, buffer, ext) {
    // Minimum valid file sizes for different formats - reduced to catch only true placeholders
    const MIN_SIZES = {
      '.pdf': 50,         // PDF minimum with header
      '.docx': 1024,      // DOCX minimum ZIP structure
      '.docm': 1024,      // DOCM minimum ZIP structure
      '.dotx': 1024,      // DOTX minimum ZIP structure
      '.dotm': 1024,      // DOTM minimum ZIP structure
      '.pptx': 1024,      // PPTX minimum ZIP structure
      '.pptm': 1024,      // PPTM minimum ZIP structure
      '.ppsx': 1024,      // PPSX minimum ZIP structure
      '.ppsm': 1024,      // PPSM minimum ZIP structure
      '.potx': 1024,      // POTX minimum ZIP structure
      '.potm': 1024,      // POTM minimum ZIP structure
      '.xlsx': 1024,      // XLSX minimum ZIP structure
      '.odt': 1024,       // ODT minimum ZIP structure
    };

    // Check file size - only catch extremely small files that are clearly not real documents
    const minSize = MIN_SIZES[ext] || 0;
    if (minSize > 0 && buffer.length < minSize) {
      return {
        isPlaceholder: true,
        reason: `File too small (${buffer.length} bytes, expected minimum ${minSize} bytes)`
      };
    }

    // Check for ZIP-based formats (all Office Open XML and OpenDocument files)
    const zipFormats = [
      '.docx', '.docm', '.dotx', '.dotm',
      '.pptx', '.pptm', '.ppsx', '.ppsm', '.potx', '.potm',
      '.xlsx', '.odt'
    ];
    if (zipFormats.includes(ext)) {
      // Check for ZIP signature (PK\x03\x04 at the start)
      if (buffer.length >= 4) {
        const signature = buffer.readUInt32LE(0);
        // ZIP local file header signature: 0x04034b50 (little-endian)
        if (signature !== 0x04034b50) {
          return {
            isPlaceholder: true,
            reason: 'Invalid ZIP signature (file may be a cloud storage placeholder)'
          };
        }
      }

      // Additional check: ZIP files must be at least 22 bytes (end of central directory)
      if (buffer.length < 22) {
        return {
          isPlaceholder: true,
          reason: 'File too small to contain valid ZIP structure'
        };
      }
    }

    // Check for PDF signature
    if (ext === '.pdf') {
      if (buffer.length >= 5) {
        const header = buffer.toString('utf8', 0, 5);
        if (header !== '%PDF-') {
          return {
            isPlaceholder: true,
            reason: 'Invalid PDF header (file may be a cloud storage placeholder)'
          };
        }
      }
    }

    // Check for common cloud placeholder patterns
    const contentPreview = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
    const placeholderPatterns = [
      'CloudStation',
      'SynologyDrive',
      'BoxSync',
      'OneDrive',
      '.cloud',
      'placeholder'
    ];

    for (const pattern of placeholderPatterns) {
      if (contentPreview.includes(pattern)) {
        return {
          isPlaceholder: true,
          reason: `Detected cloud storage placeholder pattern: ${pattern}`
        };
      }
    }

    return { isPlaceholder: false };
  }

  async extractText(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    try {
      const buffer = fs.readFileSync(filePath);

      // Check for placeholder files or files that are still syncing
      const placeholderCheck = this.checkIfPlaceholder(filePath, buffer, ext);
      if (placeholderCheck.isPlaceholder) {
        throw new Error(`PLACEHOLDER_FILE: ${placeholderCheck.reason}`);
      }

      try {
        switch (ext) {
          case '.pdf':
            return await this.extractPdfText(buffer);

          // Word documents - all formats
          case '.docx':
          case '.docm':
          case '.dotx':
          case '.dotm':
            return await this.extractDocxText(buffer);

          case '.doc':
          case '.dot':
            // For .doc/.dot files, try basic text extraction (limited support)
            return await this.extractDocText(buffer);

          // PowerPoint presentations - all formats
          case '.pptx':
          case '.pptm':
          case '.ppsx':
          case '.ppsm':
          case '.potx':
          case '.potm':
            return await this.extractPptxText(buffer);

          case '.ppt':
          case '.pps':
          case '.pot':
            // For .ppt/.pps/.pot files, try basic text extraction (limited support)
            return await this.extractPptText(buffer);

          case '.xlsx':
          case '.xls':
            return await this.extractExcelText(filePath, buffer);

          case '.odt':
            return await this.extractOdtText(buffer);

          case '.rtf':
            return await this.extractRtfText(buffer);

          default:
            // Handle text files - with UTF-8 error handling
            try {
              return buffer.toString('utf8');
            } catch (utfError) {
              console.warn(`  ⚠️  UTF-8 decoding error, trying latin1 encoding`);
              return buffer.toString('latin1');
            }
        }
      } catch (error) {
        // Check if it's a UTF-8 related error
        if (error.message && (error.message.includes('UTF-8') ||
                              error.message.includes('Invalid string length') ||
                              error.message.includes('Cannot create a string longer'))) {
          console.warn(`  ⚠️  Text encoding error in ${filePath}: ${error.message}`);
          return '';
        }

        console.warn(`  ⚠️  Error extracting text from ${filePath}: ${error.message}`);
        // Return empty string rather than failing completely
        return '';
      }
    } catch (outerError) {
      // Catch any error including file read errors
      if (outerError.message && outerError.message.startsWith('PLACEHOLDER_FILE:')) {
        // Re-throw placeholder errors so indexer can handle them
        throw outerError;
      }

      console.warn(`  ⚠️  Failed to process ${filePath}: ${outerError.message}`);
      return '';
    }
  }

  async extractPdfText(buffer) {
    const originalStderrWrite = process.stderr.write;

    try {
      // Suppress pdf-parse warnings by temporarily redirecting stderr
      const warnings = [];

      process.stderr.write = function(chunk, encoding, callback) {
        const str = chunk.toString();
        // Only suppress known harmless warnings from pdf-parse
        const harmlessWarnings = [
          'Unknown command',
          'Skipping command',
          'TT: undefined function',
          'TT: invalid function id',
          'Required "glyf" table is not found',
          'Required "loca" table is not found',
          'FormatError: Required "loca" table is not found',
          'Badly formatted number',
          'Empty "FlateDecode" stream',
          'Could not find a preferred cmap table'
        ];

        if (harmlessWarnings.some(warning => str.includes(warning))) {
          warnings.push(str.trim());
          return true;
        }
        return originalStderrWrite.apply(process.stderr, arguments);
      };

      // Wrap pdf-parse in a Promise with timeout and comprehensive error handling
      const data = await Promise.race([
        pdfParse(buffer, {
          // PDF parsing options for better text extraction
          max: 0, // Parse all pages
          version: 'v1.10.100' // Use specific version for consistency
        }).catch(err => {
          // Catch any errors from pdf-parse including async ones
          throw err;
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('PDF parsing timeout')), 30000)
        )
      ]);

      // Restore stderr
      process.stderr.write = originalStderrWrite;

      // Optionally log suppressed warnings count
      if (warnings.length > 0) {
        console.log(`  ℹ️  Suppressed ${warnings.length} PDF parsing warnings (non-standard commands)`);
      }

      // Return raw text - NO cleaning, NO normalization, NO modifications
      let text = data.text || '';

      // Extract metadata if available and prepend it
      let metadata = '';
      if (data.info) {
        if (data.info.Title) metadata += `${data.info.Title} `;
        if (data.info.Subject) metadata += `${data.info.Subject} `;
        if (data.info.Keywords) metadata += `${data.info.Keywords} `;
      }

      // Return everything exactly as extracted - raw and unmodified
      return metadata + text;
    } catch (error) {
      // Always restore stderr before handling errors
      process.stderr.write = originalStderrWrite;

      // Check for specific pdf-parse internal errors
      const errorMsg = error.message || '';
      const errorStack = error.stack || '';

      const isInternalError = errorMsg.includes('getBytes is not a function') ||
                             errorMsg.includes('is not a function') ||
                             errorMsg.includes('stream.') ||
                             errorMsg.includes('DecodeStream') ||
                             errorMsg.includes('StreamsSequenceStream') ||
                             errorMsg.includes('timeout') ||
                             errorStack.includes('pdf.worker.js') ||
                             errorStack.includes('Lexer') ||
                             errorStack.includes('EvaluatorPreprocessor');

      if (isInternalError) {
        console.warn(`  ⚠️  PDF has internal structure issues or timed out, skipping extraction`);
        return ''; // Return empty content for corrupted/incompatible PDFs
      }

      console.warn(`  ⚠️  PDF extraction error: ${error.message}`);

      // Try alternative extraction method for other errors - with shorter page limit
      try {
        console.log(`  🔄 Attempting fallback extraction (first 5 pages only)...`);
        const simpleData = await Promise.race([
          pdfParse(buffer, { max: 5 }).catch(err => { throw err; }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Fallback PDF parsing timeout')), 10000)
          )
        ]);
        console.log(`  ✓ Fallback extraction succeeded`);
        return simpleData.text || '';
      } catch (fallbackError) {
        const fallbackMsg = fallbackError.message || '';
        const fallbackStack = fallbackError.stack || '';

        const isFallbackInternalError = fallbackMsg.includes('is not a function') ||
                                       fallbackMsg.includes('timeout') ||
                                       fallbackStack.includes('pdf.worker.js');

        if (isFallbackInternalError) {
          console.warn(`  ⚠️  PDF incompatible with pdf-parse library or timed out, skipping`);
        } else {
          console.warn(`  ⚠️  Fallback extraction also failed: ${fallbackError.message}`);
        }
        return '';
      }
    }
  }

  async extractDocxText(buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } catch (error) {
      console.warn(`  ⚠️  DOCX extraction error: ${error.message}`);
      return '';
    }
  }

  async extractDocText(buffer) {
    try {
      // Limited support for .doc files - extract raw text
      const text = buffer.toString('utf8');
      // Return raw text - no modifications
      return text;
    } catch (error) {
      console.warn(`  ⚠️  DOC extraction error: ${error.message}`);
      return '';
    }
  }

  async extractPptxText(buffer) {
    try {
      // Try using node-pptx-parser first for better extraction
      if (pptxParser) {
        try {
          return await this.extractPptxWithParser(buffer);
        } catch (error) {
          console.warn(`  ⚠️  node-pptx-parser extraction failed, falling back to manual method: ${error.message}`);
        }
      }

      // Fall back to manual extraction
      return await this.extractPptxManual(buffer);
    } catch (error) {
      console.warn(`  ⚠️  PPTX extraction error: ${error.message}`);
      return '';
    }
  }

  async extractPptxWithParser(buffer) {
    try {
      // Write buffer to temporary file for node-pptx-parser processing
      const tempFile = `/tmp/temp_${Date.now()}.pptx`;
      fs.writeFileSync(tempFile, buffer);

      // Extract text using node-pptx-parser
      const text = await pptxParser.extractText(tempFile);

      // Clean up temp file
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }

      return text || '';
    } catch (error) {
      throw error;
    }
  }

  async extractPptxManual(buffer) {
    return new Promise((resolve, reject) => {
      try {
        yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
          if (err) {
            reject(err);
            return;
          }

          let slideTexts = [];
          let pendingReads = 0;
          let allEntriesRead = false;

          const checkComplete = () => {
            if (allEntriesRead && pendingReads === 0) {
              resolve(slideTexts.join('\n\n'));
            }
          };

          zipfile.on('entry', (entry) => {
            if (entry.fileName.startsWith('ppt/slides/slide') && entry.fileName.endsWith('.xml')) {
              pendingReads++;

              zipfile.openReadStream(entry, (err, readStream) => {
                if (err) {
                  pendingReads--;
                  zipfile.readEntry();
                  checkComplete();
                  return;
                }

                let xmlData = '';
                readStream.on('data', (chunk) => {
                  xmlData += chunk.toString('utf8');
                });

                readStream.on('end', () => {
                  xml2js.parseString(xmlData, (err, result) => {
                    if (!err && result) {
                      const text = this.extractTextFromXml(result);
                      if (text && text.trim().length > 0) {
                        slideTexts.push(text.trim());
                      }
                    }
                    pendingReads--;
                    zipfile.readEntry();
                    checkComplete();
                  });
                });

                readStream.on('error', (err) => {
                  console.warn(`  ⚠️  Error reading slide XML: ${err.message}`);
                  pendingReads--;
                  zipfile.readEntry();
                  checkComplete();
                });
              });
            } else {
              // Not a slide, continue to next entry
              zipfile.readEntry();
            }
          });

          zipfile.on('end', () => {
            allEntriesRead = true;
            checkComplete();
          });

          zipfile.on('error', (err) => {
            reject(err);
          });

          // Start reading entries
          zipfile.readEntry();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async extractPptText(buffer) {
    try {
      // Limited support for .ppt files - extract raw text
      const text = buffer.toString('utf8');
      // Return raw text - no modifications
      return text;
    } catch (error) {
      console.warn(`  ⚠️  PPT extraction error: ${error.message}`);
      return '';
    }
  }

  async extractExcelText(filePath, buffer) {
    // For Excel files, we'll extract text content (limited support)
    try {
      if (path.extname(filePath).toLowerCase() === '.xlsx') {
        return await this.extractXlsxText(buffer);
      } else {
        // Basic text extraction for .xls files - return raw text
        const text = buffer.toString('utf8');
        return text;
      }
    } catch (error) {
      console.warn(`  ⚠️  Excel extraction error: ${error.message}`);
      return '';
    }
  }

  async extractXlsxText(buffer) {
    return new Promise((resolve, reject) => {
      try {
        yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
          if (err) {
            resolve('');
            return;
          }

          let worksheetTexts = [];
          let entriesProcessed = 0;
          let totalEntries = 0;

          zipfile.on('entry', (entry) => {
            totalEntries++;

            if (entry.fileName.startsWith('xl/worksheets/') && entry.fileName.endsWith('.xml')) {
              zipfile.openReadStream(entry, (err, readStream) => {
                if (err) {
                  entriesProcessed++;
                  if (entriesProcessed === totalEntries) {
                    resolve(worksheetTexts.join('\n'));
                  }
                  return;
                }

                let xmlData = '';
                readStream.on('data', (chunk) => {
                  xmlData += chunk;
                });

                readStream.on('end', () => {
                  xml2js.parseString(xmlData, (err, result) => {
                    if (!err && result) {
                      const text = this.extractTextFromXml(result);
                      if (text) {
                        worksheetTexts.push(text);
                      }
                    }
                    entriesProcessed++;
                    if (entriesProcessed === totalEntries) {
                      resolve(worksheetTexts.join('\n'));
                    }
                  });
                });

                readStream.on('error', () => {
                  entriesProcessed++;
                  if (entriesProcessed === totalEntries) {
                    resolve(worksheetTexts.join('\n'));
                  }
                });
              });
            } else {
              entriesProcessed++;
              if (entriesProcessed === totalEntries) {
                resolve(worksheetTexts.join('\n'));
              }
            }
          });

          zipfile.on('end', () => {
            if (totalEntries === 0) {
              resolve('');
            }
          });

          zipfile.on('error', () => {
            resolve('');
          });

          zipfile.readEntry();
        });
      } catch (error) {
        resolve('');
      }
    });
  }

  async extractOdtText(buffer) {
    // Extract text from OpenDocument Text files
    return new Promise((resolve, reject) => {
      try {
        yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zipfile) => {
          if (err) {
            resolve('');
            return;
          }

          zipfile.on('entry', (entry) => {
            if (entry.fileName === 'content.xml') {
              zipfile.openReadStream(entry, (err, readStream) => {
                if (err) {
                  resolve('');
                  return;
                }

                let xmlData = '';
                readStream.on('data', (chunk) => {
                  xmlData += chunk;
                });

                readStream.on('end', () => {
                  xml2js.parseString(xmlData, (err, result) => {
                    if (err) {
                      resolve('');
                    } else {
                      const text = this.extractTextFromXml(result);
                      resolve(text || '');
                    }
                  });
                });

                readStream.on('error', () => {
                  resolve('');
                });
              });
            } else {
              zipfile.readEntry();
            }
          });

          zipfile.on('end', () => {
            resolve('');
          });

          zipfile.on('error', () => {
            resolve('');
          });

          zipfile.readEntry();
        });
      } catch (error) {
        resolve('');
      }
    });
  }

  async extractRtfText(buffer) {
    try {
      // Extract raw RTF text - no modifications
      const rtfContent = buffer.toString('utf8');
      // Return raw content - Elasticsearch will handle tokenization
      return rtfContent;
    } catch (error) {
      console.warn(`  ⚠️  RTF extraction error: ${error.message}`);
      return '';
    }
  }

  extractTextFromXml(obj) {
    try {
      let text = '';

      if (typeof obj === 'string') {
        return obj;
      }

      if (Array.isArray(obj)) {
        for (const item of obj) {
          const extracted = this.extractTextFromXml(item);
          if (extracted) {
            text += extracted + ' ';
          }
        }
        return text;
      }

      if (typeof obj === 'object' && obj !== null) {
        // Check for direct text content in '_' key (common in XML parsing)
        if (obj.hasOwnProperty('_')) {
          return String(obj['_']);
        }

        // Recursively extract from all properties except attributes
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            // Skip XML attributes (usually in '$' key)
            if (key === '$') {
              continue;
            }
            const extracted = this.extractTextFromXml(obj[key]);
            if (extracted) {
              text += extracted + ' ';
            }
          }
        }
      }

      return text;
    } catch (error) {
      return '';
    }
  }

  getFileType(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (['.pdf'].includes(ext)) return 'pdf';

    // All Word document formats
    if (['.doc', '.docx', '.docm', '.dot', '.dotx', '.dotm', '.odt', '.rtf'].includes(ext)) return 'document';

    // All PowerPoint presentation formats
    if (['.ppt', '.pptx', '.pptm', '.pot', '.potx', '.potm', '.pps', '.ppsx', '.ppsm'].includes(ext)) return 'presentation';

    if (['.xlsx', '.xls'].includes(ext)) return 'spreadsheet';

    // Programming and markup files
    if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.cs', '.php', '.rb', '.go', '.rs'].includes(ext)) return 'code';
    if (['.html', '.htm', '.xml', '.css', '.scss', '.sass'].includes(ext)) return 'markup';
    if (['.json', '.yaml', '.yml', '.csv'].includes(ext)) return 'data';

    return 'text';
  }
}

module.exports = DocumentProcessor;