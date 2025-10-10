/**
 * Advanced Query Parser for Elasticsearch
 * Supports:
 * - File type filtering: filetype:pdf,docx,pptx
 * - Boolean operators: AND, OR for text queries
 * - Date filters: created:>2024-01-01, modified:<2024-12-31, created:2024-01-01..2024-12-31
 * - User filters: creator:username, editor:username
 * - Size filters: size:>1MB, size:<100KB, size:1MB..5MB
 */

class QueryParser {
  constructor() {
    this.filterPatterns = {
      filetype: /filetype:([^\s]+)/gi,
      created: /created:([^\s]+)/gi,
      modified: /modified:([^\s]+)/gi,
      creator: /creator:([^\s]+)/gi,
      editor: /editor:([^\s]+)/gi,
      size: /size:([^\s]+)/gi,
    };
  }

  /**
   * Parse the user query and extract filters and search terms
   * @param {string} query - The raw query string
   * @returns {object} Parsed query object with filters and search terms
   */
  parse(query) {
    if (!query || typeof query !== 'string') {
      return this.getDefaultQuery();
    }

    const filters = {
      fileTypes: [],
      created: null,
      modified: null,
      creator: null,
      editor: null,
      size: null,
    };

    let remainingQuery = query;

    // Extract filetype filter - remove ALL occurrences
    const filetypeMatches = [...query.matchAll(this.filterPatterns.filetype)];
    if (filetypeMatches.length > 0) {
      // Collect unique file types from all matches
      const allTypes = new Set();
      filetypeMatches.forEach(match => {
        const types = match[1].split(',').map(t => t.trim().toLowerCase());
        types.forEach(t => allTypes.add(t));
      });
      filters.fileTypes = Array.from(allTypes);

      // Remove ALL filetype patterns from query
      remainingQuery = remainingQuery.replace(this.filterPatterns.filetype, '');
    }

    // Extract created date filter - remove ALL occurrences
    const createdMatches = [...query.matchAll(this.filterPatterns.created)];
    if (createdMatches.length > 0) {
      filters.created = this.parseDateFilter(createdMatches[0][1]);
      // Remove ALL created date patterns from query
      remainingQuery = remainingQuery.replace(this.filterPatterns.created, '');
    }

    // Extract modified date filter - remove ALL occurrences
    const modifiedMatches = [...query.matchAll(this.filterPatterns.modified)];
    if (modifiedMatches.length > 0) {
      filters.modified = this.parseDateFilter(modifiedMatches[0][1]);
      // Remove ALL modified date patterns from query
      remainingQuery = remainingQuery.replace(this.filterPatterns.modified, '');
    }

    // Extract creator filter - remove ALL occurrences
    const creatorMatches = [...query.matchAll(this.filterPatterns.creator)];
    if (creatorMatches.length > 0) {
      filters.creator = creatorMatches[0][1];
      // Remove ALL creator patterns from query
      remainingQuery = remainingQuery.replace(this.filterPatterns.creator, '');
    }

    // Extract editor filter - remove ALL occurrences
    const editorMatches = [...query.matchAll(this.filterPatterns.editor)];
    if (editorMatches.length > 0) {
      filters.editor = editorMatches[0][1];
      // Remove ALL editor patterns from query
      remainingQuery = remainingQuery.replace(this.filterPatterns.editor, '');
    }

    // Extract size filter - remove ALL occurrences
    const sizeMatches = [...query.matchAll(this.filterPatterns.size)];
    if (sizeMatches.length > 0) {
      try {
        filters.size = this.parseSizeFilter(sizeMatches[0][1]);
        // Remove ALL size patterns from query
        remainingQuery = remainingQuery.replace(this.filterPatterns.size, '');
      } catch (error) {
        console.error('Size filter parsing error:', error.message);
        throw new Error(`Invalid size filter: ${error.message}`);
      }
    }

    // Clean up extra whitespace
    remainingQuery = remainingQuery.replace(/\s+/g, ' ').trim();

    // Parse boolean operators in remaining text query
    const textQuery = this.parseTextQuery(remainingQuery);

    return {
      filters,
      textQuery,
      originalQuery: query
    };
  }

  /**
   * Parse date filter expressions
   * Supports: >date, <date, date..date, date
   * @param {string} dateExpr - Date expression
   * @returns {object} Date filter object
   */
  parseDateFilter(dateExpr) {
    // Range: date1..date2
    if (dateExpr.includes('..')) {
      const [start, end] = dateExpr.split('..').map(d => d.trim());
      return {
        type: 'range',
        gte: this.parseDate(start, false),      // Start of start day
        lte: this.parseDate(end, true)          // End of end day
      };
    }

    // Greater than: >date (after this date, so start of next day)
    if (dateExpr.startsWith('>=')) {
      return {
        type: 'range',
        gte: this.parseDate(dateExpr.substring(2), false)  // Start of this day
      };
    }

    if (dateExpr.startsWith('>')) {
      return {
        type: 'range',
        gt: this.parseDate(dateExpr.substring(1), true)    // End of this day (so next day onwards)
      };
    }

    // Less than: <date (before this date, so end of previous day)
    if (dateExpr.startsWith('<=')) {
      return {
        type: 'range',
        lte: this.parseDate(dateExpr.substring(2), true)   // End of this day
      };
    }

    if (dateExpr.startsWith('<')) {
      return {
        type: 'range',
        lt: this.parseDate(dateExpr.substring(1), false)   // Start of this day (so previous day and before)
      };
    }

    // Exact date (match entire day)
    return {
      type: 'exact',
      date: this.parseDate(dateExpr, false)
    };
  }

  /**
   * Parse date string to ISO format, normalized to start of day UTC
   * @param {string} dateStr - Date string
   * @param {boolean} endOfDay - If true, set to end of day (23:59:59.999)
   * @returns {string} ISO date string
   */
  parseDate(dateStr, endOfDay = false) {
    // Parse date string - supports YYYY-MM-DD format
    let date;

    // If it's already ISO format with time, parse it directly
    if (dateStr.includes('T')) {
      date = new Date(dateStr);
    } else {
      // For date-only strings (YYYY-MM-DD), parse in UTC to avoid timezone issues
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // Months are 0-indexed
        const day = parseInt(parts[2]);
        date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      } else {
        date = new Date(dateStr);
      }
    }

    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date: ${dateStr}`);
    }

    // Set to end of day if requested (for upper bounds)
    if (endOfDay) {
      date.setUTCHours(23, 59, 59, 999);
    } else {
      // Ensure we're at start of day
      date.setUTCHours(0, 0, 0, 0);
    }

    return date.toISOString();
  }

  /**
   * Parse size filter expressions
   * Supports: >size, <size, size..size, size
   * Size units: B, KB, MB, GB
   * @param {string} sizeExpr - Size expression
   * @returns {object} Size filter object
   */
  parseSizeFilter(sizeExpr) {
    // Range: size1..size2
    if (sizeExpr.includes('..')) {
      const [start, end] = sizeExpr.split('..').map(s => s.trim());
      return {
        type: 'range',
        gte: this.parseSize(start),
        lte: this.parseSize(end)
      };
    }

    // Greater than: >size
    if (sizeExpr.startsWith('>')) {
      return {
        type: 'range',
        gt: this.parseSize(sizeExpr.substring(1))
      };
    }

    // Greater than or equal: >=size
    if (sizeExpr.startsWith('>=')) {
      return {
        type: 'range',
        gte: this.parseSize(sizeExpr.substring(2))
      };
    }

    // Less than: <size
    if (sizeExpr.startsWith('<')) {
      return {
        type: 'range',
        lt: this.parseSize(sizeExpr.substring(1))
      };
    }

    // Less than or equal: <=size
    if (sizeExpr.startsWith('<=')) {
      return {
        type: 'range',
        lte: this.parseSize(sizeExpr.substring(2))
      };
    }

    // Exact size
    return {
      type: 'exact',
      size: this.parseSize(sizeExpr)
    };
  }

  /**
   * Convert size string to bytes
   * @param {string} sizeStr - Size string (e.g., "1MB", "500KB")
   * @returns {number} Size in bytes
   */
  parseSize(sizeStr) {
    const units = {
      b: 1,
      kb: 1024,
      mb: 1024 * 1024,
      gb: 1024 * 1024 * 1024
    };

    // Trim whitespace
    sizeStr = sizeStr.trim();

    // Match number followed by optional whitespace and unit
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/i);
    if (!match) {
      throw new Error(`Invalid size format: ${sizeStr}. Expected format: "100KB", "1.5MB", etc.`);
    }

    const [, value, unit] = match;
    const numValue = parseFloat(value);

    // Validate numeric value
    if (numValue < 0) {
      throw new Error(`Size cannot be negative: ${sizeStr}`);
    }

    if (numValue === 0) {
      return 0;
    }

    const unitLower = unit.toLowerCase();

    if (!units[unitLower]) {
      throw new Error(`Unknown size unit: ${unit}. Supported units: B, KB, MB, GB`);
    }

    const bytes = numValue * units[unitLower];

    // Validate result is a valid number
    if (!isFinite(bytes)) {
      throw new Error(`Size value too large: ${sizeStr}`);
    }

    return Math.floor(bytes); // Return whole bytes
  }

  /**
   * Parse text query with boolean operators (AND, OR)
   * @param {string} query - Text query
   * @returns {object} Parsed text query structure
   */
  parseTextQuery(query) {
    if (!query) {
      return { type: 'match_all' };
    }

    // Check for OR operator (has lower precedence)
    const orParts = this.splitByOperator(query, 'OR');
    if (orParts.length > 1) {
      return {
        type: 'bool',
        operator: 'should', // OR in Elasticsearch
        queries: orParts.map(part => this.parseTextQuery(part))
      };
    }

    // Check for AND operator (has higher precedence)
    const andParts = this.splitByOperator(query, 'AND');
    if (andParts.length > 1) {
      return {
        type: 'bool',
        operator: 'must', // AND in Elasticsearch
        queries: andParts.map(part => this.parseTextQuery(part))
      };
    }

    // Simple text query
    return {
      type: 'text',
      value: query.trim()
    };
  }

  /**
   * Split query by operator, respecting quotes
   * @param {string} query - Query string
   * @param {string} operator - Operator to split by
   * @returns {array} Array of query parts
   */
  splitByOperator(query, operator) {
    const regex = new RegExp(`\\s+${operator}\\s+`, 'gi');
    const parts = query.split(regex);
    return parts.map(p => p.trim()).filter(p => p.length > 0);
  }

  /**
   * Build Elasticsearch query from parsed query object
   * @param {object} parsedQuery - Parsed query object
   * @returns {object} Elasticsearch query DSL
   */
  buildElasticsearchQuery(parsedQuery) {
    const { filters, textQuery } = parsedQuery;
    const must = [];
    const filter = [];

    // Add text query
    if (textQuery.type !== 'match_all') {
      must.push(this.buildTextQuery(textQuery));
    }

    // Add filetype filter
    if (filters.fileTypes.length > 0) {
      filter.push({
        terms: {
          extension: filters.fileTypes.map(ft => `.${ft}`)
        }
      });
    }

    // Add created date filter
    if (filters.created) {
      filter.push(this.buildDateRangeQuery('created', filters.created));
    }

    // Add modified date filter
    if (filters.modified) {
      filter.push(this.buildDateRangeQuery('modified', filters.modified));
    }

    // Add creator filter
    if (filters.creator) {
      filter.push({
        term: {
          creator: filters.creator
        }
      });
    }

    // Add editor filter
    if (filters.editor) {
      filter.push({
        term: {
          lastEditor: filters.editor
        }
      });
    }

    // Add size filter
    if (filters.size) {
      filter.push(this.buildSizeRangeQuery(filters.size));
    }

    // Build final query
    if (must.length === 0 && filter.length === 0) {
      return { match_all: {} };
    }

    const boolQuery = { bool: {} };

    if (must.length > 0) {
      boolQuery.bool.must = must.length === 1 ? must[0] : must;
    }

    if (filter.length > 0) {
      boolQuery.bool.filter = filter;
    }

    return boolQuery;
  }

  /**
   * Build text query for Elasticsearch
   * @param {object} textQuery - Parsed text query
   * @param {boolean} usePhrase - Whether to use phrase matching (for AND queries)
   * @returns {object} Elasticsearch text query
   */
  buildTextQuery(textQuery, usePhrase = false) {
    if (textQuery.type === 'text') {
      // For phrase/exact matching (AND operator)
      if (usePhrase) {
        return {
          bool: {
            should: [
              {
                match_phrase: {
                  content: {
                    query: textQuery.value,
                    slop: 0  // No word gaps allowed - exact sequence
                  }
                }
              },
              {
                match_phrase: {
                  filename: {
                    query: textQuery.value,
                    slop: 0
                  }
                }
              },
              {
                match_phrase: {
                  path: {
                    query: textQuery.value,
                    slop: 0
                  }
                }
              }
            ],
            minimum_should_match: 1
          }
        };
      }

      // For simple text queries, split into words and require ALL words to be present
      // Use constant_score to avoid document length bias - small documents score equally to large ones
      const words = textQuery.value.trim().split(/\s+/).filter(w => w.length > 0);

      if (words.length === 1) {
        // Single word - use constant_score for equal scoring regardless of document size
        return {
          bool: {
            should: [
              {
                constant_score: {
                  filter: { match: { content: words[0] } },
                  boost: 1.0
                }
              },
              {
                constant_score: {
                  filter: { match: { filename: words[0] } },
                  boost: 2.0  // Filename matches are more important
                }
              },
              {
                constant_score: {
                  filter: { match: { path: words[0] } },
                  boost: 1.5
                }
              }
            ],
            minimum_should_match: 1
          }
        };
      }

      // Multiple words - each word MUST exist, with constant scoring to avoid size bias
      // All documents that contain ALL the words get equal base score
      // Then add proximity bonus for words appearing together
      return {
        bool: {
          must: words.map(word => ({
            // Each word must appear - use constant_score to avoid document length penalty
            bool: {
              should: [
                {
                  constant_score: {
                    filter: { match: { content: word } },
                    boost: 1.0
                  }
                },
                {
                  constant_score: {
                    filter: { match: { filename: word } },
                    boost: 2.0
                  }
                },
                {
                  constant_score: {
                    filter: { match: { path: word } },
                    boost: 1.5
                  }
                }
              ],
              minimum_should_match: 1
            }
          })),
          should: [
            // Boost score when words appear close together as a phrase
            {
              match_phrase: {
                content: {
                  query: textQuery.value,
                  slop: 50,  // Allow words to be far apart but still give proximity boost
                  boost: 1.0  // Add proximity bonus
                }
              }
            },
            {
              match_phrase: {
                filename: {
                  query: textQuery.value,
                  slop: 10,
                  boost: 2.0  // Higher boost for filename phrase matches
                }
              }
            },
            {
              match_phrase: {
                path: {
                  query: textQuery.value,
                  slop: 10,
                  boost: 1.0
                }
              }
            }
          ]
        }
      };
    }

    if (textQuery.type === 'bool') {
      // For AND operator, use phrase matching
      const isAndQuery = textQuery.operator === 'must';

      return {
        bool: {
          [textQuery.operator]: textQuery.queries.map(q => this.buildTextQuery(q, isAndQuery))
        }
      };
    }

    return { match_all: {} };
  }

  /**
   * Build date range query for Elasticsearch
   * @param {string} field - Field name
   * @param {object} dateFilter - Date filter object
   * @returns {object} Elasticsearch range query
   */
  buildDateRangeQuery(field, dateFilter) {
    if (dateFilter.type === 'exact') {
      // For exact date, match the whole day
      const date = new Date(dateFilter.date);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      return {
        range: {
          [field]: {
            gte: date.toISOString(),
            lt: nextDay.toISOString()
          }
        }
      };
    }

    // Range query
    const rangeQuery = { range: { [field]: {} } };

    if (dateFilter.gt) rangeQuery.range[field].gt = dateFilter.gt;
    if (dateFilter.gte) rangeQuery.range[field].gte = dateFilter.gte;
    if (dateFilter.lt) rangeQuery.range[field].lt = dateFilter.lt;
    if (dateFilter.lte) rangeQuery.range[field].lte = dateFilter.lte;

    return rangeQuery;
  }

  /**
   * Build size range query for Elasticsearch
   * @param {object} sizeFilter - Size filter object
   * @returns {object} Elasticsearch range query
   */
  buildSizeRangeQuery(sizeFilter) {
    if (sizeFilter.type === 'exact') {
      // For exact size, allow 1% tolerance
      const tolerance = sizeFilter.size * 0.01;
      return {
        range: {
          size: {
            gte: sizeFilter.size - tolerance,
            lte: sizeFilter.size + tolerance
          }
        }
      };
    }

    // Range query
    const rangeQuery = { range: { size: {} } };

    if (sizeFilter.gt !== undefined) rangeQuery.range.size.gt = sizeFilter.gt;
    if (sizeFilter.gte !== undefined) rangeQuery.range.size.gte = sizeFilter.gte;
    if (sizeFilter.lt !== undefined) rangeQuery.range.size.lt = sizeFilter.lt;
    if (sizeFilter.lte !== undefined) rangeQuery.range.size.lte = sizeFilter.lte;

    return rangeQuery;
  }

  /**
   * Get default query for empty searches
   * @returns {object} Default query object
   */
  getDefaultQuery() {
    return {
      filters: {
        fileTypes: [],
        created: null,
        modified: null,
        creator: null,
        editor: null,
        size: null,
      },
      textQuery: { type: 'match_all' },
      originalQuery: ''
    };
  }
}

module.exports = QueryParser;
