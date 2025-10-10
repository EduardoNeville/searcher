# Windows PowerShell File Opener Script
# Watches for file open commands from the search backend

$commandDir = Join-Path $env:USERPROFILE ".file_open_commands"

# Create directory if it doesn't exist
if (-not (Test-Path $commandDir)) {
    New-Item -ItemType Directory -Path $commandDir -Force | Out-Null
    Write-Host "Created command directory: $commandDir"
}

Write-Host "Watching for file open commands in: $commandDir"
Write-Host "Press Ctrl+C to stop..."

# Create FileSystemWatcher
$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $commandDir
$watcher.Filter = "*.cmd"
$watcher.IncludeSubdirectories = $false
$watcher.EnableRaisingEvents = $true

# Define the action to take when a file is created
$action = {
    $path = $Event.SourceEventArgs.FullPath
    $name = $Event.SourceEventArgs.Name

    try {
        # Wait a moment to ensure file is fully written
        Start-Sleep -Milliseconds 100

        # Read the file path from the command file
        $filePath = Get-Content -Path $path -Raw -ErrorAction Stop
        $filePath = $filePath.Trim()

        if ([string]::IsNullOrWhiteSpace($filePath)) {
            Write-Host "Empty command file: $name" -ForegroundColor Yellow
            Remove-Item -Path $path -Force -ErrorAction SilentlyContinue
            return
        }

        Write-Host "Opening file: $filePath" -ForegroundColor Green

        # Open the file with default application
        if (Test-Path $filePath) {
            Start-Process -FilePath $filePath -ErrorAction Stop
        } else {
            Write-Host "File not found: $filePath" -ForegroundColor Red
        }

        # Clean up the command file
        Start-Sleep -Milliseconds 200
        Remove-Item -Path $path -Force -ErrorAction SilentlyContinue

    } catch {
        Write-Host "Error processing $name : $_" -ForegroundColor Red
        # Try to clean up even if there was an error
        Remove-Item -Path $path -Force -ErrorAction SilentlyContinue
    }
}

# Register the event
$created = Register-ObjectEvent -InputObject $watcher -EventName Created -Action $action

try {
    # Keep script running
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    # Cleanup on exit
    Unregister-Event -SourceIdentifier $created.Name
    $watcher.Dispose()
    Write-Host "`nFile opener stopped."
}
