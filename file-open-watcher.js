#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const chokidar = require('chokidar');

class FileOpenWatcher {
  constructor() {
    // Cross-platform home directory detection
    this.watchDir = this.getWatchDirectory();
    this.platform = process.platform;
    this.init();
  }

  getWatchDirectory() {
    // Cross-platform watch directory
    if (process.platform === 'win32') {
      return path.join(process.env.USERPROFILE || process.env.HOME, '.file_open_commands');
    } else {
      return path.join(process.env.HOME, '.file_open_commands');
    }
  }

  init() {
    console.log('🔍 File Open Watcher starting...');
    console.log(`📁 Watching directory: ${this.watchDir}`);

    // Ensure watch directory exists
    if (!fs.existsSync(this.watchDir)) {
      fs.mkdirSync(this.watchDir, { recursive: true });
      console.log('📁 Created watch directory');
    }

    // Process any existing command files
    this.processExistingCommands();

    // Start watching for new command files
    this.startWatcher();

    console.log('👁️  File Open Watcher is ready!\n');
  }

  processExistingCommands() {
    try {
      const files = fs.readdirSync(this.watchDir);
      const commandFiles = files.filter(file => file.startsWith('open_') && file.endsWith('.sh'));

      if (commandFiles.length > 0) {
        console.log(`🔄 Found ${commandFiles.length} existing command file(s), processing...`);
        commandFiles.forEach(file => {
          const filePath = path.join(this.watchDir, file);
          this.executeCommand(filePath);
        });
      }
    } catch (error) {
      console.error('Error processing existing commands:', error.message);
    }
  }

  startWatcher() {
    const watcher = chokidar.watch(this.watchDir, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    watcher
      .on('add', (filePath) => {
        if (path.basename(filePath).startsWith('open_') && path.extname(filePath) === '.sh') {
          console.log(`📄 New file open command detected: ${path.basename(filePath)}`);
          this.executeCommand(filePath);
        }
      })
      .on('change', (filePath) => {
        if (path.basename(filePath) === 'open_request.json') {
          this.handleNotification(filePath);
        }
      })
      .on('error', (error) => {
        console.error('👁️  Watcher error:', error);
      });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down File Open Watcher...');
      watcher.close();
      process.exit(0);
    });
  }

  executeCommand(commandPath) {
    const fileName = path.basename(commandPath);
    const ext = path.extname(commandPath).toLowerCase();

    try {
      let command, args;

      // Determine execution method based on file type and platform
      if (ext === '.sh') {
        // Shell script
        if (this.platform === 'win32') {
          // Try WSL on Windows
          if (this.isWSLAvailable()) {
            command = 'wsl';
            args = ['bash', commandPath];
          } else {
            console.log(`⚠️  Skipping shell script ${fileName} - WSL not available on Windows`);
            this.cleanupFile(commandPath, fileName);
            return;
          }
        } else {
          // Unix-like systems
          fs.chmodSync(commandPath, 0o755);
          command = 'bash';
          args = [commandPath];
        }
      } else if (ext === '.ps1') {
        // PowerShell script
        if (this.platform === 'win32') {
          command = 'powershell.exe';
          args = ['-ExecutionPolicy', 'Bypass', '-File', commandPath];
        } else if (this.isPowerShellCoreAvailable()) {
          command = 'pwsh';
          args = ['-File', commandPath];
        } else {
          console.log(`⚠️  Skipping PowerShell script ${fileName} - PowerShell not available`);
          this.extractAndOpenFile(commandPath);
          this.cleanupFile(commandPath, fileName);
          return;
        }
      } else if (ext === '.bat') {
        // Batch file
        if (this.platform === 'win32') {
          command = 'cmd.exe';
          args = ['/c', commandPath];
        } else {
          console.log(`⚠️  Skipping batch file ${fileName} - Windows batch files not supported on ${this.platform}`);
          this.extractAndOpenFile(commandPath);
          this.cleanupFile(commandPath, fileName);
          return;
        }
      } else {
        console.log(`❌ Unknown command file type: ${fileName}`);
        this.cleanupFile(commandPath, fileName);
        return;
      }

      // Execute the command
      const childProcess = exec(`${command} ${args.map(arg => `"${arg}"`).join(' ')}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Failed to execute ${fileName}:`, error.message);
          if (stderr) console.error(`   stderr: ${stderr}`);
        } else {
          console.log(`✅ Successfully executed ${fileName}`);
          if (stdout) console.log(`   stdout: ${stdout.trim()}`);
        }

        // Cleanup after execution
        this.cleanupFile(commandPath, fileName);
      });

      // Set a timeout for command execution
      setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill();
          console.log(`⏰ Timeout: Killed ${fileName} after 30 seconds`);
          this.cleanupFile(commandPath, fileName);
        }
      }, 30000);

    } catch (error) {
      console.error(`❌ Error executing command ${fileName}:`, error.message);
      this.cleanupFile(commandPath, fileName);
    }
  }

  isWSLAvailable() {
    try {
      exec('wsl --version', { timeout: 5000 }, (error) => {
        return !error;
      });
      return true;
    } catch {
      return false;
    }
  }

  isPowerShellCoreAvailable() {
    try {
      exec('pwsh --version', { timeout: 5000 }, (error) => {
        return !error;
      });
      return true;
    } catch {
      return false;
    }
  }

  extractAndOpenFile(commandPath) {
    try {
      const content = fs.readFileSync(commandPath, 'utf8');
      let filePath = null;

      // Extract file path from different comment formats
      const patterns = [
        /# File to open: (.+)/,  // Shell/PowerShell
        /REM File to open: (.+)/ // Batch
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          filePath = match[1].trim();
          break;
        }
      }

      if (filePath) {
        console.log(`   Attempting to open file directly: ${path.basename(filePath)}`);
        this.openFileDirectly(filePath);
      }
    } catch (error) {
      console.error('   Failed to extract file path:', error.message);
    }
  }

  openFileDirectly(filePath) {
    let command;

    if (this.platform === 'darwin') {
      command = `open "${filePath}"`;
    } else if (this.platform === 'win32') {
      command = `start "" "${filePath}"`;
    } else {
      command = `xdg-open "${filePath}"`;
    }

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`   ❌ Failed to open file directly:`, error.message);
      } else {
        console.log(`   ✅ Opened file directly with system command`);
      }
    });
  }

  cleanupFile(filePath, fileName) {
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          console.log(`🗑️  Cleaned up ${fileName}`);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }, 3000);
  }

  handleNotification(notificationPath) {
    try {
      const notification = JSON.parse(fs.readFileSync(notificationPath, 'utf8'));
      console.log(`📬 File open request: ${path.basename(notification.filePath)}`);
      console.log(`   Path: ${notification.filePath}`);
      console.log(`   Time: ${notification.timestamp}`);
    } catch (error) {
      // Ignore notification parsing errors
    }
  }
}

// Start the watcher if this file is run directly
if (require.main === module) {
  new FileOpenWatcher();
}

module.exports = FileOpenWatcher;