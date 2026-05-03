from http.server import BaseHTTPRequestHandler
import json
import os

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        key = os.environ.get('ANTHROPIC_API_KEY', '')
        body = json.dumps({
            'ok': True,
            'key_set': bool(key),
            'key_preview': key[:10] + '...' if key else 'NOT SET'
        }).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass
