#!/bin/sh

# Start the watchdog in the background
node watchdog.js &

# Start the server in the foreground
node server.js
