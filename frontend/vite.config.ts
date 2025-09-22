import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { exec } from 'child_process'

// File opener plugin for Vite
function fileOpenerPlugin() {
  return {
    name: 'file-opener',
    configureServer(server: any) {
      server.middlewares.use('/api/open-file', (req: any, res: any, next: any) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const { filePath } = JSON.parse(body);

              if (!filePath) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'File path is required' }));
                return;
              }

              // Determine the platform and use appropriate command
              let command;
              const platform = process.platform;

              if (platform === 'darwin') {
                command = `open "${filePath}"`;
              } else if (platform === 'win32') {
                command = `start "" "${filePath}"`;
              } else {
                command = `xdg-open "${filePath}"`;
              }

              exec(command, (error, stdout, stderr) => {
                res.setHeader('Content-Type', 'application/json');

                if (error) {
                  console.error('Failed to open file:', error);
                  res.statusCode = 500;
                  res.end(JSON.stringify({
                    error: 'Failed to open file',
                    message: error.message
                  }));
                } else {
                  res.statusCode = 200;
                  res.end(JSON.stringify({
                    success: true,
                    message: 'File opened successfully',
                    filePath
                  }));
                }
              });

            } catch (error: any) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Invalid JSON', details: error.message }));
            }
          });
        } else {
          next();
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), fileOpenerPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
})
