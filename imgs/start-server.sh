#!/bin/bash

# 启动自定义HTTP服务器
echo "Starting custom HTTP server on port 9000..."
nohup python3 image_server.py 9000 > server.log 2>&1 &

# 检查服务器是否启动成功
sleep 2
if pgrep -f "image_server.py" > /dev/null; then
    echo "Server started successfully!"
    echo "Logs are being written to server.log"
    echo "Server PID: $(pgrep -f "image_server.py")"
else
    echo "Failed to start server"
    exit 1
fi