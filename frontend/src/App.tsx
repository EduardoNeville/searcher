import React, { useState, useEffect, useCallback } from 'react';
import { Search, FileText, Clock, Folder, ExternalLink, File, Presentation, Sheet, BookOpen } from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';

interface SearchResult {
  id: string;
  score: number;
  filename: string;
  path: string;
  content: string;
  highlights: string[];
  size: number;
  modified: string;
  fileType?: string;
}

interface SearchResponse {
  total: number;
  results: SearchResult[];
}

interface Stats {
  totalFiles: number;
  indexSize: number;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

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

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-4 flex items-center justify-center gap-2">
              <Search className="h-8 w-8" />
              File Search
            </h1>
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
                  placeholder="Search for text in files..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" disabled={loading}>
                  {loading ? 'Searching...' : 'Search'}
                </Button>
              </form>
            </CardContent>
          </Card>

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
                      <CardDescription className="flex items-center gap-4 mt-1">
                        <span className="flex items-center gap-1">
                          <Folder className="h-3 w-3" />
                          {result.path}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(result.modified)}
                        </span>
                        <span>{formatFileSize(result.size)}</span>
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
                      {highlightText(result.content, result.highlights)}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {result.content.substring(0, 200)}
                      {result.content.length > 200 && '...'}
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
  );
}

export default App;
