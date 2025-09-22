# Searcher Application Startup Guide

This guide explains how to start the complete Searcher application stack with a single command across different operating systems.

## Quick Start

### Linux / macOS
```bash
./start.sh
```

### Windows (Command Prompt)
```cmd
start.bat
```

### Windows (PowerShell)
```powershell
.\start.ps1
```

### Cross-Platform (Node.js)
```bash
node start-all.js
```

## What Gets Started

The startup script orchestrates the entire application stack:

1. **🔍 Prerequisites Check**
   - Verifies Node.js installation
   - Verifies Docker installation
   - Verifies Docker Compose installation

2. **📦 Dependency Setup**
   - Creates elasticsearch data directory with proper permissions
   - Installs backend Node.js dependencies if needed
   - Installs frontend Node.js dependencies if needed

3. **🐳 Docker Containers**
   - **Elasticsearch**: Search engine backend (port 9200)
   - **Backend API**: Search API server (port 3001)
   - **Frontend**: React web application (port 3000)

4. **🐕 File System Watchdog**
   - Monitors your home directory for file changes
   - Automatically updates the search index when files are added/modified/deleted
   - Runs incremental indexing for better performance

5. **📂 Host File Opener**
   - Platform-specific file opener for opening search results
   - **Linux**: Uses `xdg-open` or `gnome-open`
   - **macOS**: Uses `open` command
   - **Windows**: Uses `start`, PowerShell, or batch files
   - Handles the Docker-to-host file opening bridge

## Command Line Options

```bash
# Basic startup
./start.sh

# Development mode (rebuilds containers)
./start.sh --dev

# Force rebuild containers
./start.sh --build

# Skip file system watchdog
./start.sh --no-watchdog

# Skip host file opener
./start.sh --no-opener

# Show help
./start.sh --help
```

## Prerequisites

### All Platforms
- **Node.js** (v14 or higher) - [Download](https://nodejs.org/)
- **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop/)
- **Docker Compose** (usually included with Docker Desktop)

### Platform-Specific

#### Linux
- `xdg-open` or `gnome-open` (usually pre-installed)
- Proper permissions for Docker

#### macOS
- Docker Desktop for Mac
- `open` command (pre-installed)

#### Windows
- Docker Desktop for Windows
- Windows PowerShell or Command Prompt
- Optional: WSL2 for better Docker performance

## Startup Process

1. **Initialization** (5-10 seconds)
   - Prerequisites check
   - Dependency installation
   - Directory setup

2. **Container Startup** (30-60 seconds)
   - Elasticsearch startup and cluster formation
   - Backend API server startup
   - Frontend development server startup

3. **Service Ready** (10-15 seconds)
   - Health checks for all services
   - File system watchdog initialization
   - Host file opener startup

4. **Ready to Use**
   - Total startup time: 1-2 minutes
   - All services running and monitored

## Service URLs

Once started, the following services will be available:

- **Frontend Application**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Elasticsearch**: http://localhost:9200
- **API Health Check**: http://localhost:3001/health

## Monitoring

The startup script provides real-time monitoring:

```
🐳 elasticsearch    | [INFO] Cluster health: green
🐳 search_backend   | Server running at http://0.0.0.0:3001
🐳 search_frontend  | Local: http://localhost:3000
🐕 File watchdog started successfully
📂 Host file opener ready
```

## Graceful Shutdown

Press `Ctrl+C` to stop all services gracefully:

1. Stops file system watchdog
2. Stops host file opener
3. Stops Docker containers
4. Cleans up temporary files
5. Releases ports

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Check what's using the ports
netstat -tulpn | grep -E ':3000|:3001|:9200'

# Kill processes using the ports (Linux/macOS)
sudo lsof -ti:3000,3001,9200 | xargs kill -9

# Kill processes using the ports (Windows)
netstat -ano | findstr ":3000"
taskkill /PID <PID> /F
```

#### Docker Not Starting
```bash
# Check Docker status
docker --version
docker info

# Restart Docker service (Linux)
sudo systemctl restart docker

# Restart Docker Desktop (Windows/macOS)
# Use the Docker Desktop application
```

#### Permission Issues (Linux)
```bash
# Fix elasticsearch data directory permissions
sudo chown -R 1000:1000 elasticsearch_data
chmod 777 elasticsearch_data

# Add user to docker group
sudo usermod -aG docker $USER
# Log out and back in
```

#### Memory Issues
```bash
# Increase Docker memory limit (Docker Desktop)
# Settings -> Resources -> Memory (recommend 4GB+)

# Check available memory
free -h  # Linux
vm_stat  # macOS
```

### Debug Mode

Run with additional debugging:

```bash
# Enable Docker Compose verbose output
COMPOSE_LOG_LEVEL=DEBUG ./start.sh

# Check individual service logs
docker-compose logs elasticsearch
docker-compose logs backend
docker-compose logs frontend
```

### Manual Recovery

If the automatic startup fails:

```bash
# Stop all containers
docker-compose down

# Remove volumes (nuclear option)
docker-compose down -v

# Rebuild everything
docker-compose build --no-cache

# Start manually
docker-compose up
```

## Development

For development work:

```bash
# Development mode (with hot reload)
./start.sh --dev

# Skip watchdog during development
./start.sh --dev --no-watchdog

# Manual service management
docker-compose up elasticsearch  # Start only Elasticsearch
npm run dev --prefix backend     # Start backend in dev mode
npm run dev --prefix frontend    # Start frontend in dev mode
```

## Performance Tips

1. **Allocate adequate resources**: 4GB+ RAM, 2+ CPU cores for Docker
2. **Use SSD storage**: For better Elasticsearch performance
3. **Limit file watching**: Exclude large directories like node_modules
4. **Monitor system resources**: Watch CPU/memory usage during indexing

## Security Notes

- Services run on localhost only (not exposed externally)
- File opener validates paths to prevent directory traversal
- Elasticsearch security is disabled for development (don't use in production)
- Docker containers run with limited privileges