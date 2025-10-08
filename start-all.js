#!/usr/bin/env node

/**
 * Cross-Platform Searcher Application Launcher
 *
 * This script orchestrates the entire search application stack:
 * - Docker containers (Elasticsearch, Backend, Frontend)
 * - File system watchdog
 * - Host file opener for cross-platform file opening
 *
 * Usage: node start-all.js [options]
 * Options:
 *   --dev          Start in development mode
 *   --build        Force rebuild containers
 *   --no-watchdog  Skip starting the watchdog
 *   --no-opener    Skip starting the file opener
 *   --help         Show help
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class SearcherLauncher {
  constructor() {
    this.platform = process.platform;
    this.processes = new Map();
    this.isShuttingDown = false;
    this.projectRoot = __dirname;

    // Parse command line arguments
    this.options = this.parseArguments();

    // Setup signal handlers for graceful shutdown
    this.setupSignalHandlers();

    console.log('🚀 Searcher Application Launcher');
    console.log(`📱 Platform: ${this.platform}`);
    console.log(`📁 Project Root: ${this.projectRoot}`);
    console.log(`📂 Mount Directory: ${this.options.mountDir}`);
    console.log('');
  }

  parseArguments() {
    const args = process.argv.slice(2);
    const options = {
      dev: false,
      build: false,
      watchdog: true,
      opener: true,
      help: false,
      mountDir: os.homedir()  // Default to user's home directory
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      switch (arg) {
        case '--dev':
          options.dev = true;
          break;
        case '--build':
          options.build = true;
          break;
        case '--no-watchdog':
          options.watchdog = false;
          break;
        case '--no-opener':
          options.opener = false;
          break;
        case '--mount-dir':
          if (i + 1 < args.length) {
            options.mountDir = path.resolve(args[i + 1]);
            i++; // Skip next argument
          } else {
            throw new Error('--mount-dir requires a directory path');
          }
          break;
        case '--help':
          options.help = true;
          break;
      }
    }

    return options;
  }

  showHelp() {
    console.log(`
Cross-Platform Searcher Application Launcher

Usage: node start-all.js [options]

Options:
  --dev                Start in development mode (rebuilds containers)
  --build              Force rebuild containers
  --mount-dir <path>   Directory to mount and index (default: home directory)
  --no-watchdog        Skip starting the file system watchdog
  --no-opener          Skip starting the host file opener
  --help               Show this help message

Examples:
  node start-all.js                                    # Start everything
  node start-all.js --dev                              # Development mode
  node start-all.js --mount-dir ~/Documents            # Index Documents folder
  node start-all.js --mount-dir /path/to/project       # Index specific directory
  node start-all.js --no-watchdog                      # Skip watchdog
  node start-all.js --build                            # Force rebuild

The script will:
1. Check for required dependencies (Docker, Node.js)
2. Start Docker containers (Elasticsearch, Backend, Frontend)
3. Start the file system watchdog
4. Start the appropriate host file opener for your platform
5. Monitor all processes and provide a unified interface

Press Ctrl+C to gracefully shutdown all services.
`);
  }

  async start() {
    if (this.options.help) {
      this.showHelp();
      return;
    }

    try {
      console.log('🔍 Pre-flight checks...');

      // Validate mount directory
      if (!fs.existsSync(this.options.mountDir)) {
        throw new Error(`Mount directory does not exist: ${this.options.mountDir}`);
      }
      if (!fs.statSync(this.options.mountDir).isDirectory()) {
        throw new Error(`Mount path is not a directory: ${this.options.mountDir}`);
      }

      await this.checkDependencies();

      console.log('📦 Setting up containers...');
      await this.setupContainers();

      console.log('🐳 Starting Docker containers...');
      await this.startDockerContainers();

      if (this.options.watchdog) {
        console.log('🐕 Starting file system watchdog...');
        await this.startWatchdog();
      }

      if (this.options.opener) {
        console.log('📂 Starting host file opener...');
        await this.startFileOpener();
      }

      console.log('✅ All services started successfully!');
      console.log('');
      this.showStatus();
      this.showInstructions();

      // Keep the process alive
      await this.keepAlive();

    } catch (error) {
      console.error('❌ Failed to start application:', error.message);
      await this.shutdown();
      process.exit(1);
    }
  }

  async checkDependencies() {
    const checks = [
      { name: 'Node.js', command: 'node --version', required: true },
      { name: 'Docker', command: 'docker --version', required: true },
      { name: 'Docker Compose', command: 'docker-compose --version', required: true }
    ];

    for (const check of checks) {
      try {
        await this.execAsync(check.command);
        console.log(`  ✅ ${check.name} found`);
      } catch (error) {
        if (check.required) {
          throw new Error(`${check.name} is required but not found. Please install it.`);
        } else {
          console.log(`  ⚠️  ${check.name} not found (optional)`);
        }
      }
    }
  }

  async setupContainers() {
    // Ensure elasticsearch data directory exists
    const elasticsearchDir = path.join(this.projectRoot, 'elasticsearch_data');
    if (!fs.existsSync(elasticsearchDir)) {
      fs.mkdirSync(elasticsearchDir, { recursive: true });
      console.log('  📁 Created elasticsearch_data directory');
    }

    // Set proper permissions on Unix-like systems
    if (this.platform !== 'win32') {
      try {
        await this.execAsync(`chmod 777 "${elasticsearchDir}"`);
        console.log('  🔒 Set elasticsearch data permissions');
      } catch (error) {
        console.warn('  ⚠️  Could not set elasticsearch permissions:', error.message);
      }
    }

    // Install backend dependencies if needed
    const backendNodeModules = path.join(this.projectRoot, 'backend', 'node_modules');
    if (!fs.existsSync(backendNodeModules)) {
      console.log('  📦 Installing backend dependencies...');
      await this.execAsync('npm install', { cwd: path.join(this.projectRoot, 'backend') });
    }

    // Install frontend dependencies if needed
    const frontendNodeModules = path.join(this.projectRoot, 'frontend', 'node_modules');
    if (!fs.existsSync(frontendNodeModules)) {
      console.log('  📦 Installing frontend dependencies...');
      await this.execAsync('npm install', { cwd: path.join(this.projectRoot, 'frontend') });
    }
  }

  async startDockerContainers() {
    const dockerComposeFile = path.join(this.projectRoot, 'docker-compose.yml');

    if (!fs.existsSync(dockerComposeFile)) {
      throw new Error('docker-compose.yml not found in project root');
    }

    // Set environment variables for Docker Compose
    const env = {
      ...process.env,
      MOUNT_DIR: this.options.mountDir,
      FILE_COMMANDS_DIR: path.join(os.homedir(), '.file_open_commands')
    };

    // Build containers if requested or in dev mode
    if (this.options.build || this.options.dev) {
      console.log('  🔨 Building containers...');
      await this.execAsync('docker-compose build', { cwd: this.projectRoot, env });
    }

    // Start containers
    console.log('  🚀 Starting containers...');
    const dockerProcess = spawn('docker-compose', ['up'], {
      cwd: this.projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env
    });

    this.processes.set('docker', dockerProcess);

    // Monitor Docker output
    dockerProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\\n').filter(line => line.trim());
      lines.forEach(line => console.log(`🐳 ${line}`));
    });

    dockerProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\\n').filter(line => line.trim());
      lines.forEach(line => console.error(`🐳 ❌ ${line}`));
    });

    dockerProcess.on('close', (code) => {
      if (!this.isShuttingDown) {
        console.error(`🐳 Docker containers exited with code ${code}`);
      }
    });

    // Wait for containers to be ready
    await this.waitForServices();
  }

  async waitForServices() {
    console.log('  ⏳ Waiting for services to be ready...');

    const services = [
      { name: 'Elasticsearch', url: 'http://localhost:9200/_cluster/health', timeout: 60000 },
      { name: 'Backend API', url: 'http://localhost:3001/health', timeout: 30000 },
      { name: 'Frontend', url: 'http://localhost:3000', timeout: 30000 }
    ];

    for (const service of services) {
      await this.waitForService(service.name, service.url, service.timeout);
    }
  }

  async waitForService(name, url, timeout) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // Simple HTTP check (we'll use curl/wget/PowerShell depending on platform)
        await this.checkUrl(url);
        console.log(`    ✅ ${name} is ready`);
        return;
      } catch (error) {
        await this.sleep(2000); // Wait 2 seconds before retry
      }
    }

    throw new Error(`${name} failed to start within ${timeout/1000} seconds`);
  }

  async checkUrl(url) {
    if (this.platform === 'win32') {
      // Use PowerShell on Windows
      await this.execAsync(`powershell -Command "Invoke-WebRequest -Uri '${url}' -UseBasicParsing -TimeoutSec 5"`);
    } else {
      // Use curl on Unix-like systems
      await this.execAsync(`curl -f -s --max-time 5 "${url}"`);
    }
  }

  async startWatchdog() {
    const watchdogScript = path.join(this.projectRoot, 'watchdog.js');

    if (!fs.existsSync(watchdogScript)) {
      console.warn('  ⚠️  Watchdog script not found, skipping');
      return;
    }

    const watchdogProcess = spawn('node', [watchdogScript], {
      cwd: path.join(this.projectRoot, 'backend'),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.processes.set('watchdog', watchdogProcess);

    watchdogProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\\n').filter(line => line.trim());
      lines.forEach(line => console.log(`🐕 ${line}`));
    });

    watchdogProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\\n').filter(line => line.trim());
      lines.forEach(line => console.error(`🐕 ❌ ${line}`));
    });

    watchdogProcess.on('close', (code) => {
      if (!this.isShuttingDown) {
        console.error(`🐕 Watchdog exited with code ${code}`);
      }
    });

    console.log('    ✅ File system watchdog started');
  }

  async startFileOpener() {
    let openerScript, openerArgs;

    // Choose the appropriate file opener for the platform
    if (this.platform === 'win32') {
      // Try PowerShell first, then batch
      const psScript = path.join(this.projectRoot, 'host-file-opener.ps1');
      const batScript = path.join(this.projectRoot, 'host-file-opener.bat');

      if (fs.existsSync(psScript)) {
        openerScript = 'powershell';
        openerArgs = ['-ExecutionPolicy', 'Bypass', '-File', psScript];
      } else if (fs.existsSync(batScript)) {
        openerScript = batScript;
        openerArgs = [];
      }
    } else if (this.platform === 'darwin') {
      // macOS
      const macScript = path.join(this.projectRoot, 'host-file-opener-mac.sh');
      const genericScript = path.join(this.projectRoot, 'host-file-opener.sh');

      if (fs.existsSync(macScript)) {
        openerScript = 'bash';
        openerArgs = [macScript];
      } else if (fs.existsSync(genericScript)) {
        openerScript = 'bash';
        openerArgs = [genericScript];
      }
    } else {
      // Linux and other Unix-like systems
      const genericScript = path.join(this.projectRoot, 'host-file-opener.sh');
      if (fs.existsSync(genericScript)) {
        openerScript = 'bash';
        openerArgs = [genericScript];
      }
    }

    // Fallback to Node.js watcher if no platform-specific script found
    if (!openerScript) {
      const nodeWatcher = path.join(this.projectRoot, 'file-open-watcher.js');
      if (fs.existsSync(nodeWatcher)) {
        openerScript = 'node';
        openerArgs = [nodeWatcher];
      } else {
        console.warn('    ⚠️  No file opener script found for this platform');
        return;
      }
    }

    const openerProcess = spawn(openerScript, openerArgs, {
      cwd: this.projectRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.processes.set('opener', openerProcess);

    openerProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\\n').filter(line => line.trim());
      lines.forEach(line => console.log(`📂 ${line}`));
    });

    openerProcess.stderr.on('data', (data) => {
      const lines = data.toString().split('\\n').filter(line => line.trim());
      lines.forEach(line => console.error(`📂 ❌ ${line}`));
    });

    openerProcess.on('close', (code) => {
      if (!this.isShuttingDown) {
        console.error(`📂 File opener exited with code ${code}`);
      }
    });

    console.log('    ✅ Host file opener started');
  }

  showStatus() {
    console.log('📊 Service Status:');
    console.log('  🐳 Docker Containers: Running');

    if (this.processes.has('watchdog')) {
      console.log('  🐕 File Watchdog: Running');
    }

    if (this.processes.has('opener')) {
      console.log('  📂 File Opener: Running');
    }

    console.log('');
  }

  showInstructions() {
    console.log('🌐 Application URLs:');
    console.log('  Frontend:      http://localhost:3000');
    console.log('  Backend API:   http://localhost:3001');
    console.log('  Elasticsearch: http://localhost:9200');
    console.log('');
    console.log('🎯 Quick Actions:');
    console.log('  • Open your browser to http://localhost:3000 to start searching');
    console.log('  • Files will open automatically on your desktop when clicked');
    console.log('  • The watchdog monitors file changes in your home directory');
    console.log('');
    console.log('🛑 To stop all services, press Ctrl+C');
    console.log('');
  }

  setupSignalHandlers() {
    const signals = ['SIGINT', 'SIGTERM'];

    signals.forEach(signal => {
      process.on(signal, async () => {
        if (!this.isShuttingDown) {
          console.log(`\\n🛑 Received ${signal}, shutting down gracefully...`);
          await this.shutdown();
          process.exit(0);
        }
      });
    });

    process.on('uncaughtException', async (error) => {
      console.error('❌ Uncaught Exception:', error);
      await this.shutdown();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      await this.shutdown();
      process.exit(1);
    });
  }

  async shutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('🧹 Cleaning up processes...');

    // Stop all spawned processes
    for (const [name, process] of this.processes) {
      console.log(`  🛑 Stopping ${name}...`);

      if (!process.killed) {
        process.kill('SIGTERM');

        // Give processes time to shutdown gracefully
        await this.sleep(2000);

        if (!process.killed) {
          console.log(`    💀 Force killing ${name}...`);
          process.kill('SIGKILL');
        }
      }
    }

    // Stop Docker containers
    if (this.processes.has('docker')) {
      console.log('  🐳 Stopping Docker containers...');
      try {
        await this.execAsync('docker-compose down', { cwd: this.projectRoot });
      } catch (error) {
        console.warn('    ⚠️  Could not stop Docker containers gracefully');
      }
    }

    console.log('✅ Cleanup completed');
  }

  async keepAlive() {
    // Keep the main process alive
    return new Promise((resolve) => {
      // This will keep running until interrupted
      const keepAliveInterval = setInterval(() => {
        if (this.isShuttingDown) {
          clearInterval(keepAliveInterval);
          resolve();
        }
      }, 1000);
    });
  }

  // Helper methods
  execAsync(command, options = {}) {
    return new Promise((resolve, reject) => {
      exec(command, options, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Start the application if this file is run directly
if (require.main === module) {
  const launcher = new SearcherLauncher();
  launcher.start().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = SearcherLauncher;
