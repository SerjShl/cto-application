import json
import mimetypes
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

import requests


HOST = "0.0.0.0"
PORT = int(os.getenv("PORT", os.getenv("NOTIFICATION_PORT", "8080")))
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
MAX_BODY_SIZE = 16 * 1024
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX_REQUESTS = 10
request_times = {}
DIST_DIR = Path(__file__).resolve().parent / "dist"


def validate_payload(payload):
    if not isinstance(payload, dict):
        return None
    fields = {key: str(payload.get(key, "")).strip() for key in ("service", "booking_date", "booking_time", "name", "phone", "car")}
    if not all(fields[key] for key in ("service", "booking_date", "booking_time", "name", "phone")):
        return None
    if len(fields["service"]) > 100 or len(fields["name"]) > 100 or len(fields["phone"]) > 30 or len(fields["car"]) > 100:
        return None
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", fields["booking_date"]):
        return None
    if not re.fullmatch(r"\d{2}:\d{2}", fields["booking_time"]):
        return None
    if len(re.sub(r"\D", "", fields["phone"])) < 10:
        return None
    return fields


def is_rate_limited(client_address):
    now = time.monotonic()
    recent = [stamp for stamp in request_times.get(client_address, []) if now - stamp < RATE_LIMIT_WINDOW]
    recent.append(now)
    request_times[client_address] = recent
    return len(recent) > RATE_LIMIT_MAX_REQUESTS


class NotificationHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, body):
        encoded = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(encoded)

    def _send_file(self, file_path, content_type=None):
        try:
            content = file_path.read_bytes()
        except (OSError, ValueError):
            self._send_json(404, {"error": "Not found"})
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type or mimetypes.guess_type(file_path.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self._send_json(200, {"ok": True})
            return
        if path == "/config.json":
            self._send_json(200, runtime_config())
            return
        if path.startswith("/assets/"):
            relative_path = Path(unquote(path.removeprefix("/assets/")))
            asset_path = (DIST_DIR / "assets" / relative_path).resolve()
            assets_root = (DIST_DIR / "assets").resolve()
            if assets_root not in asset_path.parents:
                self._send_json(404, {"error": "Not found"})
                return
            self._send_file(asset_path)
            return
        if path == "/notify" or path.startswith("/notify/"):
            self._send_json(405, {"error": "Method not allowed"})
            return
        self._send_file(DIST_DIR / "index.html", "text/html; charset=utf-8")

    def do_OPTIONS(self):
        self._send_json(204, {})

    def do_POST(self):
        if self.path != "/notify":
            self._send_json(404, {"error": "Not found"})
            return
        if is_rate_limited(self.client_address[0]):
            self._send_json(429, {"error": "Too many requests"})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > MAX_BODY_SIZE:
                raise ValueError
            payload = validate_payload(json.loads(self.rfile.read(content_length)))
        except (ValueError, json.JSONDecodeError):
            payload = None
        if not payload:
            self._send_json(400, {"error": "Invalid request"})
            return

        message = "Новая заявка: {service}, {booking_date} {booking_time}, {name}, {phone}, {car}".format(**payload)
        try:
            response = requests.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                json={"chat_id": TELEGRAM_CHAT_ID, "text": message},
                timeout=10,
            )
            response.raise_for_status()
            if not response.json().get("ok"):
                raise requests.RequestException("Telegram rejected the message")
        except (requests.RequestException, ValueError):
            self._send_json(502, {"error": "Notification delivery failed"})
            return
        self._send_json(200, {"ok": True})

    def log_message(self, _format, *_args):
        return


def runtime_config():
    return {
        "supabaseUrl": os.getenv("SUPABASE_URL", ""),
        "supabaseAnonKey": os.getenv("SUPABASE_ANON_KEY", ""),
        "notificationUrl": os.getenv("NOTIFICATION_URL", "/notify"),
    }


if __name__ == "__main__":
    required = {
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_ANON_KEY": os.getenv("SUPABASE_ANON_KEY"),
        "TELEGRAM_BOT_TOKEN": TELEGRAM_BOT_TOKEN,
        "TELEGRAM_CHAT_ID": TELEGRAM_CHAT_ID,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise SystemExit(f"Required environment variables are missing: {', '.join(missing)}")
    server = ThreadingHTTPServer((HOST, PORT), NotificationHandler)
    print(f"Notification service listening on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
