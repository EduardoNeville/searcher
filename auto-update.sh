#!/bin/bash

################################################################################
# Auto-Update Script for Document Search Application
#
# This script:
# - Runs the application via docker compose and npm run dev
# - Periodically checks for git repository updates
# - Automatically rebuilds containers and frontend when changes are detected
#
# Usage:
#   ./auto-update.sh [check_interval_minutes]
#
# Default check interval: 30 minutes
################################################################################

set -e

# Configuration
CHECK_INTERVAL=${1:-30}  # Check for updates every N minutes (default: 30)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="$SCRIPT_DIR/auto-update.log"
PID_FILE="$SCRIPT_DIR/.auto-update.pid"
FRONTEND_PID=""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} ✓ $1" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} ⚠ $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} ✗ $1" | tee -a "$LOG_FILE"
}

# Cleanup function
cleanup() {
    log "Shutting down auto-update script..."

    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        log "Stopping frontend (PID: $FRONTEND_PID)..."
        kill -TERM "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
    fi

    # Stop Docker containers
    log "Stopping Docker containers..."
    cd "$SCRIPT_DIR"
    docker compose down 2>/dev/null || true

    rm -f "$PID_FILE"
    log_success "Auto-update script stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

# Check if script is already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        log_error "Auto-update script is already running (PID: $OLD_PID)"
        exit 1
    else
        rm -f "$PID_FILE"
    fi
fi

# Save current PID
echo $$ > "$PID_FILE"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to install prerequisites
install_prerequisites() {
    log "Checking prerequisites..."
    local needs_install=false
    local missing_packages=()

    # Check for git
    if ! command_exists git; then
        log_warning "Git is not installed"
        missing_packages+=("git")
        needs_install=true
    else
        log_success "Git: $(git --version)"
    fi

    # Check for docker
    if ! command_exists docker; then
        log_warning "Docker is not installed"
        missing_packages+=("docker")
        needs_install=true
    else
        log_success "Docker: $(docker --version)"

        # Check if Docker daemon is running
        if ! docker info >/dev/null 2>&1; then
            log_error "Docker is installed but not running. Please start Docker and try again."
            exit 1
        fi
    fi

    # Check for docker compose (v2) or docker-compose (v1)
    if ! docker compose version >/dev/null 2>&1 && ! command_exists docker-compose; then
        log_warning "Docker Compose is not installed"
        missing_packages+=("docker-compose")
        needs_install=true
    else
        if docker compose version >/dev/null 2>&1; then
            log_success "Docker Compose: $(docker compose version)"
        else
            log_success "Docker Compose: $(docker-compose --version)"
        fi
    fi

    # Check for Node.js
    if ! command_exists node; then
        log_warning "Node.js is not installed"
        missing_packages+=("nodejs")
        needs_install=true
    else
        log_success "Node.js: $(node --version)"
    fi

    # Check for npm
    if ! command_exists npm; then
        log_warning "npm is not installed"
        missing_packages+=("npm")
        needs_install=true
    else
        log_success "npm: $(npm --version)"
    fi

    # If packages are missing, attempt to install them
    if [ "$needs_install" = true ]; then
        log_warning "Missing packages: ${missing_packages[*]}"
        log "Attempting to install missing packages..."

        # Detect OS and package manager
        if command_exists apt-get; then
            # Debian/Ubuntu
            log "Detected Debian/Ubuntu system, using apt-get..."

            log "Updating package lists..."
            sudo apt-get update || { log_error "Failed to update package lists"; exit 1; }

            for package in "${missing_packages[@]}"; do
                case "$package" in
                    "git")
                        log "Installing Git..."
                        sudo apt-get install -y git || { log_error "Failed to install Git"; exit 1; }
                        ;;
                    "docker")
                        log "Installing Docker..."
                        log "Adding Docker's official GPG key and repository..."
                        sudo apt-get install -y ca-certificates curl gnupg
                        sudo install -m 0755 -d /etc/apt/keyrings
                        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
                        sudo chmod a+r /etc/apt/keyrings/docker.gpg
                        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
                        sudo apt-get update
                        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || { log_error "Failed to install Docker"; exit 1; }

                        # Add current user to docker group
                        sudo usermod -aG docker "$USER"
                        log_warning "You've been added to the docker group. You may need to log out and back in for this to take effect."
                        ;;
                    "docker-compose")
                        # Docker Compose plugin should be installed with Docker
                        log "Docker Compose plugin will be installed with Docker..."
                        ;;
                    "nodejs"|"npm")
                        log "Installing Node.js and npm..."
                        # Install NodeSource repository for latest LTS
                        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
                        sudo apt-get install -y nodejs || { log_error "Failed to install Node.js"; exit 1; }
                        ;;
                esac
            done

        elif command_exists yum; then
            # RHEL/CentOS/Fedora
            log "Detected RHEL/CentOS/Fedora system, using yum..."

            for package in "${missing_packages[@]}"; do
                case "$package" in
                    "git")
                        sudo yum install -y git || { log_error "Failed to install Git"; exit 1; }
                        ;;
                    "docker")
                        sudo yum install -y yum-utils
                        sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
                        sudo yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || { log_error "Failed to install Docker"; exit 1; }
                        sudo systemctl start docker
                        sudo systemctl enable docker
                        sudo usermod -aG docker "$USER"
                        ;;
                    "nodejs"|"npm")
                        curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
                        sudo yum install -y nodejs || { log_error "Failed to install Node.js"; exit 1; }
                        ;;
                esac
            done

        elif [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            log "Detected macOS..."

            # Check if Homebrew is installed, if not install it
            if ! command_exists brew; then
                log "Homebrew is not installed. Installing Homebrew..."
                log "This will require your password and may take a few minutes..."

                # Install Homebrew
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" || {
                    log_error "Failed to install Homebrew"
                    exit 1
                }

                # Add Homebrew to PATH for the current session
                if [[ -f "/opt/homebrew/bin/brew" ]]; then
                    # Apple Silicon Mac
                    eval "$(/opt/homebrew/bin/brew shellenv)"
                elif [[ -f "/usr/local/bin/brew" ]]; then
                    # Intel Mac
                    eval "$(/usr/local/bin/brew shellenv)"
                fi

                log_success "Homebrew installed successfully"
            else
                log_success "Homebrew is already installed"
            fi

            # Now install missing packages using Homebrew
            for package in "${missing_packages[@]}"; do
                case "$package" in
                    "git")
                        log "Installing Git..."
                        brew install git || { log_error "Failed to install Git"; exit 1; }
                        ;;
                    "docker")
                        log_warning "Docker Desktop for Mac requires manual installation"
                        log_error "Please install Docker Desktop for Mac from https://www.docker.com/products/docker-desktop"
                        log_error "After installing Docker Desktop, restart this script."
                        exit 1
                        ;;
                    "nodejs"|"npm")
                        log "Installing Node.js..."
                        brew install node || { log_error "Failed to install Node.js"; exit 1; }
                        ;;
                esac
            done

        else
            log_error "Could not detect package manager. Please install the following packages manually:"
            log_error "  - ${missing_packages[*]}"
            log_error ""
            log_error "Installation instructions:"
            log_error "  Git: https://git-scm.com/downloads"
            log_error "  Docker: https://docs.docker.com/get-docker/"
            log_error "  Node.js: https://nodejs.org/"
            exit 1
        fi

        log_success "All prerequisites installed successfully!"
        log_warning "Note: If Docker was just installed, you may need to log out and back in for permissions to take effect."
        log_warning "Or run: newgrp docker"
    else
        log_success "All prerequisites are installed"
    fi
}

# Install prerequisites if needed
install_prerequisites

# Verify we're in a git repository
cd "$SCRIPT_DIR"
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    log_error "Not a git repository. Please run this script from the project root."
    exit 1
fi

# Function to get current git commit hash
get_current_commit() {
    git rev-parse HEAD
}

# Function to check for updates
check_for_updates() {
    log "Checking for updates..."

    # Fetch latest changes from remote
    if ! git fetch origin 2>&1 | tee -a "$LOG_FILE"; then
        log_warning "Failed to fetch updates from remote"
        return 1
    fi

    # Get local and remote commit hashes
    LOCAL_COMMIT=$(git rev-parse HEAD)
    REMOTE_COMMIT=$(git rev-parse @{u} 2>/dev/null || echo "")

    if [ -z "$REMOTE_COMMIT" ]; then
        log_warning "Could not determine remote commit (no upstream branch set)"
        return 1
    fi

    if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
        log_success "Updates available! Local: ${LOCAL_COMMIT:0:7}, Remote: ${REMOTE_COMMIT:0:7}"
        return 0
    else
        log "Already up to date (${LOCAL_COMMIT:0:7})"
        return 1
    fi
}

# Function to stop the application
stop_application() {
    log "Stopping application..."

    # Stop frontend dev server
    if [ -n "$FRONTEND_PID" ] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
        kill -TERM "$FRONTEND_PID" 2>/dev/null || true

        # Wait for process to stop (max 10 seconds)
        for i in {1..10}; do
            if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
                break
            fi
            sleep 1
        done

        # Force kill if still running
        if kill -0 "$FRONTEND_PID" 2>/dev/null; then
            log_warning "Frontend did not stop gracefully, force killing..."
            kill -KILL "$FRONTEND_PID" 2>/dev/null || true
        fi
    fi

    # Stop Docker containers
    cd "$SCRIPT_DIR"
    docker compose down 2>&1 | tee -a "$LOG_FILE" || true

    log_success "Application stopped"
}

# Function to apply updates
apply_updates() {
    log "Applying updates (git pull)..."

    cd "$SCRIPT_DIR"

    # Pull latest changes
    if ! git pull 2>&1 | tee -a "$LOG_FILE"; then
        log_error "Failed to pull updates"
        return 1
    fi

    log_success "Updates applied successfully"
    return 0
}

# Function to start the application
start_application() {
    log "Starting application..."

    cd "$SCRIPT_DIR"

    # Start Docker containers with build
    log "Starting Docker containers (docker compose up --build -d)..."
    if ! docker compose up --build -d 2>&1 | tee -a "$LOG_FILE"; then
        log_error "Failed to start Docker containers"
        return 1
    fi
    log_success "Docker containers started"

    # Install frontend dependencies if needed
    if [ -d "$SCRIPT_DIR/frontend" ]; then
        cd "$SCRIPT_DIR/frontend"

        log "Installing/updating frontend dependencies..."
        if ! npm install 2>&1 | tee -a "$LOG_FILE"; then
            log_error "Failed to install frontend dependencies"
            return 1
        fi

        # Start frontend dev server
        log "Starting frontend dev server (npm run dev)..."
        npm run dev >> "$LOG_FILE" 2>&1 &
        FRONTEND_PID=$!

        # Wait a moment and check if it's still running
        sleep 3
        if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
            log_error "Frontend dev server failed to start"
            return 1
        fi

        log_success "Frontend dev server started (PID: $FRONTEND_PID)"
    fi

    cd "$SCRIPT_DIR"
    log_success "Application started successfully"
    return 0
}

# Main execution
log "=========================================="
log "Auto-Update Script Starting"
log "Check interval: $CHECK_INTERVAL minutes"
log "Repository: $SCRIPT_DIR"
log "Log file: $LOG_FILE"
log "=========================================="

# Initial start
INITIAL_COMMIT=$(get_current_commit)
log "Current commit: ${INITIAL_COMMIT:0:7}"

if ! start_application; then
    log_error "Failed to start application on initial launch"
    exit 1
fi

log_success "Application is running"
log "Frontend: http://localhost:5173"
log "Backend: http://localhost:3001"
log "Elasticsearch: http://localhost:9200"
log ""
log "Monitoring for updates every $CHECK_INTERVAL minutes..."
log "Press Ctrl+C to stop"

# Main loop
ITERATION=0
while true; do
    # Sleep for the check interval
    sleep $((CHECK_INTERVAL * 60))

    ITERATION=$((ITERATION + 1))
    log "=========================================="
    log "Update check #$ITERATION"

    # Check for updates
    if check_for_updates; then
        log "Updates detected, beginning update process..."

        # Stop the application
        if ! stop_application; then
            log_error "Failed to stop application, skipping update"
            # Try to restart if it died
            if [ -n "$FRONTEND_PID" ] && ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
                log_warning "Frontend is not running, attempting restart..."
                start_application || true
            fi
            continue
        fi

        # Apply updates
        if ! apply_updates; then
            log_error "Failed to apply updates, attempting to restart with old version..."
            start_application || true
            continue
        fi

        # Start the application
        if ! start_application; then
            log_error "Failed to start application after update"
            continue
        fi

        NEW_COMMIT=$(get_current_commit)
        log_success "=========================================="
        log_success "Update complete! Now running commit: ${NEW_COMMIT:0:7}"
        log_success "=========================================="
    else
        # Verify frontend is still running
        if [ -n "$FRONTEND_PID" ] && ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
            log_warning "Frontend stopped unexpectedly, restarting..."
            start_application || true
        fi
    fi
done
