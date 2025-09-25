#!/bin/bash

echo "Stopping custom HTTP server..."
pkill -f "image_server.py"

if [ $? -eq 0 ]; then
    echo "Server stopped successfully"
else
    echo "No server found running or error stopping server"
fi