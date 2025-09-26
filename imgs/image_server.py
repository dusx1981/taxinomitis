#!/usr/bin/env python3
import http.server
import socketserver
import urllib.parse
import os
import sys

class ImageServer(http.server.SimpleHTTPRequestHandler):
    def log_debug(self, *args):
        print(*args)

    def do_GET(self):
        try:
            # 使用更安全的方式解码路径
            decoded_path = self.safe_decode_path(self.path)
            
            # 安全检查：防止路径遍历攻击
            if self.has_path_traversal(decoded_path):
                self.send_error(403, "Forbidden: Path traversal detected")
                return
            
            # 让父类处理路径转换和文件服务
            # 父类会自动处理目录和文件的区别
            super().do_GET()
            
        except Exception as e:
            self.send_error(500, f"Internal server error: {str(e)}")
    
    def safe_decode_path(self, path):
        """安全地解码URL路径，处理各种编码情况"""
        try:
            # 先分割查询参数和片段标识符
            path_only = path.split('?')[0].split('#')[0]
            # 解码URL编码
            decoded = urllib.parse.unquote(path_only, errors='surrogatepass')
            return decoded
        except Exception as e:
            print(f"Path decoding error: {e}")
            return path  # 解码失败时返回原始路径
    
    def has_path_traversal(self, path):
        """检查路径是否包含遍历攻击尝试"""
        try:
            # 分离路径部分
            path_only = path.split('?')[0].split('#')[0]
            
            # 移除开头的斜杠并规范化路径
            clean_path = os.path.normpath(path_only.lstrip('/'))
            
            # 检查是否尝试访问上级目录
            if clean_path.startswith('..') or '/../' in clean_path or '\\..\\' in clean_path:
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
    
    def list_directory(self, path):
        """禁用目录列表以增强安全性"""
        self.send_error(403, "Directory listing is not allowed")
        return None
    
    def translate_path(self, path):
        """直接拼接路径，不做复杂的转义处理"""
        try:
            # 只取路径部分（去掉查询参数和片段）
            path_only = urllib.parse.urlsplit(path).path
            
            # 安全检查
            if self.has_path_traversal(path_only):
                raise PermissionError("Path traversal detected")
            
            # 获取根目录
            root = os.path.abspath(self.directory if getattr(self, "directory", None) else os.getcwd())
            
            # 直接拼接路径：root + path_only
            # 移除path_only开头的斜杠，避免双斜杠
            clean_path = path_only.lstrip('/')
            
            # 直接拼接
            full_path = os.path.join(root, clean_path)
            
            # 规范化路径（解析..和.等）
            normalized_path = os.path.normpath(full_path)
            
            # 最终安全检查：确保路径在服务器根目录下
            if not normalized_path.startswith(root):
                raise PermissionError("Access outside server root directory")
                
            return normalized_path
            
        except Exception as e:
            self.log_debug(f"Path translation error: {e}")
            # 出错时返回一个肯定不会存在的路径，让父类处理404
            return os.path.join(os.getcwd(), "___invalid_path___")
    
    def log_message(self, format, *args):
        """增强日志记录"""
        decoded_path = self.safe_decode_path(self.path)
        print(f"Request: {self.path} -> Decoded: {decoded_path} -> Client: {self.client_address[0]}")
        super().log_message(format, *args)

def run_server(port=9000):
    # 设置当前目录为服务器根目录
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    with socketserver.TCPServer(("127.0.0.1", port), ImageServer) as httpd:
        print(f"Server running on port {port}")
        print(f"Serving directory: {os.getcwd()}")
        print("Fixed server with proper directory/file handling")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer shutdown gracefully")

if __name__ == "__main__":
    port = 9000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print("Invalid port number, using default 9000")
    
    run_server(port)