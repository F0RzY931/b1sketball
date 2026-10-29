"""FULL COURT — dev server without caching.

Usage:
    python serve.py [port]

Serves the current folder over http://127.0.0.1:<port>/ and disables browser
caching so edits to JS/CSS show up after a normal reload.
"""
import functools
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8420


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"FULL COURT dev server: http://127.0.0.1:{PORT}/ (Ctrl+C to stop)")
        httpd.serve_forever()
