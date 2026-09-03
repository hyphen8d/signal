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
import os
import posixpath
import socketserver
import sys
import urllib.parse

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

# 2026-09-02 (audit, S1) -- the same static ALLOWLIST tools/admin-server.mjs
# grew, for the same reason and kept deliberately identical to it: this
# server binds EVERY interface (the '' below), so until now it handed
# .elevenlabs-key to anything on the LAN that asked for it. Whichever of the
# two servers is up, the same set of files is reachable and no other.
#
# The rules and the reasoning are documented once, beside servable() in
# tools/admin-server.mjs -- read them there. If you change one, change both;
# tests/admin-server.test.mjs pins the JS half, and the shapes are simple
# enough to compare by eye.
STATIC_DIRS = {'audio', 'fonts', 'screenshots', 'src', 'ui', 'visuals'}
STATIC_TOP_EXT = {'.js', '.json', '.html', '.md', '.ico', '.png', '.jpg', '.svg'}


def servable(rel):
    if rel == '':
        return True  # the directory index, which resolves to index.html
    parts = rel.split('/')
    if any(seg.startswith('.') for seg in parts):
        return False
    if len(parts) == 1:
        # A bare directory name ('audio') is the listing for one of ours.
        if parts[0] in STATIC_DIRS or parts[0] == 'tools':
            return True
        return os.path.splitext(rel)[1].lower() in STATIC_TOP_EXT
    if parts[0] == 'tools':
        if len(parts) == 2 and parts[1].endswith('.html'):
            return True
        return len(parts) == 3 and parts[1] == 'lib' and parts[2].endswith('.mjs')
    return parts[0] in STATIC_DIRS


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        # Checked here rather than in translate_path(): this is the one hook
        # both GET and HEAD pass through that can still refuse.
        rel = urllib.parse.urlsplit(self.path).path
        rel = posixpath.normpath(urllib.parse.unquote(rel)).strip('/')
        if rel == '.':
            rel = ''
        if not servable(rel):
            self.send_error(404, 'Not Found')
            return None
        return super().send_head()

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
