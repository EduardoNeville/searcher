# Advanced Filtering System Guide

This document provides a comprehensive guide to using the advanced filtering system in the File Search application.

## Overview

The advanced filtering system allows you to create precise, in-depth searches using a variety of filters and boolean operators. All filters can be combined to create complex queries.

## Filter Types

### 1. File Type Filtering

Filter results by file extension/type.

**Syntax:** `filetype:<extension>[,<extension>...]`

**Examples:**
```
filetype:pdf
filetype:pdf,docx
filetype:pdf,docx,pptx
```

**Supported file types:**
- `pdf` - PDF documents
- `docx` - Microsoft Word documents
- `pptx` - Microsoft PowerPoint presentations
- `xlsx` - Microsoft Excel spreadsheets (if indexed)

### 2. Boolean Operators (AND / OR)

Combine search terms using boolean logic.

**Syntax:**
- `term1 AND term2` - Both terms must be present
- `term1 OR term2` - Either term must be present

**Examples:**
```
budget AND report
invoice OR receipt
marketing AND (strategy OR plan)
```

**Note:** AND has higher precedence than OR.

### 3. Date Filtering

Filter by file creation or modification dates.

**Syntax:**
- `created:<date_expression>`
- `modified:<date_expression>`

**Date Expressions:**
- Exact date: `created:2024-01-15`
- After date: `created:>2024-01-01` or `created:>=2024-01-01`
- Before date: `created:<2024-12-31` or `created:<=2024-12-31`
- Date range: `created:2024-01-01..2024-12-31`

**Date Formats:**
- ISO format: `2024-01-15`
- Full ISO: `2024-01-15T10:30:00Z`

**Examples:**
```
created:>2024-01-01
modified:<2024-06-30
created:2024-01-01..2024-03-31
modified:>=2024-10-01
```

### 4. User Filtering

Filter by file creator or last editor.

**Syntax:**
- `creator:<username>` - Filter by who created the file
- `editor:<username>` - Filter by who last edited the file

**Examples:**
```
creator:john
editor:sarah
creator:admin editor:john
```

**Note:** User information is extracted from file system metadata (file owner on Linux/Mac systems).

### 5. Size Filtering

Filter by file size.

**Syntax:** `size:<size_expression>`

**Size Expressions:**
- Exact size: `size:1MB` (matches within 1% tolerance)
- Greater than: `size:>500KB` or `size:>=500KB`
- Less than: `size:<10MB` or `size:<=10MB`
- Size range: `size:1MB..5MB`

**Supported Units:**
- `B` - Bytes
- `KB` - Kilobytes (1024 bytes)
- `MB` - Megabytes (1024 KB)
- `GB` - Gigabytes (1024 MB)

**Examples:**
```
size:>1MB
size:<100KB
size:500KB..2MB
size:>=10MB
```

## Combining Filters

You can combine multiple filters in a single query. Filters are connected with AND logic by default.

**Examples:**

1. **PDF files created in 2024:**
   ```
   filetype:pdf created:>2024-01-01
   ```

2. **Large Word documents modified recently:**
   ```
   filetype:docx size:>5MB modified:>2024-10-01
   ```

3. **Files by specific user with keyword search:**
   ```
   creator:john budget AND report
   ```

4. **Complex query with multiple filters:**
   ```
   filetype:pdf,docx created:2024-01-01..2024-12-31 size:<10MB marketing AND strategy
   ```

5. **Boolean search with date filter:**
   ```
   (invoice OR receipt) AND payment modified:>2024-11-01
   ```

## Query Syntax Rules

1. **Filter order doesn't matter:** Filters can appear anywhere in the query
   ```
   budget filetype:pdf created:>2024-01-01
   created:>2024-01-01 budget filetype:pdf
   ```

2. **Spaces in filter values:** If a filter value contains spaces, it will be parsed until the next space or filter
   ```
   creator:john_doe
   ```

3. **Case sensitivity:**
   - Filter names are case-insensitive: `FILETYPE:pdf` = `filetype:pdf`
   - Search terms respect Elasticsearch's default behavior (usually case-insensitive for analyzed text)
   - Username filters are case-sensitive

4. **Multiple instances of same filter:** Last one wins
   ```
   filetype:pdf filetype:docx  // Only docx will be applied
   ```
   Exception: filetype can accept comma-separated values:
   ```
   filetype:pdf,docx  // Both will be applied
   ```

## Search Tips

1. **Start broad, then narrow:** Begin with basic text search, then add filters
   ```
   budget
   budget filetype:pdf
   budget filetype:pdf created:>2024-01-01
   ```

2. **Use date ranges for periodic reports:**
   ```
   quarterly report created:2024-01-01..2024-03-31
   ```

3. **Find recent large files:**
   ```
   size:>10MB modified:>2024-11-01
   ```

4. **Search by file owner:**
   ```
   creator:username important
   ```

5. **Exclude unwanted terms:** Use boolean logic
   ```
   report AND NOT draft
   ```

## Examples by Use Case

### Financial Documents
```
filetype:pdf,xlsx (invoice OR receipt OR statement) created:2024-01-01..2024-12-31
```

### Recent Work by Specific User
```
creator:john modified:>2024-11-01
```

### Large Presentations
```
filetype:pptx size:>5MB
```

### Critical Documents with Keywords
```
(critical OR important OR urgent) AND (contract OR agreement) filetype:pdf
```

### Quarterly Reports
```
quarterly AND report created:2024-07-01..2024-09-30 filetype:pdf,docx
```

## API Usage

If you're using the API directly, send queries as URL parameters:

```bash
GET /search?q=filetype:pdf+budget+AND+report&size=50
```

The query parser will automatically handle the parsing and generate the appropriate Elasticsearch query.

## Troubleshooting

### No results found
- Check date format (use YYYY-MM-DD)
- Verify file types are spelled correctly
- Ensure usernames match file system owners
- Try removing filters one by one to identify the issue

### Unexpected results
- Check boolean operator precedence (AND before OR)
- Verify date ranges are logical (start < end)
- Check size units (KB vs MB)

### Performance
- Very broad queries may be slow
- Consider adding date ranges to limit scope
- Use specific file types when possible
- Size filters can help reduce result sets

## Technical Details

### How Filters Work

1. **Query Parsing:** The query string is parsed to extract filters and text queries
2. **Elasticsearch Translation:** Filters are converted to Elasticsearch query DSL
3. **Execution:** Elasticsearch executes the combined query with filters
4. **Result Merging:** Chunked files are merged back into single results

### Indexed Fields

The following fields are indexed and searchable:

- `filename` - File name (text, analyzed)
- `path` - File path (keyword)
- `content` - File content (text, analyzed)
- `extension` - File extension (keyword)
- `size` - File size in bytes (long)
- `modified` - Last modification date (date)
- `created` - Creation date (date)
- `creator` - File creator/owner (keyword)
- `lastEditor` - Last editor (keyword)
- `fileType` - Categorized file type (keyword)

### Query Performance

- **Filter-heavy queries:** Fast (filters are cached by Elasticsearch)
- **Text-heavy queries:** Moderate (full-text search with fuzzy matching)
- **Combined queries:** Good (filters narrow down text search scope)
- **Date range queries:** Fast (indexed date fields)

## Future Enhancements

Planned features for future versions:

- Wildcard support in filenames: `filename:*budget*`
- Negation filters: `NOT filetype:pdf`
- Custom date formats
- Relative date expressions: `modified:last-7-days`
- Tag-based filtering
- Content type detection beyond extensions
- Fuzzy date matching

## Support

For issues or feature requests, please refer to the project repository or contact the development team.
