# Cross-Platform File Opening from Docker Container

This document explains how to set up file opening functionality when the backend is running inside a Docker container but you want to open files on your host machine across different operating systems (Linux, macOS, Windows).

## The Problem

The search backend runs inside a Docker container, but when you click "Open File" in the frontend, you want the file to open on your host machine (your desktop), not inside the container. This needs to work consistently across different operating systems.

## The Solution

The backend detects your operating system and creates multiple platform-specific executable files in a shared directory that your host machine monitors and executes using the appropriate method for your OS.

## Setup Instructions

### Linux

#### Option 1: Bash Script (Recommended for Linux)
```bash
cd /path/to/searcher
./host-file-opener.sh
```

#### Option 2: Node.js Watcher (Cross-platform)
```bash
cd /path/to/searcher
node file-open-watcher.js
```

### macOS

#### Option 1: macOS-specific Bash Script (Recommended for macOS)
```bash
cd /path/to/searcher
./host-file-opener-mac.sh
```

#### Option 2: Node.js Watcher (Cross-platform)
```bash
cd /path/to/searcher
node file-open-watcher.js
```

### Windows

#### Option 1: PowerShell Script (Recommended for Windows)
```powershell
cd C:\path\to\searcher
.\host-file-opener.ps1
```

#### Option 2: Batch Script (Windows Command Prompt)
```cmd
cd C:\path\to\searcher
host-file-opener.bat
```

#### Option 3: Node.js Watcher (Cross-platform, requires Node.js)
```cmd
cd C:\path\to\searcher
node file-open-watcher.js
```

## Prerequisites by Platform

### All Platforms
- Docker Desktop or Docker Engine installed
- The searcher project running in Docker containers

### Linux
- `xdg-open` (usually pre-installed)
- Alternative: `gnome-open` on GNOME systems

### macOS
- `open` command (pre-installed with macOS)
- Optional: PowerShell Core (`pwsh`) for PowerShell script compatibility

### Windows
- **Windows 10/11**: File opening works out of the box
- **WSL Support**: If you have WSL installed, shell scripts can be executed
- **PowerShell**: Windows PowerShell (built-in) or PowerShell Core
- **Node.js**: For the Node.js watcher option

## How It Works

1. **OS Detection**: The backend detects your operating system from the browser User-Agent
2. **User Action**: You click "Open File" in the frontend
3. **Multi-Platform Commands**: The backend creates multiple command files for different platforms:
   - `~/.file_open_commands/open_TIMESTAMP.sh` - Linux/Unix shell script
   - `~/.file_open_commands/open_TIMESTAMP_mac.sh` - macOS-specific script
   - `~/.file_open_commands/open_TIMESTAMP.bat` - Windows batch file
   - `~/.file_open_commands/open_TIMESTAMP.ps1` - Windows PowerShell script
   - `~/.file_open_commands/open_request.json` - Metadata with OS info
4. **Host Monitoring**: Your platform-specific host watcher detects the new files
5. **Smart Execution**: The watcher executes the appropriate command for your OS:
   - **Linux**: `xdg-open` or `gnome-open`
   - **macOS**: `open`
   - **Windows**: `start`, PowerShell `Start-Process`, or batch execution
   - **WSL**: Shell scripts via WSL on Windows
6. **Cleanup**: Scripts automatically delete themselves after execution

## Directory Structure

```
~/.file_open_commands/
├── open_1634567890123.sh    # Auto-generated executable scripts
├── open_1634567891456.sh
└── open_request.json         # Latest request metadata
```

## Troubleshooting

### File Not Opening
- Make sure the host file opener is running
- Check that the `~/.file_open_commands` directory exists and is writable
- Verify the file path is accessible on your host machine

### Permission Issues
```bash
# Make sure the scripts are executable
chmod +x ~/Desktop/Activities/search_lab/searcher/host-file-opener.sh
chmod +x ~/Desktop/Activities/search_lab/searcher/file-open-watcher.js
```

### Path Issues
- The backend validates that file paths start with `/home/eduardoneville/`
- Make sure your indexed files are in your home directory or subdirectories

## Cross-Platform Support

The file opening works on:
- **Linux**: Uses `xdg-open`
- **macOS**: Uses `open`
- **Windows/WSL**: Uses `cmd.exe /c start`

## Security Notes

- Only files within `/home/eduardoneville/` can be opened
- Command files are automatically deleted after execution
- The system validates file paths before creating open commands

## Manual Usage

You can also manually trigger file opening by creating a command file:

```bash
# Create a command file
cat > ~/.file_open_commands/open_manual.sh << 'EOF'
#!/bin/bash
xdg-open "/home/eduardoneville/path/to/your/file.pdf" &
sleep 2
rm -f ~/.file_open_commands/open_manual.sh
EOF

chmod +x ~/.file_open_commands/open_manual.sh
```

## Stopping the File Opener

Press `Ctrl+C` in the terminal where the file opener is running.
