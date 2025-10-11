# Windows Auto-Update Script for Document Search Application
# Run this script with: powershell -ExecutionPolicy Bypass -File auto-update.ps1

param(
    [int]$CheckInterval = 30  # Check for updates every N minutes (default: 30)
)

################################################################################
# Auto-Update Script for Document Search Application (Windows)
#
# This script:
# - Runs the application via docker compose and npm run dev
# - Periodically checks for git repository updates
# - Automatically rebuilds containers and frontend when changes are detected
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File auto-update.ps1 [CheckInterval]
#
# Options:
#   CheckInterval: Check for updates every N minutes (default: 30)
################################################################################

# Script configuration
$Script:ScriptDir = $PSScriptRoot
$Script:LogFile = Join-Path $ScriptDir "auto-update.log"
$Script:PidFile = Join-Path $ScriptDir ".auto-update.pid"
$Script:FrontendProcess = $null
$Script:IsShuttingDown = $false

# Helper functions
function Write-Log {
    param([string]$Message, [string]$Level = "Info")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"

    switch ($Level) {
        "Success" {
            Write-Host "[$timestamp] ✓ $Message" -ForegroundColor Green
            Add-Content -Path $Script:LogFile -Value $logMessage
        }
        "Error" {
            Write-Host "[$timestamp] ✗ $Message" -ForegroundColor Red
            Add-Content -Path $Script:LogFile -Value $logMessage
        }
        "Warning" {
            Write-Host "[$timestamp] ⚠ $Message" -ForegroundColor Yellow
            Add-Content -Path $Script:LogFile -Value $logMessage
        }
        default {
            Write-Host "[$timestamp] $Message" -ForegroundColor Cyan
            Add-Content -Path $Script:LogFile -Value $logMessage
        }
    }
}

function Test-Command {
    param([string]$Command)
    $null = Get-Command $Command -ErrorAction SilentlyContinue
    return $?
}

function Test-Prerequisites {
    Write-Log "Checking prerequisites..." "Info"
    $allGood = $true

    # Check for Git
    if (Test-Command "git") {
        $gitVersion = git --version
        Write-Log "Git: $gitVersion" "Success"
    } else {
        Write-Log "Git is not installed" "Error"
        $allGood = $false
    }

    # Check for Docker
    if (Test-Command "docker") {
        $dockerVersion = docker --version 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Log "Docker: $dockerVersion" "Success"

            # Check if Docker daemon is running
            $dockerInfo = docker info 2>$null
            if ($LASTEXITCODE -ne 0) {
                Write-Log "Docker is installed but not running. Please start Docker Desktop." "Error"
                $allGood = $false
            }
        }
    } else {
        Write-Log "Docker is not installed" "Error"
        $allGood = $false
    }

    # Check for Docker Compose
    $composeVersion = docker compose version 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Log "Docker Compose: $composeVersion" "Success"
    } else {
        Write-Log "Docker Compose is not available" "Error"
        $allGood = $false
    }

    # Check for Node.js
    if (Test-Command "node") {
        $nodeVersion = node --version
        Write-Log "Node.js: $nodeVersion" "Success"
    } else {
        Write-Log "Node.js is not installed" "Error"
        $allGood = $false
    }

    # Check for npm
    if (Test-Command "npm") {
        $npmVersion = npm --version
        Write-Log "npm: v$npmVersion" "Success"
    } else {
        Write-Log "npm is not installed" "Error"
        $allGood = $false
    }

    if (-not $allGood) {
        Write-Log "Missing prerequisites. Please run setup-windows.ps1 first." "Error"
        exit 1
    }

    Write-Log "All prerequisites are installed" "Success"
}

function Stop-Application {
    Write-Log "Stopping application..." "Info"

    # Stop frontend dev server
    if ($null -ne $Script:FrontendProcess) {
        try {
            if (-not $Script:FrontendProcess.HasExited) {
                Write-Log "Stopping frontend process (PID: $($Script:FrontendProcess.Id))..." "Info"

                # Try graceful shutdown first
                $Script:FrontendProcess.CloseMainWindow() | Out-Null
                Start-Sleep -Seconds 2

                # Force kill if still running
                if (-not $Script:FrontendProcess.HasExited) {
                    Write-Log "Frontend did not stop gracefully, force killing..." "Warning"
                    Stop-Process -Id $Script:FrontendProcess.Id -Force -ErrorAction SilentlyContinue
                }

                $Script:FrontendProcess = $null
            }
        } catch {
            Write-Log "Error stopping frontend: $_" "Warning"
        }
    }

    # Stop Docker containers
    Push-Location $Script:ScriptDir
    try {
        Write-Log "Stopping Docker containers..." "Info"
        docker compose down 2>&1 | Out-Null
    } catch {
        Write-Log "Error stopping Docker containers: $_" "Warning"
    } finally {
        Pop-Location
    }

    Write-Log "Application stopped" "Success"
}

function Start-Application {
    Write-Log "Starting application..." "Info"

    Push-Location $Script:ScriptDir

    try {
        # Start Docker containers with build
        Write-Log "Starting Docker containers (docker compose up --build -d)..." "Info"
        docker compose up --build -d 2>&1 | Out-String | Add-Content -Path $Script:LogFile

        if ($LASTEXITCODE -ne 0) {
            Write-Log "Failed to start Docker containers" "Error"
            return $false
        }
        Write-Log "Docker containers started" "Success"

        # Install/update frontend dependencies
        $frontendDir = Join-Path $Script:ScriptDir "frontend"
        if (Test-Path $frontendDir) {
            Push-Location $frontendDir

            try {
                Write-Log "Installing/updating frontend dependencies..." "Info"
                npm install 2>&1 | Out-String | Add-Content -Path $Script:LogFile

                if ($LASTEXITCODE -ne 0) {
                    Write-Log "Failed to install frontend dependencies" "Error"
                    Pop-Location
                    return $false
                }

                # Start frontend dev server
                Write-Log "Starting frontend dev server (npm run dev)..." "Info"

                # Create a new process for npm run dev
                $psi = New-Object System.Diagnostics.ProcessStartInfo
                $psi.FileName = "npm"
                $psi.Arguments = "run dev"
                $psi.WorkingDirectory = $frontendDir
                $psi.UseShellExecute = $false
                $psi.RedirectStandardOutput = $true
                $psi.RedirectStandardError = $true
                $psi.CreateNoWindow = $true

                $Script:FrontendProcess = New-Object System.Diagnostics.Process
                $Script:FrontendProcess.StartInfo = $psi

                # Set up logging for output
                $Script:FrontendProcess.add_OutputDataReceived({
                    param($sender, $e)
                    if ($null -ne $e.Data) {
                        Add-Content -Path $Script:LogFile -Value $e.Data
                    }
                })
                $Script:FrontendProcess.add_ErrorDataReceived({
                    param($sender, $e)
                    if ($null -ne $e.Data) {
                        Add-Content -Path $Script:LogFile -Value $e.Data
                    }
                })

                $Script:FrontendProcess.Start() | Out-Null
                $Script:FrontendProcess.BeginOutputReadLine()
                $Script:FrontendProcess.BeginErrorReadLine()

                # Wait a moment and check if it's still running
                Start-Sleep -Seconds 3
                if ($Script:FrontendProcess.HasExited) {
                    Write-Log "Frontend dev server failed to start" "Error"
                    Pop-Location
                    return $false
                }

                Write-Log "Frontend dev server started (PID: $($Script:FrontendProcess.Id))" "Success"
            } finally {
                Pop-Location
            }
        }

        Write-Log "Application started successfully" "Success"
        return $true
    } catch {
        Write-Log "Error starting application: $_" "Error"
        return $false
    } finally {
        Pop-Location
    }
}

function Get-CurrentCommit {
    try {
        $commit = git rev-parse HEAD 2>$null
        return $commit
    } catch {
        return $null
    }
}

function Test-ForUpdates {
    Write-Log "Checking for updates..." "Info"

    try {
        # Fetch latest changes from remote
        git fetch origin 2>&1 | Out-String | Add-Content -Path $Script:LogFile

        if ($LASTEXITCODE -ne 0) {
            Write-Log "Failed to fetch updates from remote" "Warning"
            return $false
        }

        # Get local and remote commit hashes
        $localCommit = git rev-parse HEAD 2>$null
        $remoteCommit = git rev-parse '@{u}' 2>$null

        if ([string]::IsNullOrEmpty($remoteCommit)) {
            Write-Log "Could not determine remote commit (no upstream branch set)" "Warning"
            return $false
        }

        if ($localCommit -ne $remoteCommit) {
            $localShort = $localCommit.Substring(0, 7)
            $remoteShort = $remoteCommit.Substring(0, 7)
            Write-Log "Updates available! Local: $localShort, Remote: $remoteShort" "Success"
            return $true
        } else {
            $commitShort = $localCommit.Substring(0, 7)
            Write-Log "Already up to date ($commitShort)" "Info"
            return $false
        }
    } catch {
        Write-Log "Error checking for updates: $_" "Warning"
        return $false
    }
}

function Update-Application {
    Write-Log "Applying updates (git pull)..." "Info"

    Push-Location $Script:ScriptDir
    try {
        git pull 2>&1 | Out-String | Add-Content -Path $Script:LogFile

        if ($LASTEXITCODE -ne 0) {
            Write-Log "Failed to pull updates" "Error"
            return $false
        }

        Write-Log "Updates applied successfully" "Success"
        return $true
    } catch {
        Write-Log "Error applying updates: $_" "Error"
        return $false
    } finally {
        Pop-Location
    }
}

function Invoke-Cleanup {
    if ($Script:IsShuttingDown) {
        return
    }

    $Script:IsShuttingDown = $true
    Write-Log "Shutting down auto-update script..." "Info"

    Stop-Application

    if (Test-Path $Script:PidFile) {
        Remove-Item $Script:PidFile -Force -ErrorAction SilentlyContinue
    }

    Write-Log "Auto-update script stopped" "Success"
    exit 0
}

# Set up cleanup handler
Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    Invoke-Cleanup
} | Out-Null

# Handle Ctrl+C
[Console]::TreatControlCAsInput = $false
$null = [Console]::CancelKeyPress.AddHandler({
    param($sender, $e)
    $e.Cancel = $true
    Invoke-Cleanup
})

# Main execution
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Auto-Update Script Starting" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Log "Check interval: $CheckInterval minutes" "Info"
Write-Log "Repository: $Script:ScriptDir" "Info"
Write-Log "Log file: $Script:LogFile" "Info"
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if script is already running
if (Test-Path $Script:PidFile) {
    $oldPid = Get-Content $Script:PidFile -ErrorAction SilentlyContinue
    $process = Get-Process -Id $oldPid -ErrorAction SilentlyContinue

    if ($null -ne $process) {
        Write-Log "Auto-update script is already running (PID: $oldPid)" "Error"
        exit 1
    } else {
        Remove-Item $Script:PidFile -Force -ErrorAction SilentlyContinue
    }
}

# Save current PID
$PID | Out-File -FilePath $Script:PidFile -NoNewline

# Check prerequisites
Test-Prerequisites

# Verify we're in a git repository
Push-Location $Script:ScriptDir
$isGitRepo = Test-Path ".git"
Pop-Location

if (-not $isGitRepo) {
    Write-Log "Not a git repository. Please run this script from the project root." "Error"
    exit 1
}

# Initial start
$initialCommit = Get-CurrentCommit
if ($null -ne $initialCommit) {
    $commitShort = $initialCommit.Substring(0, 7)
    Write-Log "Current commit: $commitShort" "Info"
}

if (-not (Start-Application)) {
    Write-Log "Failed to start application on initial launch" "Error"
    exit 1
}

Write-Log "Application is running" "Success"
Write-Log "Frontend: http://localhost:5173" "Info"
Write-Log "Backend: http://localhost:3001" "Info"
Write-Log "Elasticsearch: http://localhost:9200" "Info"
Write-Host ""
Write-Log "Monitoring for updates every $CheckInterval minutes..." "Info"
Write-Log "Press Ctrl+C to stop" "Info"

# Main loop
$iteration = 0
while (-not $Script:IsShuttingDown) {
    try {
        # Sleep for the check interval
        Start-Sleep -Seconds ($CheckInterval * 60)

        $iteration++
        Write-Host ""
        Write-Host "==========================================" -ForegroundColor Cyan
        Write-Log "Update check #$iteration" "Info"

        # Check for updates
        if (Test-ForUpdates) {
            Write-Log "Updates detected, beginning update process..." "Info"

            # Stop the application
            if (-not (Stop-Application)) {
                Write-Log "Failed to stop application, skipping update" "Error"

                # Try to restart if frontend died
                if ($null -eq $Script:FrontendProcess -or $Script:FrontendProcess.HasExited) {
                    Write-Log "Frontend is not running, attempting restart..." "Warning"
                    Start-Application | Out-Null
                }
                continue
            }

            # Apply updates
            if (-not (Update-Application)) {
                Write-Log "Failed to apply updates, attempting to restart with old version..." "Error"
                Start-Application | Out-Null
                continue
            }

            # Start the application
            if (-not (Start-Application)) {
                Write-Log "Failed to start application after update" "Error"
                continue
            }

            $newCommit = Get-CurrentCommit
            if ($null -ne $newCommit) {
                $commitShort = $newCommit.Substring(0, 7)
                Write-Host "==========================================" -ForegroundColor Green
                Write-Log "Update complete! Now running commit: $commitShort" "Success"
                Write-Host "==========================================" -ForegroundColor Green
            }
        } else {
            # Verify frontend is still running
            if ($null -ne $Script:FrontendProcess -and $Script:FrontendProcess.HasExited) {
                Write-Log "Frontend stopped unexpectedly, restarting..." "Warning"
                Start-Application | Out-Null
            }
        }
    } catch {
        Write-Log "Error in main loop: $_" "Error"
        Start-Sleep -Seconds 10
    }
}
