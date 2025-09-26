#!/usr/bin/env python3
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import urllib.parse
import os
import sys
from pathlib import Path
import logging
from typing import Optional

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SecureStaticFileServer:
    def __init__(self, root_directory: str):
        self.root_directory = os.path.abspath(root_directory)
        self.app = FastAPI(title="Secure Image Server")
        self.setup_routes()

    def extract_path_from_url(self, url):
        """
        直接从URL中提取路径部分（不进行编码转换）
        """
        parsed = urllib.parse.urlsplit(url)
        return parsed.path
    
    def safe_decode_path(self, path: str) -> str:
        """安全地解码URL路径，处理各种编码情况"""
        try:
            # 先分割查询参数和片段标识符
            # path_only = path.split('?')[0].split('#')[0]
            path_only = self.extract_path_from_url(path)
            # 解码URL编码
            decoded = urllib.parse.quote(path_only, errors='surrogatepass')
            return decoded
        except Exception as e:
            logger.error(f"Path decoding error: {e}")
            return path  # 解码失败时返回原始路径
    
    def has_path_traversal(self, path: str) -> bool:
        """检查路径是否包含遍历攻击尝试"""
        try:
            # 分离路径部分
            path_only = path.split('?')[0].split('#')[0]
            
            # 移除开头的斜杠并规范化路径
            clean_path = os.path.normpath(path_only.lstrip('/'))
            
            # 检查是否尝试访问上级目录
            if (clean_path.startswith('..') or 
                '/../' in clean_path or 
                '\\..\\' in clean_path):
                return True
            
            # 检查绝对路径尝试
            if os.path.isabs(clean_path):
                return True
                
            # 检查其他可疑模式
            suspicious_patterns = ['//', '\\\\', './', '.\\']
            for pattern in suspicious_patterns:
                if pattern in path_only:
                    return True
                    
            return False
        except Exception:
            return True  # 解析失败时保守处理
    
    def full_path(self, path_only: str) -> Optional[Path]:
        """将URL路径转换为安全的文件系统路径"""
        try:
            # 移除开头的斜杠，避免双斜杠
            clean_path = path_only.lstrip('/')
            
            # 直接拼接路径
            full_path = os.path.join(self.root_directory, clean_path)
            
            # 规范化路径（解析..和.等）
            normalized_path = os.path.normpath(full_path)
            
            # 最终安全检查：确保路径在服务器根目录下
            if not normalized_path.startswith(self.root_directory):
                raise PermissionError("Access outside server root directory")
            
            return Path(normalized_path)
            
        except Exception as e:
            logger.error(f"Path translation error: {e}")
            return None
    
    def setup_routes(self):
        """设置FastAPI路由"""
        
        @self.app.get("/{full_path:path}")
        async def serve_file(request: Request, full_path: str):
            """处理所有文件请求"""
            try:       
                # 安全检查
                if self.has_path_traversal(full_path):
                    raise HTTPException(status_code=403, detail="Forbidden: Path traversal detected")
                
                decoded_path = self.safe_decode_path(full_path)         
                
                # 转换路径
                file_path = self.full_path(decoded_path)
                if file_path is None:
                    raise HTTPException(status_code=400, detail="Invalid path")
                
                # 检查文件是否存在且是普通文件（非目录）
                if not file_path.is_file():
                    filename = os.path.basename(str(file_path))
                    raise HTTPException(status_code=404, detail=f"File not found: {filename}")
                
                # 返回文件
                return FileResponse(
                    path=file_path,
                    filename=os.path.basename(file_path),
                    media_type=self.get_media_type(file_path)
                )
                
            except HTTPException:
                # 重新抛出HTTP异常
                raise
            except Exception as e:
                logger.error(f"Internal server error: {e}")
                raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
        
        # 添加根路径的重定向或信息
        @self.app.get("/")
        async def root():
            return {
                "message": "Secure Image Server",
                "usage": "Access files via /path/to/file.jpg"
            }
    
    def get_media_type(self, file_path: Path) -> str:
        """根据文件扩展名获取媒体类型"""
        extension = file_path.suffix.lower()
        media_types = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.bmp': 'image/bmp',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
            '.txt': 'text/plain',
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.json': 'application/json',
        }
        return media_types.get(extension, 'application/octet-stream')
    
    def run_server(self, host: str = "127.0.0.1", port: int = 9000):
        """运行服务器"""
        import uvicorn
        
        print(f"Server running on http://{host}:{port}")
        print(f"Serving directory: {self.root_directory}")
        print("FastAPI server with proper directory/file handling")
        
        uvicorn.run(self.app, host=host, port=port)

def run_server(port=9000):
    # 设置当前目录为服务器根目录
    root_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 创建并运行服务器
    server = SecureStaticFileServer(root_dir)
    server.run_server(port=port)

if __name__ == "__main__":
    port = 9000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print("Invalid port number, using default 9000")
    
    run_server(port)