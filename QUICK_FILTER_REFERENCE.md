# Quick Filter Reference

## Filter Syntax Cheat Sheet

### File Type
```
filetype:pdf
filetype:pdf,docx,pptx
```

### Boolean Operators
```
word1 AND word2
word1 OR word2
(word1 OR word2) AND word3
```

### Date Filters
```
created:2024-01-15              # Exact date
created:>2024-01-01             # After date
created:<2024-12-31             # Before date
created:>=2024-01-01            # On or after
created:<=2024-12-31            # On or before
created:2024-01-01..2024-12-31  # Date range

modified:>2024-01-01            # Same syntax for modified
```

### User Filters
```
creator:username
editor:username
```

### Size Filters
```
size:1MB                    # Exact size (±1% tolerance)
size:>500KB                 # Larger than
size:<10MB                  # Smaller than
size:>=1MB                  # At least
size:<=5MB                  # At most
size:1MB..5MB               # Size range
```

Units: `B`, `KB`, `MB`, `GB`

## Quick Examples

```
# PDFs created in 2024
filetype:pdf created:>2024-01-01

# Large documents modified recently
size:>5MB modified:>2024-11-01

# Budget reports by John
creator:john budget AND report

# Presentations larger than 10MB
filetype:pptx size:>10MB

# Recent invoices or receipts
(invoice OR receipt) modified:>2024-11-01

# Complex query
filetype:pdf,docx created:2024-01-01..2024-12-31 size:<10MB marketing AND (strategy OR plan)
```

## Tips

1. Filters can be placed anywhere in the query
2. Combine multiple filters for precise results
3. Use date ranges for time-bound searches
4. Boolean operators: AND (both terms), OR (either term)
5. Filter values are case-sensitive for usernames
6. File extensions in filetype are case-insensitive

## Date Format

Always use: `YYYY-MM-DD` (e.g., `2024-01-15`)

## Need Help?

- Click the help icon (?) in the search bar for inline help
- See FILTERING_GUIDE.md for comprehensive documentation
- Examples are available in the UI help panel
