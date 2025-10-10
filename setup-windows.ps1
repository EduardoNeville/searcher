# Windows Setup Script for Document Search Application
# Run this script with: powershell -ExecutionPolicy Bypass -File setup-windows.ps1

param(
    [string]$SearchHome = $env:USERPROFILE
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Document Search - Windows Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check for Docker
Write-Host "Checking Docker installation..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Docker found: $dockerVersion" -ForegroundColor Green
    } else {
        throw "Docker not found"
    }
} catch {
    Write-Host "✗ Docker is not installed or not running" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Check for Docker Compose
Write-Host "Checking Docker Compose..." -ForegroundColor Yellow
try {
    $composeVersion = docker compose version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Docker Compose found: $composeVersion" -ForegroundColor Green
    } else {
        throw "Docker Compose not found"
    }
} catch {
    Write-Host "✗ Docker Compose is not available" -ForegroundColor Red
    Write-Host "Please ensure Docker Desktop is installed and running" -ForegroundColor Yellow
    exit 1
}

# Check for Node.js
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
    } else {
        throw "Node.js not found"
    }
} catch {
    Write-Host "✗ Node.js is not installed" -ForegroundColor Red
    Write-Host "Please install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Configuration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Set SEARCH_HOME environment variable
Write-Host ""
Write-Host "Setting SEARCH_HOME directory..." -ForegroundColor Yellow
Write-Host "Current SEARCH_HOME: $SearchHome" -ForegroundColor White

$customPath = Read-Host "Enter a different path or press Enter to use default [$SearchHome]"
if (![string]::IsNullOrWhiteSpace($customPath)) {
    $SearchHome = $customPath
}

# Validate the path exists
if (-not (Test-Path $SearchHome)) {
    Write-Host "✗ Directory does not exist: $SearchHome" -ForegroundColor Red
    exit 1
}

Write-Host "✓ SEARCH_HOME set to: $SearchHome" -ForegroundColor Green

# Create .env file for the project
$envContent = "SEARCH_HOME=$SearchHome"
$envFile = Join-Path $PSScriptRoot ".env"
Set-Content -Path $envFile -Value $envContent -NoNewline
Write-Host "✓ Created .env file with SEARCH_HOME configuration" -ForegroundColor Green

# Create command directory if it doesn't exist
$commandDir = Join-Path $SearchHome ".file_open_commands"
if (-not (Test-Path $commandDir)) {
    New-Item -ItemType Directory -Path $commandDir -Force | Out-Null
    Write-Host "✓ Created .file_open_commands directory" -ForegroundColor Green
} else {
    Write-Host "✓ .file_open_commands directory already exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building Application" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Build Docker images
Write-Host "Building Docker images (this may take several minutes)..." -ForegroundColor Yellow
docker compose build
if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Docker build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Docker images built successfully" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the application, run:" -ForegroundColor Green
Write-Host "  node start-all.js" -ForegroundColor White
Write-Host ""
Write-Host "The application will be available at:" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  Backend:  http://localhost:3001" -ForegroundColor White
Write-Host ""
Write-Host "To stop the application, press Ctrl+C in the terminal" -ForegroundColor Yellow
Write-Host ""
