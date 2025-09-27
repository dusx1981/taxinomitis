#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
LOGS_DIR="$PARENT_DIR/logs"
PID_FILE="$LOGS_DIR/app.pid"

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        echo "停止应用 (PID: $PID)..."
        kill "$PID"
        sleep 2
        if kill -0 "$PID" 2>/dev/null; then
            echo "应用仍在运行，强制停止..."
            kill -9 "$PID"
        fi
        echo "应用已停止"
        rm "$PID_FILE"
    else
        echo "没有找到运行中的进程 (PID: $PID)"
        rm "$PID_FILE"
    fi
else
    echo "PID 文件不存在: $PID_FILE"
    echo "尝试查找并停止 ts-node 进程..."
    
    # 查找并停止相关的 ts-node 进程
    TS_NODE_PIDS=$(pgrep -f "ts-node.*app.ts")
    if [ -n "$TS_NODE_PIDS" ]; then
        echo "停止进程: $TS_NODE_PIDS"
        kill $TS_NODE_PIDS
        echo "应用已停止"
    else
        echo "没有找到运行中的 ts-node 应用"
    fi
fi