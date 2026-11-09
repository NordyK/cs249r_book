#!/usr/bin/env python3
"""Local helper for the course page (standard library only, listens on 127.0.0.1).

What it does:
  * serves the course (index.html, assets/, course/data.js)
  * saves learner progress to progress/progress.json  (GET/POST /api/progress)
  * runs an exercise's unit tests when you click "Run tests"  (POST /api/run-tests)
  * saves the learner's edited exercise file (POST /api/save-exercise; only files listed as "starter"
    in that exercise's exercise.json can be written)
  * runs playground code with this computer's python3 (POST /api/run-python; isolated mode, temp
    folder, 20 second limit, localhost only)

This MLSys edition is maintained in mlsys-course-tools/; do not refresh it with init_course.py --update.

The command that gets run comes from exercises/<dir>/exercise.json (written when the course was
built), never from the browser request. Only the folder name is taken from the request.

Usage:  python3 serve.py [--port 8765] [--no-browser] [--lan]

--lan also serves the course to your phone or tablet on the same Wi-Fi. It prints a private link with
a key; only browsers that opened that link (and this computer) can see the course or run code.
"""
import argparse
import http.server
import json
import os
import re
import secrets
import socket
import shutil
import socketserver
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
PROGRESS_DIR = os.path.join(ROOT, "progress")
PROGRESS = os.path.join(PROGRESS_DIR, "progress.json")
EXERCISES = os.path.join(ROOT, "exercises")
KEY_FILE = os.path.join(PROGRESS_DIR, "lan-key.txt")
LAN = {"on": False, "key": ""}
MAX_BODY = 5 * 1024 * 1024
OUTPUT_LIMIT = 20000
BLOCKED_PREFIXES = ("/.build", "/progress", "/exercises/")  # raw files are not served; the page gets what it needs via data.js


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):  # keep the terminal quiet
        if args and str(args[1]) not in ("200", "304"):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # ---- helpers -------------------------------------------------------------------------
    def _local_client(self):
        return self.client_address[0] in ("127.0.0.1", "::1", "::ffff:127.0.0.1")

    def _host_ok(self):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]")
        if host in ("127.0.0.1", "localhost", "::1"):
            return True
        # LAN mode: other devices must carry the key (cookie set by the ?k= link)
        if not LAN["on"]:
            return False
        if self._local_client():
            return True
        cookies = dict(c.strip().split("=", 1) for c in (self.headers.get("Cookie") or "").split(";") if "=" in c)
        return secrets.compare_digest(cookies.get("course_key", ""), LAN["key"])

    def _key_from_link(self):
        """GET /?k=KEY: remember the key in a cookie and drop it from the address bar."""
        if not LAN["on"] or "?" not in self.path:
            return False
        q = dict(x.split("=", 1) for x in self.path.split("?", 1)[1].split("&") if "=" in x)
        if not secrets.compare_digest(q.get("k", ""), LAN["key"]):
            return False
        self.send_response(303)
        self.send_header("Set-Cookie", "course_key=%s; Path=/; Max-Age=31536000; SameSite=Strict; HttpOnly" % LAN["key"])
        self.send_header("Location", "/")
        self.send_header("Content-Length", "0")
        self.end_headers()
        return True

    def _json(self, code, obj):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_BODY:
            return None
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    # ---- routes --------------------------------------------------------------------------
    def do_GET(self):
        if self._key_from_link():
            return None
        if not self._host_ok():
            if LAN["on"]:
                return self._json(403, {"error": "Open the course with the link that serve.py --lan printed (it carries the key)."})
            return self._json(403, {"error": "bad host"})
        path = self.path.split("?", 1)[0]
        if path == "/api/ping":
            return self._json(200, {"ok": True, "server": "course-helper", "version": 1})
        if path == "/api/progress":
            try:
                with open(PROGRESS, "r", encoding="utf-8") as f:
                    return self._json(200, json.load(f))
            except (OSError, ValueError):
                return self._json(200, {})
        if path.startswith(BLOCKED_PREFIXES) or path in ("/serve.py",):
            return self._json(404, {"error": "not found"})
        return super().do_GET()

    def do_POST(self):
        if not self._host_ok():
            return self._json(403, {"error": "bad host"})
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            return self._json(415, {"error": "json only"})
        path = self.path.split("?", 1)[0]
        body = self._body()
        if not isinstance(body, dict):
            return self._json(400, {"error": "bad body"})
        if path == "/api/progress":
            return self._save_progress(body)
        if path == "/api/run-tests":
            return self._run_tests(body)
        if path == "/api/save-exercise":
            return self._save_exercise(body)
        if path == "/api/run-python":
            return self._run_python(body)
        return self._json(404, {"error": "not found"})

    def _save_progress(self, body):
        os.makedirs(PROGRESS_DIR, exist_ok=True)
        tmp = PROGRESS + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(body, f, ensure_ascii=False, indent=2)
        if os.path.exists(PROGRESS):
            try:
                shutil.copyfile(PROGRESS, PROGRESS + ".bak")
            except OSError:
                pass
        os.replace(tmp, PROGRESS)
        return self._json(200, {"ok": True})

    def _run_tests(self, body):
        name = str(body.get("dir", ""))
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", name) or name.startswith("."):
            return self._json(400, {"error": "bad exercise name"})
        ex_dir = os.path.join(EXERCISES, name)
        cfg_path = os.path.join(ex_dir, "exercise.json")
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except (OSError, ValueError):
            return self._json(404, {"error": "exercise not found"})
        cmd = cfg.get("command")
        if not (isinstance(cmd, list) and cmd and all(isinstance(c, str) for c in cmd)):
            return self._json(500, {"error": "exercise.json has no valid command"})
        timeout = min(max(int(cfg.get("timeout", 60)), 5), 300)
        if shutil.which(cmd[0]) is None:
            return self._json(200, {"ok": False, "exit_code": 127, "timed_out": False,
                                    "output": "Program '%s' nie jest zainstalowany / is not installed.\n" % cmd[0]})
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1", CI="1")
        t0 = time.time()
        timed_out = False
        try:
            p = subprocess.run(cmd, cwd=ex_dir, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                               timeout=timeout, stdin=subprocess.DEVNULL)
            code, out = p.returncode, p.stdout.decode("utf-8", "replace")
        except subprocess.TimeoutExpired as e:
            timed_out, code = True, -1
            out = (e.stdout or b"").decode("utf-8", "replace") if isinstance(e.stdout, bytes) else (e.stdout or "")
        if len(out) > OUTPUT_LIMIT:
            out = out[:OUTPUT_LIMIT // 2] + "\n… [obcięto / truncated] …\n" + out[-OUTPUT_LIMIT // 2:]
        return self._json(200, {"ok": code == 0 and not timed_out, "exit_code": code, "timed_out": timed_out,
                                "output": out, "duration_ms": int((time.time() - t0) * 1000)})


    def _origin_ok(self):
        origin = self.headers.get("Origin")
        if not origin:
            return True
        o = re.sub(r"^https?://", "", origin).strip("/")
        if o.rsplit(":", 1)[0].strip("[]") in ("127.0.0.1", "localhost", "::1"):
            return True
        return LAN["on"] and o == (self.headers.get("Host") or "")

    def _save_exercise(self, body):
        if not self._origin_ok():
            return self._json(403, {"error": "bad origin"})
        name, rel, content = str(body.get("dir", "")), str(body.get("path", "")), body.get("content")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", name) or name.startswith("."):
            return self._json(400, {"error": "bad exercise name"})
        if not isinstance(content, str) or len(content) > 1024 * 1024:
            return self._json(400, {"error": "bad content"})
        ex_dir = os.path.join(EXERCISES, name)
        try:
            with open(os.path.join(ex_dir, "exercise.json"), "r", encoding="utf-8") as f:
                cfg = json.load(f)
        except (OSError, ValueError):
            return self._json(404, {"error": "exercise not found"})
        if rel not in (cfg.get("starter") or []):
            return self._json(403, {"error": "only the exercise's starter files can be saved"})
        target = os.path.realpath(os.path.join(ex_dir, rel))
        if not target.startswith(os.path.realpath(ex_dir) + os.sep):
            return self._json(403, {"error": "bad path"})
        tmp = target + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(content)
        os.replace(tmp, target)
        return self._json(200, {"ok": True})

    def _run_python(self, body):
        if not self._origin_ok():
            return self._json(403, {"error": "bad origin"})
        code = body.get("code")
        if not isinstance(code, str) or len(code) > 200000:
            return self._json(400, {"error": "bad code"})
        py = sys.executable or shutil.which("python3")
        t0, timed_out = time.time(), False
        with tempfile.TemporaryDirectory(prefix="mlsys-play-") as tmp:
            src = os.path.join(tmp, "main.py")
            with open(src, "w", encoding="utf-8") as f:
                f.write(code)
            env = {"PATH": os.environ.get("PATH", ""), "HOME": tmp, "PYTHONDONTWRITEBYTECODE": "1",
                   "PYTHONIOENCODING": "utf-8", "MPLBACKEND": "Agg"}
            try:
                p = subprocess.run([py, "-I", src], cwd=tmp, env=env, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, timeout=20)
                rc, out = p.returncode, p.stdout.decode("utf-8", "replace")
            except subprocess.TimeoutExpired as e:
                timed_out, rc = True, -1
                out = (e.stdout or b"").decode("utf-8", "replace") if isinstance(e.stdout, bytes) else ""
        out = out.replace(tmp, ".")
        if len(out) > OUTPUT_LIMIT:
            out = out[:OUTPUT_LIMIT // 2] + "\n... [truncated] ...\n" + out[-OUTPUT_LIMIT // 2:]
        return self._json(200, {"ok": rc == 0 and not timed_out, "exit_code": rc, "timed_out": timed_out,
                                "output": out, "duration_ms": int((time.time() - t0) * 1000)})


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def lan_ip():
    """This computer's address on the local network (no packet is sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return socket.gethostbyname(socket.gethostname())
    finally:
        s.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--lan", action="store_true", help="also serve to phones and tablets on the same Wi-Fi (with a private key)")
    args = ap.parse_args()
    if args.lan:
        LAN["on"] = True
        os.makedirs(PROGRESS_DIR, exist_ok=True)
        try:
            LAN["key"] = open(KEY_FILE, encoding="utf-8").read().strip()
        except OSError:
            LAN["key"] = ""
        if len(LAN["key"]) < 16:
            LAN["key"] = secrets.token_urlsafe(18)
            with open(KEY_FILE, "w", encoding="utf-8") as f:
                f.write(LAN["key"])
    server = None
    for port in range(args.port, args.port + 30):
        try:
            server = Server(("0.0.0.0" if args.lan else "127.0.0.1", port), Handler)
            break
        except OSError:
            continue
    if server is None:
        sys.exit("Nie znaleziono wolnego portu / no free port found.")
    url = "http://127.0.0.1:%d/" % server.server_address[1]
    print("Course is running on this computer:  %s" % url)
    if args.lan:
        ip = lan_ip()
        print("\nOn your phone or tablet (same Wi-Fi), open:\n\n    http://%s:%d/?k=%s\n" % (ip, server.server_address[1], LAN["key"]))
        print("Keep that link private: it lets a device read the course and run code here.")
        print("The link stays the same next time. Delete progress/lan-key.txt to make a new one.")
        print("If the phone cannot connect, allow Python through this computer's firewall on private networks.")
    print("Ctrl+C to stop.")
    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nZatrzymano / stopped.")


if __name__ == "__main__":
    main()
