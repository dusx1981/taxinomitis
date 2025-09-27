#!/bin/bash

if [[ $BASH_SOURCE = */* ]]; then
  cd -- "${BASH_SOURCE%/*}/" || exit
fi

cd ..

PID_FILE="logs/uvicorn.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "Stopping server with PID: $PID"
        kill "$PID"
        sleep 2
        if kill -0 "$PID" 2>/dev/null; then
            echo "Process still running, forcing kill..."
            kill -9 "$PID"
        fi
        echo "Server stopped"
        rm "$PID_FILE"
    else
        echo "No running process found with PID: $PID"
        rm "$PID_FILE"
    fi
else
    echo "PID file not found: $PID_FILE"
    echo "Trying to find and kill processes on port 8000..."
    PORTS_PIDS=$(lsof -ti:8000 2>/dev/null)
    if [ -n "$PORTS_PIDS" ]; then
        echo "Killing processes: $PORTS_PIDS"
        kill $PORTS_PIDS
        echo "Server stopped"
    else
        echo "No server processes found"
    fi
fi