# Searcher Application Startup Guide

This guide explains how to start the complete Searcher application stack across different operating systems.

## Quick Start

### Windows

**Recommended: Auto-Update Mode**
```powershell
powershell -ExecutionPolicy Bypass -File auto-update.ps1
```

**Manual Mode**
```powershell
# Start Docker containers
docker compose up -d

# In a new terminal: Start frontend
cd frontend
npm run dev
```

### Linux / macOS

**Recommended: Auto-Update Mode**
```bash
chmod +x auto-update.sh
./auto-update.sh
```

**Manual Mode**
```bash
# Start backend services
docker compose up -d

# In a new terminal: Start frontend
cd frontend
npm install  # First time only
npm run dev
```

## What Gets Started

The startup process orchestrates the entire application stack:

1. **Prerequisites Check**
   - Verifies Node.js installation
   - Verifies Docker installation
   - Verifies Docker Compose installation
   - Verifies Docker daemon is running

2. **Dependency Setup** (auto-update scripts only)
   - Creates elasticsearch data directory with proper permissions
   - Installs backend Node.js dependencies if needed
   - Installs frontend Node.js dependencies if needed

3. **Docker Containers**
   - **Elasticsearch**: Search engine backend (port 9200)
   - **Backend API**: Search API server (port 3001)

4. **Frontend Development Server**
   - **Frontend**: React web application (port 5173)
   - Hot module replacement enabled
   - TypeScript compilation

5. **File System Watchdog** (Docker container)
   - Monitors your home directory for file changes
   - Automatically updates the search index when files are added/modified/deleted
   - Runs incremental indexing for better performance

6. **Auto-Update Monitoring** (auto-update scripts only)
   - Monitors git repository for updates
   - Automatically rebuilds and restarts when changes detected
   - Configurable check interval (default: 30 minutes)

## Auto-Update Scripts

### Features

The auto-update scripts provide:
- **Automatic startup** of all services
- **Git update monitoring** with configurable intervals
- **Automatic rebuild** and restart on updates
- **Comprehensive logging** to `auto-update.log`
- **Health monitoring** with automatic restart if services crash
- **Graceful shutdown** handling (Ctrl+C)

### Usage

**Windows:**
```powershell
# Default 30-minute check interval
powershell -ExecutionPolicy Bypass -File auto-update.ps1

# Custom check interval (60 minutes)
powershell -ExecutionPolicy Bypass -File auto-update.ps1 60
```

**Linux/macOS:**
```bash
# Default 30-minute check interval
./auto-update.sh

# Custom check interval (60 minutes)
./auto-update.sh 60
```

### Stopping the Auto-Update Script

Press `Ctrl+C` in the terminal where the script is running. The script will:
1. Stop the frontend dev server
2. Stop Docker containers gracefully
3. Clean up PID files
4. Exit cleanly

## Manual Service Control

If you prefer manual control over services:

```bash
# Start all containers
docker compose up -d

# Start in foreground (see logs)
docker compose up

# Stop all containers
docker compose down

# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend
docker compose logs -f elasticsearch

# Rebuild containers
docker compose build

# Rebuild and start
docker compose up --build -d
```

## Service URLs

Once started, the following services will be available:

- **Frontend Application**: http://localhost:5173 (Vite dev server)
- **Backend API**: http://localhost:3001
- **Elasticsearch**: http://localhost:9200
- **API Health Check**: http://localhost:3001/health

## Prerequisites

### All Platforms
- **Node.js** (v14 or higher) - [Download](https://nodejs.org/)
- **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop/)
- **Docker Compose** (usually included with Docker Desktop)
- **Git** (for auto-update functionality)

### Platform-Specific

#### Linux
- `xdg-open` or `gnome-open` (usually pre-installed)
- Proper permissions for Docker
- The auto-update script can install missing prerequisites automatically

#### macOS
- Docker Desktop for Mac
- `open` command (pre-installed)
- The auto-update script can install missing prerequisites via Homebrew

#### Windows
- Docker Desktop for Windows
- Windows PowerShell or Command Prompt
- Optional: WSL2 for better Docker performance
- The setup script can install missing prerequisites via winget or chocolatey

## Startup Process Timeline

1. **Initialization** (5-10 seconds)
   - Prerequisites check
   - Dependency installation (if needed)
   - Directory setup

2. **Container Startup** (30-60 seconds)
   - Elasticsearch startup and cluster formation
   - Backend API server startup
   - Wait for services to be healthy

3. **Frontend Startup** (10-15 seconds)
   - Frontend development server startup
   - Initial compilation

4. **Ready to Use**
   - Total startup time: 1-2 minutes
   - All services running and monitored

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Check what's using the ports (Linux/macOS)
netstat -tulpn | grep -E ':5173|:3001|:9200'

# Kill processes using the ports (Linux/macOS)
sudo lsof -ti:5173,3001,9200 | xargs kill -9

# Check what's using the ports (Windows)
netstat -ano | findstr ":5173"
netstat -ano | findstr ":3001"
netstat -ano | findstr ":9200"

# Kill process by PID (Windows)
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

#### Docker Daemon Not Running
- **Windows/macOS**: Start Docker Desktop application
- **Linux**: `sudo systemctl start docker`

#### Permission Issues (Linux)
```bash
# Fix elasticsearch data directory permissions
sudo chown -R 1000:1000 elasticsearch_data
chmod 777 elasticsearch_data

# Add user to docker group
sudo usermod -aG docker $USER
# Log out and back in
```

#### Frontend Not Starting
```bash
# Clear node_modules and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install

# Check for port conflicts
netstat -tulpn | grep 5173
```

#### Memory Issues
```bash
# Increase Docker memory limit (Docker Desktop)
# Settings -> Resources -> Memory (recommend 4GB+)

# Check available memory (Linux)
free -h

# Check available memory (macOS)
vm_stat

# Check available memory (Windows)
systeminfo | findstr Memory
```

### Debug Mode

**View Container Logs:**
```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f elasticsearch
docker compose logs -f backend

# View last 100 lines
docker compose logs --tail=100
```

**Check Service Health:**
```bash
# Check Elasticsearch
curl http://localhost:9200/_cluster/health

# Check Backend API
curl http://localhost:3001/health

# Check Frontend
curl http://localhost:5173
```

### Manual Recovery

If automatic startup fails:

```bash
# Stop everything
docker compose down

# Remove volumes (nuclear option - will delete indexed data)
docker compose down -v

# Rebuild everything
docker compose build --no-cache

# Start manually
docker compose up
```

## Development Workflow

For active development:

```bash
# Terminal 1: Start Docker services
docker compose up

# Terminal 2: Start frontend with hot reload
cd frontend
npm run dev

# Make changes to code - hot reload will update automatically
```

## Performance Tips

1. **Allocate adequate resources**: 4GB+ RAM, 2+ CPU cores for Docker
2. **Use SSD storage**: For better Elasticsearch performance
3. **Limit file watching**: The watchdog excludes hidden directories automatically
4. **Monitor system resources**: Watch CPU/memory usage during indexing
5. **Use auto-update scripts**: They handle service monitoring and restart

## Security Notes

- Services run on localhost only (not exposed externally)
- Elasticsearch security is disabled for development (don't use in production)
- Docker containers run with limited privileges
- File access is restricted to your home directory

## Logs

### Auto-Update Script Logs
- **Location**: `auto-update.log` in project root
- **Contents**: Timestamped log of all operations
- **Rotation**: Manual (delete file to reset)

### Docker Container Logs
```bash
# View in real-time
docker compose logs -f

# Save to file
docker compose logs > docker-logs.txt
```

### Frontend Logs
- Visible in terminal where `npm run dev` is running
- Browser console for runtime errors

## Next Steps

After starting the application:

1. Open http://localhost:5173 in your browser
2. The initial indexing will begin automatically
3. Search functionality will be available immediately
4. Results will improve as more files are indexed

For more information, see:
- [Main README](../../README.md) - Project overview
- [File Opening Guide](file-opening.md) - How to open files from search results
- [Filtering Guide](filtering-guide.md) - Advanced search filters
