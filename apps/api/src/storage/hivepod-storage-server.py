#!/usr/bin/env python3

import hmac
import os
import re
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


HOST = "0.0.0.0"
PORT = int(os.environ.get("PORT", "8080"))
MAX_OBJECT_BYTES = int(os.environ.get("HIVEPOD_STORAGE_MAX_BYTES", str(500 * 1024 * 1024)))
TOKEN = os.environ.get("HIVEPOD_STORAGE_TOKEN", "")
ROOT = Path(os.environ.get(
    "HIVEPOD_STORAGE_PATH",
    "/home/hivepod/data/imara-storage/objects",
)).resolve()
SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,255}$")


class LimitedThreadingHTTPServer(ThreadingHTTPServer):
    request_queue_size = 32

    def __init__(self, server_address, request_handler):
        self._request_slots = threading.BoundedSemaphore(16)
        super().__init__(server_address, request_handler)

    def process_request(self, request, client_address):
        if not self._request_slots.acquire(blocking=False):
            try:
                request.sendall(
                    b"HTTP/1.1 503 Service Unavailable\r\n"
                    b"Connection: close\r\nContent-Length: 0\r\n\r\n"
                )
            finally:
                self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self._request_slots.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._request_slots.release()


class StorageHandler(BaseHTTPRequestHandler):
    server_version = "IMARA-HivePod-Storage"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def log_message(self, _format, *_args):
        return

    def _authorized(self):
        supplied = self.headers.get("Authorization", "")
        expected = f"Bearer {TOKEN}"
        if not hmac.compare_digest(supplied.encode(), expected.encode()):
            self.send_error(401)
            return False
        return True

    def _object_path(self):
        raw_path = urlsplit(self.path).path
        if not raw_path.startswith("/objects/"):
            self.send_error(404)
            return None
        try:
            key = unquote(raw_path[len("/objects/"):], errors="strict")
        except UnicodeDecodeError:
            self.send_error(400)
            return None
        parts = key.split("/")
        if (not key or len(key) > 512
                or any(not SEGMENT_PATTERN.fullmatch(part) or part in (".", "..") for part in parts)):
            self.send_error(400)
            return None
        target = ROOT.joinpath(*parts)
        if not target.resolve(strict=False).is_relative_to(ROOT):
            self.send_error(400)
            return None
        return target

    def do_HEAD(self):
        if urlsplit(self.path).path != "/health":
            self.send_error(404)
            return
        if not self._authorized():
            return
        self.send_response(200)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if urlsplit(self.path).path == "/health":
            if not self._authorized():
                return
            body = b'{"status":"healthy"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if not self._authorized():
            return
        target = self._object_path()
        if target is None:
            return
        try:
            size = target.stat().st_size
            with target.open("rb") as stored:
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(size))
                self.end_headers()
                while chunk := stored.read(1024 * 1024):
                    self.wfile.write(chunk)
        except FileNotFoundError:
            self.send_error(404)
        except OSError:
            self.send_error(503)

    def do_PUT(self):
        if not self._authorized():
            return
        target = self._object_path()
        if target is None:
            return
        try:
            size = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self.send_error(411)
            return
        if size < 1 or size > MAX_OBJECT_BYTES:
            self.send_error(413)
            return
        temporary_name = None
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            descriptor, temporary_name = tempfile.mkstemp(prefix=".upload-", dir=target.parent)
            with os.fdopen(descriptor, "wb") as temporary:
                remaining = size
                while remaining:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        self.send_error(400)
                        return
                    temporary.write(chunk)
                    remaining -= len(chunk)
                temporary.flush()
                os.fsync(temporary.fileno())
            os.replace(temporary_name, target)
        except OSError:
            self.send_error(507)
            return
        finally:
            if temporary_name:
                try:
                    os.unlink(temporary_name)
                except FileNotFoundError:
                    pass
                except OSError:
                    print("Unable to remove a temporary storage file", file=sys.stderr)
        self.send_response(201)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_DELETE(self):
        if not self._authorized():
            return
        target = self._object_path()
        if target is None:
            return
        try:
            target.unlink()
        except FileNotFoundError:
            pass
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()


def main():
    if not re.fullmatch(r"[a-fA-F0-9]{64}", TOKEN):
        raise SystemExit("HIVEPOD_STORAGE_TOKEN must be a 32-byte random token encoded as hex")
    if MAX_OBJECT_BYTES < 1:
        raise SystemExit("HIVEPOD_STORAGE_MAX_BYTES must be positive")
    ROOT.mkdir(parents=True, exist_ok=True)
    server = LimitedThreadingHTTPServer((HOST, PORT), StorageHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
