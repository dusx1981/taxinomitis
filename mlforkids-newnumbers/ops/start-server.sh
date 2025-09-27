#!/bin/bash

# allow this script to be run from other locations, despite the
#  relative file paths used in it
if [[ $BASH_SOURCE = */* ]]; then
  cd -- "${BASH_SOURCE%/*}/" || exit
fi

cd ..

# 创建日志目录
mkdir -p logs

# 使用 env 设置环境变量，然后用 nohup 运行
nohup env \
MODE=development \
MPLBACKEND=svg \
MODELS_CACHE_SIZE=3 \
PUBLIC_API_URL=http://127.0.0.1:8000 \
VERIFY_USER=testuser \
VERIFY_PASSWORD=testpass \
uvicorn app.main:app --reload --port 8000 > logs/server.log 2>&1 &

# 显示进程信息
echo "Server started in background with PID: $!"
echo "Logs are being written to: logs/server.log"
echo "You can check the logs with: tail -f logs/server.log"