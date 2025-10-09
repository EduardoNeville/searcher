# Filter Panel User Guide

## Overview

The Filter Panel provides an intuitive, visual way to apply advanced filters to your searches without needing to remember the query syntax. Access it by clicking the **Filter** button (funnel icon) next to the search bar.

## Accessing the Filter Panel

1. Click the **Filter** icon (🔽) button next to the search bar
2. The filter panel will expand below the search bar
3. Click the button again to collapse the panel

The Filter button will be highlighted when the panel is open or when you have active filters applied.

## Using the Filter Panel

### 1. File Type Filter

**Purpose:** Select which file types to search

**How to use:**
- Click on any file type button to select it (PDF, DOCX, PPTX, XLSX)
- Selected types will be highlighted in blue
- Click again to deselect
- You can select multiple file types

**Example:**
- Click `PDF` and `DOCX` to search only PDF and Word documents

### 2. Date Filters

**Purpose:** Filter files by creation or modification date

**How to use:**

#### Created Date:
1. Select an operator from the dropdown:
   - **After** (`>`) - Files created after this date
   - **On/After** (`>=`) - Files created on or after this date
   - **Before** (`<`) - Files created before this date
   - **On/Before** (`<=`) - Files created on or before this date
   - **Range** - Files created between two dates

2. Click the date input to select a date using the calendar picker

3. If you selected "Range", a second date input will appear for the end date

#### Modified Date:
- Works exactly the same as Created Date
- Filters based on when the file was last modified

**Examples:**
- **After 2024-01-01:** Find files created in 2024
- **Range from 2024-01-01 to 2024-03-31:** Find files created in Q1 2024
- **Before 2024-12-31:** Find older files

### 3. User Filters

**Purpose:** Filter files by who created or edited them

**How to use:**

#### Creator:
- Type the username of the file creator/owner
- Case-sensitive
- Must match the system username

#### Last Editor:
- Type the username of the person who last edited the file
- Case-sensitive
- Must match the system username

**Examples:**
- Creator: `john` - Find all files created by user "john"
- Editor: `sarah` - Find all files last edited by user "sarah"

**Note:** User information is extracted from file system metadata. On some systems, this may not be available for all files.

### 4. File Size Filter

**Purpose:** Filter files by size

**How to use:**

1. Select an operator:
   - **Larger than** (`>`)
   - **At least** (`>=`)
   - **Smaller than** (`<`)
   - **At most** (`<=`)
   - **Range** - Between two sizes

2. Enter a numeric value

3. Select the unit (B, KB, MB, GB)

4. If you selected "Range", enter the end size value
   - The unit applies to both values

**Examples:**
- **Larger than 5 MB:** Find large files over 5 megabytes
- **Smaller than 100 KB:** Find small files under 100 kilobytes
- **Range 1 MB to 10 MB:** Find medium-sized files

### 5. Boolean Operator

**Purpose:** Control how multiple search terms are combined

**How to use:**
- Click **AND (all terms)** to require all search terms to be present
- Click **OR (any term)** to match files containing any of the search terms

**Examples:**
- Search: `budget report` with AND → Files containing both "budget" AND "report"
- Search: `invoice receipt` with OR → Files containing either "invoice" OR "receipt"

## Applying Filters

After configuring your filters:

1. Click the **Apply Filters** button at the bottom of the panel
2. The filters will be converted to the query syntax and added to the search bar
3. The search will execute automatically
4. Active filters will be displayed as chips below the search bar

## Active Filters Display

When you have filters applied, you'll see them displayed as **filter chips** below the search bar:

### Features:
- **Visual representation** of each active filter
- **Icons** to identify filter type quickly
- **Quick removal** - Click the × on any chip to remove that filter
- **Clear All button** - Remove all filters at once

### Example Display:
```
Active Filters:  [PDF] [DOCX] [Created: >2024-01-01] [Size: >5MB] [Clear All]
```

## Combining with Text Search

The filter panel works alongside text search:

1. Enter your search terms in the search bar
2. Open the filter panel and select filters
3. Click "Apply Filters"
4. Both text search and filters will be applied together

**Example:**
- Search bar: `quarterly report`
- Filters: File type `PDF`, Created after `2024-01-01`
- Result: Searches for "quarterly report" in PDF files created after Jan 1, 2024

## Tips and Best Practices

### 1. Start Simple
- Begin with one or two filters
- Add more filters if you need to narrow results

### 2. File Type First
- Select file types first to quickly narrow the search scope
- This makes date and size filters more effective

### 3. Date Ranges for Time-Based Searches
- Use date ranges for quarterly or annual reports
- Example: Q1 2024 = Range from 2024-01-01 to 2024-03-31

### 4. Size Filters for Performance
- Large file filters help find presentations and videos
- Small file filters help find text documents and notes

### 5. Combine Filters
- File type + Date = Find recent documents of specific types
- File type + Size = Find large presentations or small PDFs
- Date + Creator = Find recent work by specific users

### 6. Clear and Reapply
- Use "Clear All" to reset and start fresh
- Remove individual filters by clicking the × on their chip

## Filter Panel vs. Query Syntax

You can use either method:

### Filter Panel (Visual):
✅ No need to remember syntax
✅ Visual, user-friendly
✅ See all filter options
✅ Easy to experiment
✅ Great for beginners

### Query Syntax (Text):
✅ Faster for power users
✅ More precise control
✅ Copy/paste queries
✅ Save complex queries
✅ Script-friendly

**Best approach:** Use the filter panel to build your query, then copy the generated syntax for reuse!

## Common Workflows

### Finding Recent Important Documents
1. Open filter panel
2. Select file types: `PDF`, `DOCX`
3. Set Modified date: `After` → `2024-11-01`
4. Enter search terms: `important` or `urgent`
5. Apply filters

### Locating Large Media Files
1. Open filter panel
2. Select file type: `PPTX` (or other media types)
3. Set Size: `Larger than` → `10` `MB`
4. Apply filters

### Finding User's Work in Date Range
1. Open filter panel
2. Set Creator: Username
3. Set Created date: `Range` → Start and end dates
4. Apply filters

### Quarterly Report Search
1. Open filter panel
2. Select file types: `PDF`, `DOCX`
3. Set Created date: Range for quarter (e.g., 2024-01-01 to 2024-03-31)
4. Enter search terms: `quarterly report`
5. Set Boolean operator: `AND`
6. Apply filters

## Troubleshooting

### Filters not showing results?
- Check if date formats are correct
- Verify usernames are spelled correctly
- Ensure file types are indexed (PDF, DOCX, PPTX, XLSX)
- Try removing filters one by one to identify the issue

### Filter button not responding?
- Refresh the page
- Check browser console for errors
- Ensure JavaScript is enabled

### Date picker not working?
- Use a modern browser (Chrome, Firefox, Edge, Safari)
- Manually type dates in YYYY-MM-DD format if needed

### User filters showing no results?
- User information may not be available on all file systems
- Check if the username matches the system username exactly (case-sensitive)
- Try searching without user filters first

## Keyboard Shortcuts

While the filter panel doesn't have dedicated keyboard shortcuts, you can use:

- **Tab** - Navigate between filter inputs
- **Enter** in search bar - Execute search
- **Esc** - Close dropdowns (browser default)

## Mobile Support

The filter panel is responsive and works on mobile devices:

- Filters stack vertically on smaller screens
- Date pickers use native mobile date selectors
- Touch-friendly button sizes
- Scrollable filter panel

## Advanced Tips

### 1. Building Complex Queries Visually
Use the filter panel to build complex queries, then:
1. Apply the filters
2. Copy the generated query from the search bar
3. Save it for future use
4. Modify it manually for even more precision

### 2. Filter Presets
Create your own "presets" by:
1. Building a common filter combination
2. Copying the generated query
3. Pasting it when needed
4. Consider saving in a text file or note app

### 3. Incremental Filtering
Narrow results progressively:
1. Start with a broad search
2. Apply one filter
3. Review results
4. Add more filters to narrow further
5. Remove filters if too narrow

## Integration with Search History

Searches performed using the filter panel are saved to search history:
- Full query (with filter syntax) is saved
- Click on history items to reuse filtered searches
- Edit historical filtered searches
- Build on previous filtered searches

## Future Enhancements

Planned features for the filter panel:

- **Saved Filter Presets** - Save and name common filter combinations
- **Quick Filters** - One-click filters for common scenarios
- **Filter Templates** - Pre-configured filters for specific use cases
- **Recent Filters** - Quick access to recently used filters
- **Filter Suggestions** - Based on search patterns

## Support

For issues, questions, or feature requests:
- Check the inline help (? button)
- Refer to FILTERING_GUIDE.md for query syntax
- See QUICK_FILTER_REFERENCE.md for syntax cheat sheet
- Report issues to the development team

---

**Pro Tip:** The filter panel and query syntax work together! Use the panel to learn the syntax, then graduate to typing queries directly for speed.
