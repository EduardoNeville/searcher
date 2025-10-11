# Windows Setup Script for Document Search Application
# Run this script with: powershell -ExecutionPolicy Bypass -File setup-windows.ps1

param(
    [string]$SearchHome = $env:USERPROFILE,
    [switch]$AutoInstall = $false
)

################################################################################
# Setup Script for Document Search Application (Windows)
#
# This script:
# - Checks for required prerequisites (Docker, Node.js, Git)
# - Optionally installs missing prerequisites using winget or chocolatey
# - Configures the SEARCH_HOME environment variable
# - Creates necessary directories and configuration files
# - Builds Docker images
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File setup-windows.ps1 [-SearchHome <path>] [-AutoInstall]
#
# Options:
#   -SearchHome: Path to set as SEARCH_HOME (default: user profile)
#   -AutoInstall: Automatically attempt to install missing prerequisites
################################################################################

# Helper functions
function Write-Log {
    param([string]$Message, [string]$Level = "Info")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    switch ($Level) {
        "Success" { Write-Host "[$timestamp] ✓ $Message" -ForegroundColor Green }
        "Error"   { Write-Host "[$timestamp] ✗ $Message" -ForegroundColor Red }
        "Warning" { Write-Host "[$timestamp] ⚠ $Message" -ForegroundColor Yellow }
        default   { Write-Host "[$timestamp] $Message" -ForegroundColor Cyan }
    }
}

function Test-Command {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

function Test-PackageManager {
    $hasWinget = Test-Command "winget"
    $hasChoco = Test-Command "choco"

    if ($hasWinget) {
        return "winget"
    } elseif ($hasChoco) {
        return "chocolatey"
    } else {
        return $null
    }
}

function Install-Prerequisite {
    param(
        [string]$Name,
        [string]$WingetId,
        [string]$ChocoPackage,
        [string]$ManualUrl
    )

    $packageManager = Test-PackageManager

    if ($AutoInstall -and $packageManager) {
        Write-Log "Attempting to install $Name..." "Info"

        try {
            if ($packageManager -eq "winget") {
                Write-Log "Using winget to install $Name..." "Info"
                winget install --id=$WingetId -e --silent --accept-package-agreements --accept-source-agreements
                if ($LASTEXITCODE -eq 0) {
                    Write-Log "$Name installed successfully" "Success"
                    return $true
                }
            } elseif ($packageManager -eq "chocolatey") {
                Write-Log "Using chocolatey to install $Name..." "Info"
                choco install $ChocoPackage -y
                if ($LASTEXITCODE -eq 0) {
                    Write-Log "$Name installed successfully" "Success"
                    return $true
                }
            }
        } catch {
            Write-Log "Failed to install $Name automatically: $_" "Error"
        }
    }

    Write-Log "Please install $Name manually from: $ManualUrl" "Warning"
    return $false
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Document Search - Windows Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Log "Checking prerequisites..." "Info"
$missingPrereqs = @()

# Check for Git
Write-Log "Checking Git installation..." "Info"
if (Test-Command "git") {
    $gitVersion = git --version
    Write-Log "Git found: $gitVersion" "Success"
} else {
    Write-Log "Git is not installed" "Error"
    $missingPrereqs += @{
        Name = "Git"
        WingetId = "Git.Git"
        ChocoPackage = "git"
        ManualUrl = "https://git-scm.com/downloads"
    }
}

# Check for Docker
Write-Log "Checking Docker installation..." "Info"
if (Test-Command "docker") {
    $dockerVersion = docker --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Log "Docker found: $dockerVersion" "Success"

        # Check if Docker daemon is running
        $dockerInfo = docker info 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Log "Docker is installed but not running. Please start Docker Desktop." "Error"
            exit 1
        }
    } else {
        throw "Docker check failed"
    }
} else {
    Write-Log "Docker is not installed" "Error"
    $missingPrereqs += @{
        Name = "Docker Desktop"
        WingetId = "Docker.DockerDesktop"
        ChocoPackage = "docker-desktop"
        ManualUrl = "https://www.docker.com/products/docker-desktop"
    }
}

# Check for Docker Compose
Write-Log "Checking Docker Compose..." "Info"
if (Test-Command "docker") {
    $composeVersion = docker compose version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Log "Docker Compose found: $composeVersion" "Success"
    } else {
        Write-Log "Docker Compose is not available" "Error"
        Write-Log "Docker Compose comes with Docker Desktop. Please ensure it's properly installed." "Warning"
    }
}

# Check for Node.js
Write-Log "Checking Node.js installation..." "Info"
if (Test-Command "node") {
    $nodeVersion = node --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Log "Node.js found: $nodeVersion" "Success"

        # Check npm as well
        if (Test-Command "npm") {
            $npmVersion = npm --version 2>$null
            Write-Log "npm found: v$npmVersion" "Success"
        }
    } else {
        throw "Node.js check failed"
    }
} else {
    Write-Log "Node.js is not installed" "Error"
    $missingPrereqs += @{
        Name = "Node.js"
        WingetId = "OpenJS.NodeJS.LTS"
        ChocoPackage = "nodejs-lts"
        ManualUrl = "https://nodejs.org/"
    }
}

# Handle missing prerequisites
if ($missingPrereqs.Count -gt 0) {
    Write-Host ""
    Write-Log "Missing prerequisites detected:" "Warning"
    foreach ($prereq in $missingPrereqs) {
        Write-Host "  - $($prereq.Name)" -ForegroundColor Yellow
    }
    Write-Host ""

    $packageManager = Test-PackageManager

    if ($AutoInstall) {
        if ($packageManager) {
            Write-Log "Auto-install mode enabled. Installing missing prerequisites using $packageManager..." "Info"
            Write-Host ""

            foreach ($prereq in $missingPrereqs) {
                Install-Prerequisite -Name $prereq.Name -WingetId $prereq.WingetId `
                    -ChocoPackage $prereq.ChocoPackage -ManualUrl $prereq.ManualUrl
            }

            Write-Host ""
            Write-Log "Prerequisites installation complete. Please restart your terminal and run this script again." "Warning"
        } else {
            Write-Log "No package manager found (winget or chocolatey)" "Error"
            Write-Log "Please install prerequisites manually or install winget/chocolatey first" "Warning"
        }
    } else {
        if ($packageManager) {
            Write-Log "You can run this script with -AutoInstall to automatically install missing prerequisites" "Info"
            Write-Host "  Example: powershell -ExecutionPolicy Bypass -File setup-windows.ps1 -AutoInstall" -ForegroundColor White
            Write-Host ""
        }

        Write-Log "Please install the missing prerequisites and run this script again" "Warning"
    }

    exit 1
}

Write-Log "All prerequisites are installed" "Success"
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Configuration" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Set SEARCH_HOME environment variable
Write-Log "Configuring SEARCH_HOME directory..." "Info"
Write-Host "Current SEARCH_HOME: $SearchHome" -ForegroundColor White

$customPath = Read-Host "Enter a different path or press Enter to use default [$SearchHome]"
if (![string]::IsNullOrWhiteSpace($customPath)) {
    $SearchHome = $customPath
}

# Validate the path exists
if (-not (Test-Path $SearchHome)) {
    Write-Log "Directory does not exist: $SearchHome" "Error"
    Write-Log "Creating directory..." "Info"
    try {
        New-Item -ItemType Directory -Path $SearchHome -Force | Out-Null
        Write-Log "Directory created: $SearchHome" "Success"
    } catch {
        Write-Log "Failed to create directory: $_" "Error"
        exit 1
    }
}

Write-Log "SEARCH_HOME set to: $SearchHome" "Success"

# Create .env file for the project
$envContent = "SEARCH_HOME=$SearchHome"
$envFile = Join-Path $PSScriptRoot ".env"
try {
    Set-Content -Path $envFile -Value $envContent -NoNewline -ErrorAction Stop
    Write-Log "Created .env file with SEARCH_HOME configuration" "Success"
} catch {
    Write-Log "Failed to create .env file: $_" "Error"
    exit 1
}

# Create command directory if it doesn't exist
$commandDir = Join-Path $SearchHome ".file_open_commands"
if (-not (Test-Path $commandDir)) {
    try {
        New-Item -ItemType Directory -Path $commandDir -Force | Out-Null
        Write-Log "Created .file_open_commands directory" "Success"
    } catch {
        Write-Log "Failed to create .file_open_commands directory: $_" "Error"
    }
} else {
    Write-Log ".file_open_commands directory already exists" "Success"
}

# Verify git repository
Write-Host ""
Write-Log "Verifying git repository..." "Info"
$gitDir = Join-Path $PSScriptRoot ".git"
if (Test-Path $gitDir) {
    $currentBranch = git rev-parse --abbrev-ref HEAD 2>$null
    $currentCommit = git rev-parse --short HEAD 2>$null
    Write-Log "Git repository found (branch: $currentBranch, commit: $currentCommit)" "Success"
} else {
    Write-Log "Not a git repository - git auto-update features will not be available" "Warning"
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Building Application" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Build Docker images
Write-Log "Building Docker images (this may take several minutes)..." "Info"
docker compose build
if ($LASTEXITCODE -ne 0) {
    Write-Log "Docker build failed" "Error"
    exit 1
}
Write-Log "Docker images built successfully" "Success"

# Install frontend dependencies
Write-Host ""
Write-Log "Installing frontend dependencies..." "Info"
$frontendDir = Join-Path $PSScriptRoot "frontend"
if (Test-Path $frontendDir) {
    Push-Location $frontendDir
    try {
        npm install
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Frontend dependencies installed" "Success"
        } else {
            Write-Log "Failed to install frontend dependencies" "Warning"
        }
    } catch {
        Write-Log "Error installing frontend dependencies: $_" "Warning"
    } finally {
        Pop-Location
    }
} else {
    Write-Log "Frontend directory not found, skipping npm install" "Warning"
}

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Log "To start the application manually, run:" "Success"
Write-Host "  docker compose up -d" -ForegroundColor White
Write-Host "  cd frontend && npm run dev" -ForegroundColor White
Write-Host ""
Write-Log "Or use the auto-update script:" "Success"
Write-Host "  powershell -ExecutionPolicy Bypass -File auto-update.ps1" -ForegroundColor White
Write-Host ""
Write-Log "The application will be available at:" "Info"
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "  Backend:  http://localhost:3001" -ForegroundColor White
Write-Host "  Elasticsearch: http://localhost:9200" -ForegroundColor White
Write-Host ""
