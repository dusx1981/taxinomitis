# #!/usr/bin/env python3
# import http.server
# import socketserver
# import urllib.parse
# import os
# import sys

# class ImageServer(http.server.SimpleHTTPRequestHandler):
#     def log_debug(self, *args):
#         print(*args)

#     def do_GET(self):
#         try:
#             # 使用更安全的方式解码路径
#             decoded_path = self.safe_decode_path(self.path)
            
#             # 安全检查：防止路径遍历攻击
#             if self.has_path_traversal(decoded_path):
#                 self.send_error(403, "Forbidden: Path traversal detected")
#                 return
            
#             # 构建完整的文件系统路径
#             full_path = self.translate_path(decoded_path)
            
#             # 检查文件是否存在且是普通文件（非目录）
#             if not os.path.isfile(full_path):
#                 self.send_error(404, f"File not found: {os.path.basename(full_path)}")
#                 return
            
#             # 调用父类方法处理有效的文件请求
#             super().do_GET()
            
#         except Exception as e:
#             self.send_error(500, f"Internal server error: {str(e)}")
    
#     def safe_decode_path(self, path):
#         """安全地解码URL路径，处理各种编码情况"""
#         try:
#             # 先分割查询参数和片段标识符
#             path_only = path.split('?')[0].split('#')[0]
#             # 解码URL编码
#             decoded = urllib.parse.unquote(path_only, errors='surrogatepass')
#             return decoded
#         except Exception as e:
#             print(f"Path decoding error: {e}")
#             return path  # 解码失败时返回原始路径
    
#     def has_path_traversal(self, path):
#         """检查路径是否包含遍历攻击尝试"""
#         # 移除开头的斜杠并规范化路径
#         clean_path = os.path.normpath(path.lstrip('/'))
        
#         # 检查是否尝试访问上级目录
#         if clean_path.startswith('..') or '/../' in clean_path:
#             return True
        
#         # 检查绝对路径尝试
#         if os.path.isabs(clean_path):
#             return True
            
#         return False
    
#     def translate_path(self, path):
#         # """重写路径转换方法，确保正确处理解码后的路径[6](@ref)"""
#         # # 调用父类的translate_path，但使用我们解码后的路径
#         # path = self.safe_decode_path(path)
#         # return super().translate_path(path)

#         """
#         Try multiple translations of the URL path into filesystem path.
#         Return the first existing filesystem path; otherwise fall back to parent.
#         """
#         # 只取 path 部分（去掉 query/fragment）
#         path_only = urllib.parse.urlsplit(path).path  # e.g. "/a/b/c%2Cname.jpg"
#         root = os.path.abspath(self.directory if getattr(self, "directory", None) else os.getcwd())

#         candidates = []

#         # Candidate A: unquote_to_bytes -> os.fsdecode (尊重文件系统编码)
#         try:
#             raw_bytes = urllib.parse.unquote_to_bytes(path_only)
#             cand_fs = os.fsdecode(raw_bytes)  # decode according to filesystem encoding
#             candidates.append(cand_fs)
#             self.log_debug("candidate fsdecode:", cand_fs)
#         except Exception as e:
#             self.log_debug("fsdecode failed:", e)

#         # Candidate B: urllib.parse.unquote (常见的 UTF-8 解码)
#         try:
#             cand_unquote = urllib.parse.unquote(path_only)
#             candidates.append(cand_unquote)
#             self.log_debug("candidate unquote:", cand_unquote)
#         except Exception as e:
#             self.log_debug("unquote failed:", e)

#         # Candidate C: 原始 path（保留 %xx），以防磁盘上文件名就是字面 %xx
#         candidates.append(path_only)
#         self.log_debug("candidate raw:", path_only)

#         # Candidate D: double-unquote (处理双重编码 %252C -> %2C -> ,)
#         try:
#             if 'cand_unquote' in locals():
#                 double = urllib.parse.unquote(cand_unquote)
#                 candidates.append(double)
#                 self.log_debug("candidate double-unquote:", double)
#         except Exception:
#             pass

#         # 遍历候选并检查磁盘
#         for cand in candidates:
#             if not cand:
#                 continue
#             # 移除开头 '/'
#             cand_rel = cand[1:] if cand.startswith('/') else cand
#             # 分段并去掉空段 / . / ..
#             parts = [p for p in cand_rel.split('/') if p and p not in ('.', '..')]
#             candidate_full = os.path.abspath(os.path.join(root, *parts)) if parts else root

#             # 安全检查：必须位于 root 下
#             try:
#                 if os.path.commonpath([root, candidate_full]) != root:
#                     self.log_debug("skip outside root:", candidate_full)
#                     continue
#             except Exception:
#                 continue

#             self.log_debug("trying candidate_full:", candidate_full)
#             if os.path.exists(candidate_full):
#                 self.log_debug("MATCH:", candidate_full)
#                 return candidate_full

#         # 都没有匹配，退回到父类默认行为（它会做一次 urllib.parse.unquote + normpath）
#         self.log_debug("no candidate matched, fallback to super().translate_path")
#         return super().translate_path(path_only)
    
#     def log_message(self, format, *args):
#         """增强日志记录，显示原始和处理后的URL"""
#         decoded_path = self.safe_decode_path(self.path)
#         print(f"Request: {self.path} -> Decoded: {decoded_path} -> Client: {self.client_address[0]}")
#         super().log_message(format, *args)

# def run_server(port=9000):
#     # 设置当前目录为服务器根目录
#     os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
#     with socketserver.TCPServer(("", port), ImageServer) as httpd:
#         print(f"Server running on port {port}")
#         print(f"Serving directory: {os.getcwd()}")
#         print("This server properly handles URL-encoded characters with safety checks")
#         try:
#             httpd.serve_forever()
#         except KeyboardInterrupt:
#             print("\nServer shutdown gracefully")

# if __name__ == "__main__":
#     port = 9000
#     if len(sys.argv) > 1:
#         try:
#             port = int(sys.argv[1])
#         except ValueError:
#             print("Invalid port number, using default 9000")
    
#     run_server(port)

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