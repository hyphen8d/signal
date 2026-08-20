#!/usr/bin/env python3
# Plain `python3 -m http.server` sends Last-Modified with 1-second
# granularity and no Cache-Control header, so a browser can get a 304 (or
# just serve straight from its own heuristic cache) for a file that was
# edited less than a second ago -- exactly what happened 2026-08-20:
# program.js was live-edited and pushed several times in quick succession,
# and the page kept running an in-memory module graph built from an older
# byte-for-byte response (STATIC BLOOM's shuffle bag was still sized for
# the pre-Round-D 6-track list, even though the file on disk had 10).
#
# This server sends Cache-Control: no-store on every response so a hard or
# even soft reload always gets the current file. Dev-only -- not meant to
# ship anywhere, just to stop this class of stale-module bug during
# iteration. Run with: python3 tools/dev-server.py [port]

import http.server
import socketserver
import sys

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

with ReusableTCPServer(('', port), NoCacheHandler) as httpd:
    print(f'Serving (no-cache) on port {port}')
    httpd.serve_forever()
