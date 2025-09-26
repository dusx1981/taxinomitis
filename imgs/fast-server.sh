#!/bin/bash
# 简化版服务器控制脚本

PORT=${2:-9000}
PID_FILE="/tmp/fast_image_server_${PORT}.pid"
LOG_FILE="/tmp/fast_image_server_${PORT}.log"
SCRIPT_DIR=$(dirname "$0")

start() {
    echo "启动服务器 (端口: $PORT)..."
    cd "$SCRIPT_DIR"
    nohup python3 fast_image_server.py $PORT > server.log 2>&1 &
    echo $! > $PID_FILE
    echo "服务器已启动 (PID: $!)"
}

stop() {
    if [ -f $PID_FILE ]; then
        PID=$(cat $PID_FILE)
        echo "停止服务器 (PID: $PID)..."
        kill $PID
        rm -f $PID_FILE
        echo "服务器已停止"
    else
        echo "服务器未运行"
    fi
}

status() {
    if [ -f $PID_FILE ] && kill -0 $(cat $PID_FILE) 2>/dev/null; then
        echo " 服务器运行中 (PID: $(cat $PID_FILE), 端口: $PORT)"
    else
        echo " 服务器未运行"
        [ -f $PID_FILE ] && rm -f $PID_FILE
    fi
}

case "$1" in
    start) start ;;
    stop) stop ;;
    restart) stop; sleep 2; start ;;
    status) status ;;
    *) echo "用法: $0 {start|stop|restart|status} [port]" ;;
esac