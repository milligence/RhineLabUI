#!/usr/bin/env python3
"""Serve an explicit local review build and save reports requested by its UI."""
import argparse
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument("directory", type=Path)
parser.add_argument("--port", type=int, default=5195)
parser.add_argument("--report", type=Path, required=True)
args = parser.parse_args()

class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        if self.path != "/review-report" or not 0 < length <= 10_000_000:
            self.send_error(400)
            return
        try:
            report = json.loads(self.rfile.read(length))
            if not isinstance(report.get("checks"), list):
                raise ValueError("Missing review checks")
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        except (ValueError, OSError):
            self.send_error(400)
            return
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Saved review report")

ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(args.directory))).serve_forever()
