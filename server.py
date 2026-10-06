from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
import ipaddress
import socket

MAX_PDF_BYTES = 20 * 1024 * 1024

def safe_public_url(value):
    parsed = urlparse(value)
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        raise ValueError('只允許 http 或 https 公開網址')
    addresses = socket.getaddrinfo(parsed.hostname, None)
    for address in addresses:
        ip = ipaddress.ip_address(address[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise ValueError('不允許讀取私人或本機網址')
    return value

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/fetch-pdf'):
            try:
                target = parse_qs(urlparse(self.path).query).get('url', [''])[0]
                request = Request(safe_public_url(target), headers={'User-Agent': 'IPAS-Practice/1.0'})
                with urlopen(request, timeout=15) as response:
                    content_type = response.headers.get('Content-Type', '').lower()
                    length = int(response.headers.get('Content-Length', '0') or 0)
                    if length > MAX_PDF_BYTES or ('pdf' not in content_type and not target.lower().split('?')[0].endswith('.pdf')):
                        raise ValueError('網址不是可接受的 PDF，或檔案超過 20 MB')
                    data = response.read(MAX_PDF_BYTES + 1)
                    if len(data) > MAX_PDF_BYTES or not data.startswith(b'%PDF'):
                        raise ValueError('下載內容不是有效 PDF，或檔案超過 20 MB')
                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(data)
            except Exception as error:
                self.send_error(400, str(error))
            return
        super().do_GET()

print('開啟 http://localhost:8000')
ThreadingHTTPServer(('127.0.0.1', 8000), Handler).serve_forever()
