import React, { useState, useEffect, useCallback } from 'react';
import { Search, FileText, Clock, Folder, ExternalLink, File, Presentation, Sheet, BookOpen, History, X, Trash2, HelpCircle, User, Filter, Calendar as CalendarIcon, HardDrive, UserCircle, ChevronDown } from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Label } from './components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Calendar } from './components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './components/ui/popover';
import MultipleSelector, { type Option } from './components/ui/multiselector';

interface SearchResult {
  id: string;
  score: number;
  filename: string;
  path: string;
  content: string;
  highlights: string[];
  size: number;
  modified: string;
  created?: string;
  fileType?: string;
  creator?: string;
  lastEditor?: string;
}

interface SearchResponse {
  total: number;
  results: SearchResult[];
}

interface Stats {
  totalFiles: number;
  indexSize: number;
}

interface HistoryItem {
  id: number;
  query: string;
  resultsCount: number;
  timestamp: string;
}

interface Filters {
  fileTypes: string[];
  createdDateOp: string;
  createdDate: string;
  createdDateEnd: string;
  modifiedDateOp: string;
  modifiedDate: string;
  modifiedDateEnd: string;
  creator: string;
  editor: string;
  sizeOp: string;
  sizeValue: string;
  sizeUnit: string;
  sizeValueEnd: string;
  booleanOp: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// File type options for MultiSelector
const FILE_TYPE_OPTIONS: Option[] = [
  // PDF
  { value: 'pdf', label: 'PDF', group: 'Documents' },

  // Word Documents
  { value: 'doc', label: 'DOC (Word 97-2003)', group: 'Word Documents' },
  { value: 'docx', label: 'DOCX (Word)', group: 'Word Documents' },
  { value: 'docm', label: 'DOCM (Word Macro)', group: 'Word Documents' },
  { value: 'dot', label: 'DOT (Word Template 97-2003)', group: 'Word Documents' },
  { value: 'dotx', label: 'DOTX (Word Template)', group: 'Word Documents' },
  { value: 'dotm', label: 'DOTM (Word Template Macro)', group: 'Word Documents' },
  { value: 'odt', label: 'ODT (OpenDocument)', group: 'Word Documents' },
  { value: 'rtf', label: 'RTF (Rich Text)', group: 'Word Documents' },

  // PowerPoint Presentations
  { value: 'ppt', label: 'PPT (PowerPoint 97-2003)', group: 'Presentations' },
  { value: 'pptx', label: 'PPTX (PowerPoint)', group: 'Presentations' },
  { value: 'pptm', label: 'PPTM (PowerPoint Macro)', group: 'Presentations' },
  { value: 'pot', label: 'POT (PowerPoint Template 97-2003)', group: 'Presentations' },
  { value: 'potx', label: 'POTX (PowerPoint Template)', group: 'Presentations' },
  { value: 'potm', label: 'POTM (PowerPoint Template Macro)', group: 'Presentations' },
  { value: 'pps', label: 'PPS (PowerPoint Show 97-2003)', group: 'Presentations' },
  { value: 'ppsx', label: 'PPSX (PowerPoint Show)', group: 'Presentations' },
  { value: 'ppsm', label: 'PPSM (PowerPoint Show Macro)', group: 'Presentations' },
];

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    fileTypes: [],
    createdDateOp: '>',
    createdDate: '',
    createdDateEnd: '',
    modifiedDateOp: '>',
    modifiedDate: '',
    modifiedDateEnd: '',
    creator: '',
    editor: '',
    sizeOp: '>',
    sizeValue: '',
    sizeUnit: 'MB',
    sizeValueEnd: '',
    booleanOp: 'AND'
  });

  // Popover states for date pickers
  const [createdStartOpen, setCreatedStartOpen] = useState(false);
  const [createdEndOpen, setCreatedEndOpen] = useState(false);
  const [modifiedStartOpen, setModifiedStartOpen] = useState(false);
  const [modifiedEndOpen, setModifiedEndOpen] = useState(false);

  // Selected file types for MultiSelector
  const [selectedFileTypes, setSelectedFileTypes] = useState<Option[]>([]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/history?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.history);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  }, []);

  const deleteHistoryItem = async (id: number) => {
    try {
      const response = await fetch(`${API_URL}/history/${id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        fetchHistory();
      }
    } catch (error) {
      console.error('Failed to delete history item:', error);
    }
  };

  const clearAllHistory = async () => {
    if (!confirm('Are you sure you want to clear all search history?')) return;

    try {
      const response = await fetch(`${API_URL}/history`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setHistory([]);
      }
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchHistory();
  }, [fetchStats, fetchHistory]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/search?q=${encodeURIComponent(query)}&size=50`);

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: SearchResponse = await response.json();
      setResults(data.results);
      setTotal(data.total);

      // Refresh history after successful search
      fetchHistory();
    } catch (error) {
      console.error('Search error:', error);
      setError('Search failed. Please try again.');
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFile = async (filePath: string) => {
    try {
      const response = await fetch('/api/open-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('File opened:', result.message);
      } else {
        const error = await response.json();
        console.error('Failed to open file:', error.message || response.statusText);
      }
    } catch (error) {
      console.error('Error opening file:', error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString();
  };

  const getFileIcon = (filename: string, fileType?: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();

    if (fileType === 'pdf' || ext === 'pdf') {
      return <BookOpen className="h-4 w-4 text-red-500" />;
    }
    if (fileType === 'document' || ['doc', 'docx', 'odt', 'rtf'].includes(ext || '')) {
      return <FileText className="h-4 w-4 text-blue-500" />;
    }
    if (fileType === 'presentation' || ['ppt', 'pptx'].includes(ext || '')) {
      return <Presentation className="h-4 w-4 text-orange-500" />;
    }
    if (fileType === 'spreadsheet' || ['xls', 'xlsx'].includes(ext || '')) {
      return <Sheet className="h-4 w-4 text-green-500" />;
    }

    return <File className="h-4 w-4 text-muted-foreground" />;
  };

  const highlightText = (text: string, highlights: string[]) => {
    if (!highlights.length) return text;

    const firstHighlight = highlights[0];
    return (
      <div dangerouslySetInnerHTML={{ __html: firstHighlight }} />
    );
  };

  const filteredHistory = historySearch
    ? history.filter(item => item.query.toLowerCase().includes(historySearch.toLowerCase()))
    : history;

  const buildQueryFromFilters = () => {
    const parts: string[] = [];

    // Add text query if exists
    if (query.trim()) {
      parts.push(query.trim());
    }

    // Add file type filter from MultiSelector
    if (selectedFileTypes.length > 0) {
      const fileTypeValues = selectedFileTypes.map(ft => ft.value).join(',');
      parts.push(`filetype:${fileTypeValues}`);
    }

    // Add created date filter
    if (filters.createdDate) {
      if (filters.createdDateEnd) {
        // Range: from date to date
        parts.push(`created:${filters.createdDate}..${filters.createdDateEnd}`);
      } else {
        // Just from date (>= operator - on or after)
        parts.push(`created:>=${filters.createdDate}`);
      }
    }

    // Add modified date filter
    if (filters.modifiedDate) {
      if (filters.modifiedDateEnd) {
        // Range: from date to date
        parts.push(`modified:${filters.modifiedDate}..${filters.modifiedDateEnd}`);
      } else {
        // Just from date (>= operator - on or after)
        parts.push(`modified:>=${filters.modifiedDate}`);
      }
    }

    // Add creator filter
    if (filters.creator.trim()) {
      parts.push(`creator:${filters.creator.trim()}`);
    }

    // Add editor filter
    if (filters.editor.trim()) {
      parts.push(`editor:${filters.editor.trim()}`);
    }

    // Add size filter
    if (filters.sizeValue || filters.sizeValueEnd) {
      if (filters.sizeValue && filters.sizeValueEnd) {
        // Range: both min and max specified
        parts.push(`size:${filters.sizeValue}${filters.sizeUnit}..${filters.sizeValueEnd}${filters.sizeUnit}`);
      } else if (filters.sizeValue) {
        // Only minimum specified (larger than)
        parts.push(`size:>${filters.sizeValue}${filters.sizeUnit}`);
      } else if (filters.sizeValueEnd) {
        // Only maximum specified (smaller than)
        parts.push(`size:<${filters.sizeValueEnd}${filters.sizeUnit}`);
      }
    }

    return parts.join(' ');
  };

  const clearFilters = () => {
    setFilters({
      fileTypes: [],
      createdDateOp: '>',
      createdDate: '',
      createdDateEnd: '',
      modifiedDateOp: '>',
      modifiedDate: '',
      modifiedDateEnd: '',
      creator: '',
      editor: '',
      sizeOp: '>',
      sizeValue: '',
      sizeUnit: 'MB',
      sizeValueEnd: '',
      booleanOp: 'AND'
    });
    setSelectedFileTypes([]);
  };

  const applyFilters = () => {
    const filterQuery = buildQueryFromFilters();
    setQuery(filterQuery);
    // Trigger search with the new query
    const searchEvent = new Event('submit') as any;
    handleSearch(searchEvent);
  };

  const hasActiveFilters = () => {
    return selectedFileTypes.length > 0 ||
           filters.createdDate ||
           filters.modifiedDate ||
           filters.creator ||
           filters.editor ||
           filters.sizeValue;
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* History Sidebar */}
      <div
        className={`fixed top-0 left-0 h-full bg-card border-r transition-transform duration-300 ease-in-out z-50 ${
          showHistory ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: '320px' }}
      >
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <h2 className="font-semibold">Search History</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-4 border-b">
          <Input
            type="text"
            placeholder="Filter history..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="w-full"
          />
        </div>

        <div className="overflow-y-auto" style={{ height: 'calc(100vh - 180px)' }}>
          {filteredHistory.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No search history yet
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded hover:bg-accent cursor-pointer group relative"
                  onClick={() => {
                    setQuery(item.query);
                    setShowHistory(false);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {item.query}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {item.resultsCount} results • {new Date(item.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteHistoryItem(item.id);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={clearAllHistory}
            disabled={history.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear All History
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${showHistory ? 'ml-80' : ''}`}>
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8">
              <div className="flex items-center justify-between mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center gap-2"
                >
                  <History className="h-4 w-4" />
                  History {history.length > 0 && `(${history.length})`}
                </Button>
                <h1 className="text-4xl font-bold flex items-center gap-2">
                  <Search className="h-8 w-8" />
                  File Search
                </h1>
                <div></div> {/* Spacer */}
              </div>
              <p className="text-muted-foreground mb-6">
                Search through your local files using Elasticsearch
              </p>

              {stats && (
                <div className="flex justify-center gap-6 text-sm text-muted-foreground mb-6">
                  <span className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    {stats.totalFiles.toLocaleString()} files indexed
                  </span>
                  <span>
                    Index size: {formatFileSize(stats.indexSize)}
                  </span>
                </div>
              )}
            </div>

          <Card className="mb-8">
            <CardContent className="pt-6">
              <form onSubmit={handleSearch} className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Search with filters: filetype:pdf created:>2024-01-01 word1 AND word2"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant={showFilters ? "default" : "outline"}
                  size="icon"
                  onClick={() => setShowFilters(!showFilters)}
                  title="Toggle filters"
                >
                  <Filter className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowHelp(!showHelp)}
                  title="Show help"
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'Searching...' : 'Search'}
                </Button>
              </form>

              {showHelp && (
                <div className="mt-4 p-4 bg-muted rounded-lg text-sm">
                  <h3 className="font-semibold mb-2">Advanced Search Syntax</h3>
                  <div className="space-y-2">
                    <div>
                      <strong>File Types:</strong> <code>filetype:pdf,docx,pptx</code>
                    </div>
                    <div>
                      <strong>Boolean Operators:</strong> <code>word1 AND word2</code>, <code>word1 OR word2</code>
                    </div>
                    <div>
                      <strong>Date Filters:</strong>
                      <ul className="ml-4 mt-1">
                        <li><code>created:&gt;2024-01-01</code> - After date</li>
                        <li><code>modified:&lt;2024-12-31</code> - Before date</li>
                        <li><code>created:2024-01-01..2024-12-31</code> - Date range</li>
                      </ul>
                    </div>
                    <div>
                      <strong>User Filters:</strong> <code>creator:username</code>, <code>editor:username</code>
                    </div>
                    <div>
                      <strong>Size Filters:</strong> <code>size:&gt;1MB</code>, <code>size:&lt;100KB</code>, <code>size:1MB..5MB</code>
                    </div>
                    <div className="mt-2 pt-2 border-t">
                      <strong>Example:</strong> <code>filetype:pdf created:&gt;2024-01-01 budget AND report</code>
                    </div>
                  </div>
                </div>
              )}

              {showFilters && (
                <div className="mt-4 p-4 border rounded-lg bg-card space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      <Filter className="h-5 w-5" />
                      Advanced Filters
                    </h3>
                    {hasActiveFilters() && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                      >
                        Clear All
                      </Button>
                    )}
                  </div>

                  {/* File Type Filter */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      File Types
                    </Label>
                    <MultipleSelector
                      value={selectedFileTypes}
                      onChange={setSelectedFileTypes}
                      defaultOptions={FILE_TYPE_OPTIONS}
                      placeholder="Select file types..."
                      groupBy="group"
                      emptyIndicator={
                        <p className="text-center text-sm text-muted-foreground">No file types found</p>
                      }
                    />
                  </div>

                  {/* Date Filters - Flight Ticket Style */}
                  <div className="space-y-4">
                    {/* Created Date */}
                    <div className="space-y-3">
                      <Label className="flex items-center gap-2 text-base">
                        <CalendarIcon className="h-5 w-5" />
                        Created Date
                      </Label>
                      <div className="border-2 rounded-lg p-4 bg-card">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">From</label>
                            <Popover open={createdStartOpen} onOpenChange={setCreatedStartOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full h-12 justify-between font-normal text-base"
                                >
                                  {filters.createdDate ? new Date(filters.createdDate).toLocaleDateString() : "Select date"}
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={filters.createdDate ? new Date(filters.createdDate) : undefined}
                                  captionLayout="dropdown"
                                  onSelect={(date) => {
                                    setFilters(prev => ({
                                      ...prev,
                                      createdDate: date ? date.toISOString().split('T')[0] : '',
                                      createdDateOp: prev.createdDateEnd ? 'range' : '>='
                                    }));
                                    setCreatedStartOpen(false);
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">To (Optional)</label>
                            <Popover open={createdEndOpen} onOpenChange={setCreatedEndOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full h-12 justify-between font-normal text-base"
                                >
                                  {filters.createdDateEnd ? new Date(filters.createdDateEnd).toLocaleDateString() : "Select date"}
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={filters.createdDateEnd ? new Date(filters.createdDateEnd) : undefined}
                                  captionLayout="dropdown"
                                  disabled={(date) => filters.createdDate ? date < new Date(filters.createdDate) : false}
                                  onSelect={(date) => {
                                    setFilters(prev => ({
                                      ...prev,
                                      createdDateEnd: date ? date.toISOString().split('T')[0] : '',
                                      createdDateOp: date ? 'range' : '>='
                                    }));
                                    setCreatedEndOpen(false);
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                        {filters.createdDate && (
                          <div className="mt-3 text-sm text-muted-foreground">
                            {filters.createdDateEnd
                              ? `Files created between ${filters.createdDate} and ${filters.createdDateEnd}`
                              : `Files created from ${filters.createdDate} onwards`
                            }
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Modified Date */}
                    <div className="space-y-3">
                      <Label className="flex items-center gap-2 text-base">
                        <CalendarIcon className="h-5 w-5" />
                        Modified Date
                      </Label>
                      <div className="border-2 rounded-lg p-4 bg-card">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">From</label>
                            <Popover open={modifiedStartOpen} onOpenChange={setModifiedStartOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full h-12 justify-between font-normal text-base"
                                >
                                  {filters.modifiedDate ? new Date(filters.modifiedDate).toLocaleDateString() : "Select date"}
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={filters.modifiedDate ? new Date(filters.modifiedDate) : undefined}
                                  captionLayout="dropdown"
                                  onSelect={(date) => {
                                    setFilters(prev => ({
                                      ...prev,
                                      modifiedDate: date ? date.toISOString().split('T')[0] : '',
                                      modifiedDateOp: prev.modifiedDateEnd ? 'range' : '>='
                                    }));
                                    setModifiedStartOpen(false);
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium text-muted-foreground">To (Optional)</label>
                            <Popover open={modifiedEndOpen} onOpenChange={setModifiedEndOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className="w-full h-12 justify-between font-normal text-base"
                                >
                                  {filters.modifiedDateEnd ? new Date(filters.modifiedDateEnd).toLocaleDateString() : "Select date"}
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={filters.modifiedDateEnd ? new Date(filters.modifiedDateEnd) : undefined}
                                  captionLayout="dropdown"
                                  disabled={(date) => filters.modifiedDate ? date < new Date(filters.modifiedDate) : false}
                                  onSelect={(date) => {
                                    setFilters(prev => ({
                                      ...prev,
                                      modifiedDateEnd: date ? date.toISOString().split('T')[0] : '',
                                      modifiedDateOp: date ? 'range' : '>='
                                    }));
                                    setModifiedEndOpen(false);
                                  }}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                        {filters.modifiedDate && (
                          <div className="mt-3 text-sm text-muted-foreground">
                            {filters.modifiedDateEnd
                              ? `Files modified between ${filters.modifiedDate} and ${filters.modifiedDateEnd}`
                              : `Files modified from ${filters.modifiedDate} onwards`
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* User Filters */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <UserCircle className="h-4 w-4" />
                        Creator
                      </Label>
                      <Input
                        type="text"
                        value={filters.creator}
                        onChange={(e) => setFilters(prev => ({ ...prev, creator: e.target.value }))}
                        placeholder="Username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <UserCircle className="h-4 w-4" />
                        Last Editor
                      </Label>
                      <Input
                        type="text"
                        value={filters.editor}
                        onChange={(e) => setFilters(prev => ({ ...prev, editor: e.target.value }))}
                        placeholder="Username"
                      />
                    </div>
                  </div>

                  {/* Size Filter - Flight Ticket Style */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2 text-base">
                      <HardDrive className="h-5 w-5" />
                      File Size
                    </Label>
                    <div className="border-2 rounded-lg p-4 bg-card">
                      {/* Size Unit Selector */}
                      <div className="mb-4">
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">Unit</label>
                        <div className="grid grid-cols-4 gap-2">
                          {['B', 'KB', 'MB', 'GB'].map((unit) => (
                            <button
                              key={unit}
                              type="button"
                              onClick={() => setFilters(prev => ({ ...prev, sizeUnit: unit }))}
                              className={`p-2 rounded-lg border-2 transition-all text-sm font-medium ${
                                filters.sizeUnit === unit
                                  ? 'border-primary bg-primary/10 shadow-sm'
                                  : 'border-border hover:border-primary/50'
                              }`}
                            >
                              {unit}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Size Range Inputs */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">
                            Minimum (Optional)
                          </label>
                          <Input
                            type="number"
                            value={filters.sizeValue}
                            onChange={(e) => {
                              setFilters(prev => ({
                                ...prev,
                                sizeValue: e.target.value,
                                sizeOp: prev.sizeValueEnd ? 'range' : '>'
                              }));
                            }}
                            placeholder="Min size"
                            className="h-12 text-base"
                            min="0"
                            step="0.01"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-muted-foreground">
                            Maximum (Optional)
                          </label>
                          <Input
                            type="number"
                            value={filters.sizeValueEnd}
                            onChange={(e) => {
                              setFilters(prev => ({
                                ...prev,
                                sizeValueEnd: e.target.value,
                                sizeOp: e.target.value ? 'range' : '>'
                              }));
                            }}
                            placeholder="Max size"
                            className="h-12 text-base"
                            min={filters.sizeValue || "0"}
                            step="0.01"
                          />
                        </div>
                      </div>

                      {/* Preview Text */}
                      {(filters.sizeValue || filters.sizeValueEnd) && (
                        <div className="mt-3 text-sm text-muted-foreground">
                          {filters.sizeValue && filters.sizeValueEnd
                            ? `Files between ${filters.sizeValue}${filters.sizeUnit} and ${filters.sizeValueEnd}${filters.sizeUnit}`
                            : filters.sizeValue
                            ? `Files larger than ${filters.sizeValue}${filters.sizeUnit}`
                            : `Files smaller than ${filters.sizeValueEnd}${filters.sizeUnit}`
                          }
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Apply Filters Button */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      onClick={applyFilters}
                      className="flex-1"
                    >
                      Apply Filters
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Filters Display */}
          {hasActiveFilters() && (
            <Card className="mb-4">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-muted-foreground">Active Filters:</span>
                  {selectedFileTypes.map(fileType => (
                    <div key={fileType.value} className="inline-flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded-md text-sm">
                      <FileText className="h-3 w-3" />
                      {fileType.label}
                      <button
                        onClick={() => setSelectedFileTypes(prev => prev.filter(ft => ft.value !== fileType.value))}
                        className="ml-1 hover:bg-primary/80 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {filters.createdDate && (
                    <div className="inline-flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded-md text-sm">
                      <CalendarIcon className="h-3 w-3" />
                      Created: {filters.createdDateOp === 'range' ? `${filters.createdDate} to ${filters.createdDateEnd}` : `${filters.createdDateOp}${filters.createdDate}`}
                      <button
                        onClick={() => setFilters(prev => ({ ...prev, createdDate: '', createdDateEnd: '' }))}
                        className="ml-1 hover:bg-primary/80 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {filters.modifiedDate && (
                    <div className="inline-flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded-md text-sm">
                      <CalendarIcon className="h-3 w-3" />
                      Modified: {filters.modifiedDateOp === 'range' ? `${filters.modifiedDate} to ${filters.modifiedDateEnd}` : `${filters.modifiedDateOp}${filters.modifiedDate}`}
                      <button
                        onClick={() => setFilters(prev => ({ ...prev, modifiedDate: '', modifiedDateEnd: '' }))}
                        className="ml-1 hover:bg-primary/80 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {filters.creator && (
                    <div className="inline-flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded-md text-sm">
                      <UserCircle className="h-3 w-3" />
                      Creator: {filters.creator}
                      <button
                        onClick={() => setFilters(prev => ({ ...prev, creator: '' }))}
                        className="ml-1 hover:bg-primary/80 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {filters.editor && (
                    <div className="inline-flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded-md text-sm">
                      <UserCircle className="h-3 w-3" />
                      Editor: {filters.editor}
                      <button
                        onClick={() => setFilters(prev => ({ ...prev, editor: '' }))}
                        className="ml-1 hover:bg-primary/80 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  {filters.sizeValue && (
                    <div className="inline-flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded-md text-sm">
                      <HardDrive className="h-3 w-3" />
                      Size: {filters.sizeOp === 'range' ? `${filters.sizeValue}-${filters.sizeValueEnd}${filters.sizeUnit}` : `${filters.sizeOp}${filters.sizeValue}${filters.sizeUnit}`}
                      <button
                        onClick={() => setFilters(prev => ({ ...prev, sizeValue: '', sizeValueEnd: '' }))}
                        className="ml-1 hover:bg-primary/80 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="ml-auto"
                  >
                    Clear All
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {error && (
            <Card className="mb-6 border-destructive">
              <CardContent className="pt-6">
                <p className="text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          {total > 0 && (
            <div className="mb-4">
              <p className="text-sm text-muted-foreground">
                Found {total.toLocaleString()} results for "{query}"
              </p>
            </div>
          )}

          <div className="space-y-4">
            {results.map((result) => (
              <Card key={result.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        {getFileIcon(result.filename, result.fileType)}
                        {result.filename}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 mt-1 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Folder className="h-3 w-3" />
                          {result.path}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Modified: {formatDate(result.modified)}
                        </span>
                        {result.created && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Created: {formatDate(result.created)}
                          </span>
                        )}
                        <span>{formatFileSize(result.size)}</span>
                        {result.creator && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {result.creator}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenFile(result.path)}
                      className="ml-2 flex items-center gap-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {result.highlights.length > 0 ? (
                    <div className="text-sm bg-muted p-3 rounded">
                      {highlightText(result.content || '', result.highlights)}
                    </div>
                  ) : result.content ? (
                    <div className="text-sm text-muted-foreground">
                      {result.content.substring(0, 200)}
                      {result.content.length > 200 && '...'}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground italic">
                      No content preview available
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {results.length === 0 && query && !loading && !error && (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-muted-foreground">No results found for "{query}"</p>
              </CardContent>
            </Card>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
