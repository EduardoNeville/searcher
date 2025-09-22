# File Search Application

A full-stack application that uses Elasticsearch to search through all your local files with a React TypeScript frontend.

## Features

- **Full-text search** through local files using Elasticsearch
- **React TypeScript frontend** with Tailwind CSS and shadcn components
- **Clickable file paths** that open files directly
- **File highlighting** showing search matches in context
- **File metadata** including size, modification date, and path
- **Docker containerized** infrastructure

## Architecture

- **Frontend**: React TypeScript with Tailwind CSS and shadcn components
- **Backend**: Node.js Express API
- **Search Engine**: Elasticsearch 8.x
- **Infrastructure**: Docker Compose network

## Setup Instructions

### Prerequisites

- Docker and Docker Compose
- Node.js and yarn (for local development)

### 1. Start the Infrastructure

```bash
# Start all services (Elasticsearch, backend, frontend)
docker-compose up --build

# Or run in detached mode
docker-compose up -d --build
```

### 2. Index Your Files

After the containers are running, index your local files:

```bash
# Index files (this will run inside the backend container)
docker-compose exec backend npm run index-files
```

This will:
- Create the Elasticsearch index
- Scan all files in your home directory
- Index text files (skip binary files and common build directories)
- Show progress and completion statistics

### 3. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Elasticsearch**: http://localhost:9200

## Usage

1. **Search**: Enter text in the search box to find files containing that text
2. **View Results**: Results show filename, path, file size, modification date, and highlighted text snippets
3. **Open Files**: Click the "Open" button next to any result to open the file with your default application

## File Types Supported

The indexer processes these file types:

### Text Files
- Code files: .js, .ts, .jsx, .tsx, .py, .java, .cpp, .c, .h, .cs, .php, .rb, .go, .rs
- Config files: .json, .yaml, .yml, .xml, .conf, .ini, .env
- Documentation: .txt, .md
- Web files: .html, .css, .scss
- Data files: .csv, .sql, .log

### Document Files
- **PDF**: .pdf - Full text extraction from PDF documents
- **Word Documents**: .docx, .doc - Microsoft Word documents
- **PowerPoint**: .pptx, .ppt - Microsoft PowerPoint presentations
- **Excel**: .xlsx, .xls - Microsoft Excel spreadsheets (limited support)
- **OpenDocument**: .odt - OpenDocument Text files
- **Rich Text**: .rtf - Rich Text Format documents

### Features for Document Files
- **Smart file type detection** with appropriate icons in the UI
- **Larger file size limits** (50MB for documents vs 10MB for text files)
- **Robust text extraction** that handles various document formats
- **Error handling** that continues indexing even if some documents fail to process

## Development

### Local Development Setup

If you want to run components locally for development:

#### Backend
```bash
cd backend
npm install
npm run dev
```

#### Frontend
```bash
cd frontend
yarn install
yarn start
```

### Environment Variables

#### Backend
- `ELASTICSEARCH_URL`: Elasticsearch connection URL (default: http://localhost:9200)

#### Frontend
- `REACT_APP_API_URL`: Backend API URL (default: http://localhost:3001)

## Docker Services

### elasticsearch
- **Image**: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
- **Ports**: 9200, 9300
- **Security**: Disabled for local development
- **Volume**: Your home directory mounted read-only at `/home/user`

### backend
- **Build**: ./backend
- **Ports**: 3001
- **Dependencies**: elasticsearch
- **Volume**: Your home directory mounted read-only at `/home/user`

### frontend
- **Build**: ./frontend
- **Ports**: 3000
- **Dependencies**: backend

## API Endpoints

### GET /health
Check service health and Elasticsearch connection

### GET /search?q={query}&size={limit}
Search for files containing the query text
- `q`: Search query (required)
- `size`: Number of results to return (default: 20, max: 50)

### POST /open-file
Open a file with the default system application
- Body: `{ "path": "/full/path/to/file" }`

### GET /stats
Get indexing statistics
- Returns total file count and index size

## Troubleshooting

### Elasticsearch Issues
- Ensure Docker has enough memory (at least 2GB recommended)
- Check Elasticsearch logs: `docker-compose logs elasticsearch`
- Verify Elasticsearch is healthy: `curl http://localhost:9200/_cluster/health`

### File Access Issues
- Ensure the Docker daemon has access to your home directory
- Check volume mounts in docker-compose.yml
- Verify file permissions

### Search Not Working
- Run the indexer to populate Elasticsearch: `docker-compose exec backend npm run index-files`
- Check backend logs: `docker-compose logs backend`
- Verify API connectivity: `curl http://localhost:3001/health`

### Re-indexing Files
To re-index files after adding new content:
```bash
docker-compose exec backend npm run index-files
```

This will delete the existing index and create a fresh one with all current files.

## Security Notes

- The application runs with security features disabled for local development
- Files are mounted read-only for safety
- Only text files are indexed (binary files are skipped)
- The file opening feature uses your system's default application associations