@echo off
REM Windows Batch File Opener Script
REM Watches for file open commands from the search backend

setlocal enabledelayedexpansion

set COMMAND_DIR=%USERPROFILE%\.file_open_commands

REM Create directory if it doesn't exist
if not exist "%COMMAND_DIR%" (
    mkdir "%COMMAND_DIR%"
    echo Created command directory: %COMMAND_DIR%
)

echo Watching for file open commands in: %COMMAND_DIR%
echo Press Ctrl+C to stop...
echo.

:WATCH_LOOP
REM Check for .cmd files in the directory
for %%f in ("%COMMAND_DIR%\*.cmd") do (
    set CMD_FILE=%%f

    REM Read the file path from the command file
    set /p FILE_PATH=<"!CMD_FILE!"

    if not "!FILE_PATH!"=="" (
        echo Opening file: !FILE_PATH!

        REM Open the file with default application
        if exist "!FILE_PATH!" (
            start "" "!FILE_PATH!"
        ) else (
            echo File not found: !FILE_PATH!
        )

        REM Wait a moment then delete the command file
        timeout /t 1 /nobreak >nul
        del "!CMD_FILE!" 2>nul
    )
)

REM Wait before checking again
timeout /t 1 /nobreak >nul
goto WATCH_LOOP
