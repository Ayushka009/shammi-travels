#!/bin/bash
# Double-click (or run in Terminal) to serve the app at http://localhost:8000 and open it.
# Press Ctrl+C in this window to stop. Uses the same Supabase data as the live site.
cd "$(dirname "$0")" || exit 1
PORT=8000

if lsof -i :$PORT >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Opening what is running there."
  open "http://localhost:$PORT"
  exit 0
fi

(sleep 1 && open "http://localhost:$PORT") &
echo "Shammi Travels running at http://localhost:$PORT  (Ctrl+C to stop)"

# no-cache so edits show up on a normal refresh
python3 - <<'PY'
import http.server, socketserver
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", 8000), H) as s:
    s.serve_forever()
PY
