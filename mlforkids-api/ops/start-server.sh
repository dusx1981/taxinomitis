#!/bin/bash

# 设置脚本所在目录和项目根目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"  # 项目根目录（mlforkids-api）

# 切换到项目根目录（与 VSCode 的 cwd 一致）
cd "$PROJECT_ROOT" || exit

# 创建日志目录（在项目根目录的上一级，即 taxinomitis/logs）
LOGS_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOGS_DIR"

# 设置环境变量（与 VSCode 配置一致）
export NODE_ENV=development
export TS_NODE_PROJECT="$PROJECT_ROOT/tsconfig.json"  # 确保 tsconfig.json 在根目录

# 检查 ts-node 是否可用（优先使用本地安装）
if ! command -v ts-node &> /dev/null; then
    # 如果全局 ts-node 不存在，尝试使用项目本地的 ts-node
    LOCAL_TS_NODE="$PROJECT_ROOT/node_modules/.bin/ts-node"
    if [ -f "$LOCAL_TS_NODE" ]; then
        alias ts-node="$LOCAL_TS_NODE"
    else
        echo "错误: ts-node 未安装。请运行: npm install --save-dev ts-node"
        exit 1
    fi
fi

# 检查源文件是否存在（基于项目根目录的正确路径）
APP_FILE="$PROJECT_ROOT/src/lib/app.ts"
if [ ! -f "$APP_FILE" ]; then
    echo "错误: 找不到文件 $APP_FILE"
    exit 1
fi

# 在后台运行应用
echo "在后台启动 TypeScript 应用..."
echo "工作目录: $PROJECT_ROOT"
echo "入口文件: $APP_FILE"
echo "环境: $NODE_ENV"
echo "日志目录: $LOGS_DIR"
echo "----------------------------------------"

# 使用 nohup 在后台运行（确保工作目录为项目根目录）
nohup ts-node --transpile-only "$APP_FILE" > "$LOGS_DIR/app.log" 2>&1 &
APP_PID=$!

# 保存 PID 到文件
echo $APP_PID > "$LOGS_DIR/app.pid"

echo "应用已启动，PID: $APP_PID"
echo "查看日志: tail -f $LOGS_DIR/app.log"
echo "停止应用: 请使用 stop-server.sh（确保停止脚本也修正了路径）"