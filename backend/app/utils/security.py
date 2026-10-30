import ipaddress
import os
import re
import socket
from pathlib import Path
from urllib.parse import urlparse

# Windows reserved device names
WINDOWS_RESERVED_NAMES = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}

# Dangerous / private IP networks
PRIVATE_NETWORKS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.0.0.0/24"),
    ipaddress.ip_network("192.0.2.0/24"),
    ipaddress.ip_network("192.88.99.0/24"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("198.18.0.0/15"),
    ipaddress.ip_network("198.51.100.0/24"),
    ipaddress.ip_network("203.0.113.0/24"),
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("240.0.0.0/4"),
    ipaddress.ip_network("255.255.255.255/32"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("::/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

def sanitize_filename(filename: str, max_length: int = 180) -> str:
    """Sanitize a filename for safe usage on Windows and cross-platform filesystems."""
    if not filename:
        return "SaveXa_download"
        
    # Replace forbidden Windows characters: < > : " / \ | ? *
    clean = re.sub(r'[<>:"/\\|?*\x00-\x1F]', '_', filename)
    
    # Strip leading/trailing dots and spaces (Windows restriction)
    clean = clean.strip(". ")
    
    # Check if empty after stripping
    if not clean:
        clean = "SaveXa_download"
        
    # Check Windows reserved base names
    stem = Path(clean).stem.upper()
    if stem in WINDOWS_RESERVED_NAMES:
        clean = f"_{clean}"
        
    # Ensure length doesn't exceed limit while preserving extension
    ext = Path(clean).suffix
    base = Path(clean).stem
    if len(clean) > max_length:
        allowed_base_len = max(10, max_length - len(ext))
        clean = f"{base[:allowed_base_len]}{ext}"
        
    return clean

def validate_url(url: str, allow_localhost_for_testing: bool = False) -> tuple[bool, str]:
    """
    Validate that the URL is a safe HTTP/HTTPS URL and does not target
    forbidden internal/private networks (SSRF defense).
    """
    if not url or not isinstance(url, str):
        return False, "URL is empty or invalid"
        
    url = url.strip()
    try:
        parsed = urlparse(url)
    except Exception as e:
        return False, f"Malformed URL syntax: {e}"
        
    if parsed.scheme.lower() not in ("http", "https"):
        return False, f"Unsupported scheme '{parsed.scheme}'. Only http and https are allowed."
        
    hostname = parsed.hostname
    if not hostname:
        return False, "URL must include a valid hostname"
        
    if allow_localhost_for_testing:
        return True, ""
        
    # Check if hostname is 'localhost'
    if hostname.lower() == "localhost" or hostname.lower().endswith(".local"):
        return False, "Access to localhost and internal domain names is prohibited"
        
    # Check if hostname resolves to private IP addresses
    try:
        # Check direct IP string
        ip_obj = ipaddress.ip_address(hostname)
        for net in PRIVATE_NETWORKS:
            if ip_obj in net:
                return False, f"Access to private IP range ({ip_obj}) is prohibited"
    except ValueError:
        # Not a direct IP, it's a domain name. Resolve addresses.
        try:
            addr_info = socket.getaddrinfo(hostname, None)
            for item in addr_info:
                ip_str = item[4][0]
                ip_obj = ipaddress.ip_address(ip_str)
                for net in PRIVATE_NETWORKS:
                    if ip_obj in net:
                        return False, f"Domain resolves to private/loopback IP ({ip_str}), access prohibited"
        except socket.gaierror:
            # Domain not resolving right now, let downloader handle DNS or connection failure later
            pass
            
    return True, ""

def ensure_safe_destination_path(target_path: Path, base_dir: Path) -> Path:
    """Ensure target path resolves within base_dir to prevent directory traversal."""
    resolved_target = target_path.resolve()
    resolved_base = base_dir.resolve()
    try:
        resolved_target.relative_to(resolved_base)
    except ValueError:
        raise ValueError(f"Path traversal detected: {target_path} is outside {base_dir}")
    return resolved_target
