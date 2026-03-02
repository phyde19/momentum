import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

MESSAGE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "message.txt")


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/":
            self.path = "/index.html"
            return super().do_GET()

        if self.path == "/agent/v1/message":
            try:
                with open(MESSAGE_FILE) as f:
                    msg = f.read().strip()
            except FileNotFoundError:
                msg = "(no message file found)"
            self._json_response(200, {"message": msg})
            return

        self.send_error(404)

    def do_PUT(self):
        if self.path == "/agent/v1/message":
            length = int(self.headers.get("Content-Length", 0))
            if length == 0:
                self._json_response(400, {"error": "empty body"})
                return
            try:
                body = json.loads(self.rfile.read(length))
            except (json.JSONDecodeError, ValueError):
                self._json_response(400, {"error": "invalid JSON"})
                return

            new_msg = body.get("message")
            if new_msg is None:
                self._json_response(400, {"error": "missing 'message' field"})
                return

            with open(MESSAGE_FILE, "w") as f:
                f.write(new_msg)
            self._json_response(200, {"message": new_msg})
            return

        self.send_error(404)

    def _json_response(self, code, data):
        payload = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        print(f"[poc] {self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    server = HTTPServer(("0.0.0.0", port), Handler)
    print(f"POC server listening on 0.0.0.0:{port}")
    server.serve_forever()
