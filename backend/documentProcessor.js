const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const yauzl = require('yauzl');
const xml2js = require('xml2js');

// Try to import node-pptx, fall back to basic extraction if not available
let PPTX;
try {
  PPTX = require('node-pptx');
} catch (error) {
  console.warn('node-pptx not available, using basic PowerPoint extraction');
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
    // Minimum valid file sizes for different formats
    const MIN_SIZES = {
      '.pdf': 200,        // PDF minimum with header
      '.docx': 4096,      // DOCX minimum ZIP structure
      '.pptx': 4096,      // PPTX minimum ZIP structure
      '.xlsx': 4096,      // XLSX minimum ZIP structure
      '.ppsx': 4096,      // PPSX minimum ZIP structure
      '.potx': 4096,      // POTX minimum ZIP structure
      '.odt': 4096,       // ODT minimum ZIP structure
    };

    // Check file size
    const minSize = MIN_SIZES[ext] || 0;
    if (minSize > 0 && buffer.length < minSize) {
      return {
        isPlaceholder: true,
        reason: `File too small (${buffer.length} bytes, expected minimum ${minSize} bytes)`
      };
    }

    // Check for ZIP-based formats (all Office Open XML and OpenDocument files)
    const zipFormats = ['.docx', '.pptx', '.xlsx', '.ppsx', '.potx', '.odt'];
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

          case '.docx':
            return await this.extractDocxText(buffer);

          case '.doc':
            // For .doc files, we'll try to read as text (limited support)
            return await this.extractDocText(buffer);

          case '.pptx':
          case '.ppsx':
          case '.potx':
            return await this.extractPptxText(buffer);

          case '.ppt':
            // For .ppt files, we'll try basic text extraction (limited support)
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

      const data = await pdfParse(buffer, {
        // PDF parsing options for better text extraction
        max: 0, // Parse all pages
        version: 'v1.10.100' // Use specific version for consistency
      });

      // Restore stderr
      process.stderr.write = originalStderrWrite;

      // Optionally log suppressed warnings count
      if (warnings.length > 0) {
        console.log(`  ℹ️  Suppressed ${warnings.length} PDF parsing warnings (non-standard commands)`);
      }

      // Clean up the extracted text
      let text = data.text;

      // Remove excessive whitespace and normalize line breaks
      text = text.replace(/\s+/g, ' ')
                 .replace(/\n+/g, '\n')
                 .trim();

      // Extract metadata if available
      let metadata = '';
      if (data.info) {
        if (data.info.Title) metadata += `Title: ${data.info.Title}\n`;
        if (data.info.Subject) metadata += `Subject: ${data.info.Subject}\n`;
        if (data.info.Keywords) metadata += `Keywords: ${data.info.Keywords}\n`;
      }

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
                             errorStack.includes('pdf.worker.js') ||
                             errorStack.includes('Lexer') ||
                             errorStack.includes('EvaluatorPreprocessor');

      if (isInternalError) {
        console.warn(`  ⚠️  PDF has internal structure issues, skipping extraction`);
        return ''; // Return empty content for corrupted/incompatible PDFs
      }

      console.warn(`  ⚠️  PDF extraction error: ${error.message}`);

      // Try alternative extraction method for other errors
      try {
        console.log(`  🔄 Attempting fallback extraction (first 10 pages only)...`);
        const simpleData = await pdfParse(buffer, { max: 10 }); // Only first 10 pages
        console.log(`  ✓ Fallback extraction succeeded`);
        return simpleData.text || '';
      } catch (fallbackError) {
        const fallbackMsg = fallbackError.message || '';
        const fallbackStack = fallbackError.stack || '';

        const isFallbackInternalError = fallbackMsg.includes('is not a function') ||
                                       fallbackStack.includes('pdf.worker.js');

        if (isFallbackInternalError) {
          console.warn(`  ⚠️  PDF incompatible with pdf-parse library, skipping`);
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
      // Limited support for .doc files - try to extract readable text
      const text = buffer.toString('utf8');
      // Remove control characters and extract readable text
      return text.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
                 .replace(/\s+/g, ' ')
                 .trim();
    } catch (error) {
      console.warn(`  ⚠️  DOC extraction error: ${error.message}`);
      return '';
    }
  }

  async extractPptxText(buffer) {
    try {
      // Try using node-pptx first for better extraction
      if (PPTX) {
        try {
          return await this.extractPptxWithNodePptx(buffer);
        } catch (error) {
          console.warn(`  ⚠️  node-pptx extraction failed, falling back to manual method: ${error.message}`);
        }
      }

      // Fall back to manual extraction
      return await this.extractPptxManual(buffer);
    } catch (error) {
      console.warn(`  ⚠️  PPTX extraction error: ${error.message}`);
      return '';
    }
  }

  async extractPptxWithNodePptx(buffer) {
    return new Promise((resolve, reject) => {
      try {
        // Write buffer to temporary file for node-pptx processing
        const tempFile = `/tmp/temp_${Date.now()}.pptx`;
        fs.writeFileSync(tempFile, buffer);

        const presentation = new PPTX(tempFile);
        const slides = presentation.getSlides();
        let allText = [];

        for (const slide of slides) {
          const slideText = slide.getText();
          if (slideText && slideText.trim()) {
            allText.push(slideText.trim());
          }
        }

        // Clean up temp file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }

        resolve(allText.join('\n\n'));
      } catch (error) {
        reject(error);
      }
    });
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
        let entriesProcessed = 0;
        let totalEntries = 0;

        zipfile.on('entry', (entry) => {
          totalEntries++;

          if (entry.fileName.startsWith('ppt/slides/slide') && entry.fileName.endsWith('.xml')) {
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) {
                entriesProcessed++;
                if (entriesProcessed === totalEntries) {
                  resolve(slideTexts.join('\n\n'));
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
                    if (text && text.trim()) {
                      slideTexts.push(text.trim());
                    }
                  }
                  entriesProcessed++;
                  if (entriesProcessed === totalEntries) {
                    resolve(slideTexts.join('\n\n'));
                  }
                });
              });

              readStream.on('error', () => {
                entriesProcessed++;
                if (entriesProcessed === totalEntries) {
                  resolve(slideTexts.join('\n\n'));
                }
              });
            });
          } else {
            entriesProcessed++;
            if (entriesProcessed === totalEntries) {
              resolve(slideTexts.join('\n\n'));
            }
          }
        });

        zipfile.on('end', () => {
          if (totalEntries === 0) {
            resolve('');
          }
        });

        zipfile.on('error', (err) => {
          reject(err);
        });

        zipfile.readEntry();
      });
      } catch (error) {
        reject(error);
      }
    });
  }

  async extractPptText(buffer) {
    try {
      // Limited support for .ppt files
      const text = buffer.toString('utf8');
      return text.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
                 .replace(/\s+/g, ' ')
                 .trim();
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
        // Basic text extraction for .xls files
        const text = buffer.toString('utf8');
        return text.replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
                   .replace(/\s+/g, ' ')
                   .trim();
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
      // Basic RTF text extraction (removes RTF commands)
      const rtfContent = buffer.toString('utf8');

      // Remove RTF control words and commands
      let text = rtfContent
        .replace(/\\[a-z0-9-]+\s?/gi, ' ')  // Remove control words
        .replace(/[{}]/g, ' ')              // Remove braces
        .replace(/\\\\/g, '\\')             // Handle escaped backslashes
        .replace(/\\'/g, "'")               // Handle escaped quotes
        .replace(/\s+/g, ' ')               // Normalize whitespace
        .trim();

      return text;
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
          text += this.extractTextFromXml(item) + ' ';
        }
        return text;
      }

      if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            if (key === '_' || key === '$') {
              continue; // Skip XML attributes
            }
            text += this.extractTextFromXml(obj[key]) + ' ';
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
    if (['.docx', '.doc', '.odt', '.rtf'].includes(ext)) return 'document';
    if (['.pptx', '.ppt', '.ppsx', '.potx'].includes(ext)) return 'presentation';
    if (['.xlsx', '.xls'].includes(ext)) return 'spreadsheet';

    // Programming and markup files
    if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c', '.h', '.cs', '.php', '.rb', '.go', '.rs'].includes(ext)) return 'code';
    if (['.html', '.htm', '.xml', '.css', '.scss', '.sass'].includes(ext)) return 'markup';
    if (['.json', '.yaml', '.yml', '.csv'].includes(ext)) return 'data';

    return 'text';
  }
}

module.exports = DocumentProcessor;