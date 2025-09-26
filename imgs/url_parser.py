import urllib.parse

def encode_url_path(url):
    """
    将URL中的路径部分特殊字符转换为URL编码格式
    
    Args:
        url (str): 完整的URL
        
    Returns:
        str: 路径部分特殊字符被URL编码后的完整URL
    """
    # 解析URL
    parsed = urllib.parse.urlsplit(url)
    
    # 对路径部分进行编码（只编码特殊字符，保留已编码的部分和斜杠）
    # 先解码已编码的部分，避免双重编码
    decoded_path = urllib.parse.unquote(parsed.path)
    
    # 对解码后的路径进行编码（安全字符包括斜杠和常见的URL安全字符）
    encoded_path = urllib.parse.quote(decoded_path, safe="/:@")
    
    # 重新构建URL
    encoded_url = urllib.parse.urlunsplit((
        parsed.scheme,
        parsed.netloc,
        encoded_path,
        parsed.query,
        parsed.fragment
    ))
    
    return encoded_url

def extract_and_encode_path(url):
    """
    从完整URL中提取路径部分并编码特殊字符
    
    Args:
        url (str): 完整的URL
        
    Returns:
        tuple: (完整编码后的URL, 仅路径部分)
    """
    # 完整URL编码
    full_encoded_url = encode_url_path(url)
    
    # 仅提取路径部分
    parsed = urllib.parse.urlsplit(full_encoded_url)
    path_only = parsed.path
    
    return full_encoded_url, path_only

# 测试函数
def test_url_path_encoding():
    # 测试用例
    test_url = "http://127.0.0.1:9000/wikipedia/commons/thumb/b/b2/Bergneustadt_-_Wallstraße1Museum_ex_16_ies.jpg/120px-Bergneustadt_-_Wallstraße1Museum_ex_16_ies.jpg"
    
    print("原始完整URL:")
    print(test_url)
    
    # 转换
    encoded_url, path_only = extract_and_encode_path(test_url)
    
    print("\n编码后完整URL:")
    print(encoded_url)
    
    print("\n仅路径部分:")
    print(path_only)
    
    # 验证
    print("\n验证:")
    parsed_original = urllib.parse.urlsplit(test_url)
    parsed_encoded = urllib.parse.urlsplit(encoded_url)
    
    print(f"原始路径: {parsed_original.path}")
    print(f"编码路径: {parsed_encoded.path}")
    
    return encoded_url, path_only

# 更精确的路径提取函数
def extract_path_from_url(url):
    """
    直接从URL中提取路径部分（不进行编码转换）
    """
    parsed = urllib.parse.urlsplit(url)
    return parsed.path

def convert_path_special_chars(path):
    """
    仅对路径部分的特殊字符进行编码
    """
    # 先解码已编码的部分
    decoded_path = urllib.parse.unquote(path)
    
    # 对特殊字符进行编码
    encoded_path = urllib.parse.quote(decoded_path, safe="/")
    
    return encoded_path

# 完整的处理流程
def process_url_complete(url):
    """
    完整的URL处理流程：提取路径 -> 编码特殊字符 -> 重建URL
    """
    # 1. 提取路径
    original_path = extract_path_from_url(url)
    print(f"1. 提取的原始路径: {original_path}")
    
    # 2. 编码路径中的特殊字符
    encoded_path = convert_path_special_chars(original_path)
    print(f"2. 编码后的路径: {encoded_path}")
    
    # 3. 重建完整URL
    parsed = urllib.parse.urlsplit(url)
    new_url = urllib.parse.urlunsplit((
        parsed.scheme,
        parsed.netloc,
        encoded_path,
        parsed.query,
        parsed.fragment
    ))
    print(f"3. 重建的完整URL: {new_url}")
    
    return new_url, encoded_path

if __name__ == "__main__":
    # 测试用例
    test_url = "http://127.0.0.1:9000/wikipedia/commons/thumb/b/b2/Bergneustadt_-_Wallstraße1Museum_ex_16_ies.jpg/120px-Bergneustadt_-_Wallstraße1Museum_ex_16_ies.jpg"
    
    print("=== 完整处理流程 ===")
    new_url, encoded_path = process_url_complete(test_url)
    
    print("\n=== 最终结果 ===")
    print(f"输入URL: {test_url}")
    print(f"输出URL: {new_url}")
    print(f"路径部分: {encoded_path}")
    
    # 验证转换是否正确
    expected_path = "/wikipedia/commons/thumb/b/b2/Bergneustadt_-_Wallstra%C3%9Fe1Museum_ex_16_ies.jpg/120px-Bergneustadt_-_Wallstra%C3%9Fe1Museum_ex_16_ies.jpg"
    print(f"\n期望的路径: {expected_path}")
    print(f"是否匹配: {encoded_path == expected_path}")