# Searcher Documentation

Complete documentation for the Searcher file search application.

## Quick Links

- [Main README](../README.md) - Project overview and quick start
- [User Guides](#user-guides) - How to use the application
- [Technical Documentation](#technical-documentation) - Implementation details for developers

---

## User Guides

Documentation for end users of the Searcher application.

### Getting Started

- **[Startup Guide](user-guides/startup-guide.md)** - How to start and stop the application
  - Auto-update mode (recommended)
  - Manual startup
  - Troubleshooting startup issues
  - Service URLs and health checks

### Search and Filtering

- **[Filtering Guide](user-guides/filtering-guide.md)** - Complete guide to advanced filtering
  - File type filtering
  - Boolean operators (AND/OR)
  - Date filtering (created/modified)
  - User filtering (creator/editor)
  - Size filtering with units
  - Combining filters
  - Query syntax rules and examples

- **[Quick Filter Reference](user-guides/quick-filter-reference.md)** - Cheat sheet for filter syntax
  - All filter types with syntax
  - Quick examples
  - Common use cases
  - Tips and tricks

- **[Filter Panel Guide](user-guides/filter-panel-guide.md)** - Using the visual filter panel
  - Accessing the filter panel
  - Using file type cards
  - Date range selection (flight-ticket style)
  - User and size filters
  - Boolean operators
  - Active filter display
  - Combining with text search

### Integration Features

- **[File Opening Guide](user-guides/file-opening.md)** - Opening files from search results
  - Cross-platform file opening
  - Platform-specific setup (Linux, macOS, Windows)
  - How it works (Docker to host bridge)
  - Troubleshooting file opening
  - Security notes

---

## Technical Documentation

Documentation for developers and contributors.

### Implementation

- **[Implementation Summary](technical/implementation-summary.md)** - Complete system architecture
  - Query parser module
  - Elasticsearch index mappings
  - Server integration
  - Frontend UI enhancements
  - Query processing flow
  - Key files and changes

- **[Filter Fixes](technical/filter-fixes.md)** - Technical fixes to the filter system
  - AND operator phrase matching
  - Date filter timezone handling
  - Size filter validation and parsing
  - Error handling and logging
  - Testing recommendations

- **[Filter UI Implementation](technical/filter-ui-implementation.md)** - UI design and implementation
  - Flight-ticket-style date pickers
  - Visual file type cards
  - Component structure
  - State management
  - Responsive design
  - Accessibility features

---

## Documentation Index by Topic

### Setup and Installation
- [Windows Setup Script](../setup-windows.ps1)
- [Linux/macOS Auto-Update Script](../auto-update.sh)
- [Windows Auto-Update Script](../auto-update.ps1)

### Usage
- [Startup Guide](user-guides/startup-guide.md)
- [Filtering Guide](user-guides/filtering-guide.md)
- [Filter Panel Guide](user-guides/filter-panel-guide.md)
- [File Opening Guide](user-guides/file-opening.md)

### Quick Reference
- [Quick Filter Reference](user-guides/quick-filter-reference.md)
- [Main README](../README.md)

### Development
- [Implementation Summary](technical/implementation-summary.md)
- [Filter Fixes](technical/filter-fixes.md)
- [Filter UI Implementation](technical/filter-ui-implementation.md)

---

## Document Versions

All documentation is current as of the latest commit. If you find outdated information, please create an issue or submit a pull request.

### Recent Updates
- **2025-10**: Reorganized documentation into docs/ directory
- **2025-10**: Added auto-update script documentation
- **2025-10**: Updated startup guide for current architecture
- **2025-10**: Added comprehensive setup scripts documentation

---

## Contributing to Documentation

We welcome documentation improvements! Please follow these guidelines:

### Writing Style
- Use clear, concise language
- Include practical examples
- Add troubleshooting sections
- Test all commands and code snippets
- Use proper markdown formatting

### Structure
- User guides: Focus on "how to" for end users
- Technical docs: Focus on architecture and implementation details
- Include table of contents for long documents
- Use proper heading hierarchy

### Submitting Changes
1. Fork the repository
2. Make your documentation changes
3. Test all links and examples
4. Submit a pull request with clear description
5. Request review from maintainers

---

## Support and Community

- **Issues**: Report bugs or request features on GitHub
- **Discussions**: Ask questions in GitHub Discussions
- **Email**: Contact the development team

---

## License

This documentation is part of the Searcher project and is available under the same license as the project (MIT).
