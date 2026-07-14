import json
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import requests


HOST = "127.0.0.1"
PORT = int(os.getenv("NOTIFICATION_PORT", "8787"))
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
MAX_BODY_SIZE = 16 * 1024
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX_REQUESTS = 10
request_times = {}


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
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(encoded)

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


if __name__ == "__main__":
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        raise SystemExit("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required")
    server = ThreadingHTTPServer((HOST, PORT), NotificationHandler)
    print(f"Notification service listening on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
