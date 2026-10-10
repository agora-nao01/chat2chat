
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import sqlite3
import time
from urllib.parse import parse_qs, urlsplit

HOST = "0.0.0.0"
PORT = 8765

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "chat2chat.db")
BACKUP_PATH = os.path.join(BASE_DIR, "messages_backup.json")

MAX_NAME_LENGTH = 32
MAX_MESSAGE_LENGTH = 2000
MAX_REQUEST_SIZE = 10000


def load_project_env():
    env_path = os.path.join(os.path.dirname(BASE_DIR), ".env")
    try:
        with open(env_path, "r", encoding="utf-8") as env_file:
            for line in env_file:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                name, value = line.split("=", 1)
                name = name.strip()
                value = value.strip().strip("\"'")
                if name:
                    os.environ.setdefault(name, value)
    except FileNotFoundError:
        pass


load_project_env()
KLIPY_API_KEY = os.environ.get("KLIPY_API_KEY", "").strip()


def connect_db():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    with connect_db() as db:
        db.execute("PRAGMA journal_mode=WAL")

        db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                content TEXT NOT NULL,
                time INTEGER NOT NULL
            )
        """)

        columns = {
            row["name"] for row in db.execute(
                "PRAGMA table_info(messages)"
            ).fetchall()
        }
        if "room" not in columns:
            db.execute(
                "ALTER TABLE messages ADD COLUMN room TEXT NOT NULL DEFAULT 'main'"
            )

        count = db.execute(
            "SELECT COUNT(*) FROM messages"
        ).fetchone()[0]

        # Importa o backup apenas quando o banco está vazio.
        if count == 0 and os.path.isfile(BACKUP_PATH):
            try:
                with open(BACKUP_PATH, "r", encoding="utf-8") as file:
                    backup = json.load(file)

                imported = 0

                for message in backup.get("messages", []):
                    try:
                        message_id = int(message["id"])
                        name = str(message["name"]).strip()
                        content = str(message["content"]).strip()
                        timestamp = int(message["time"])

                        if message_id < 1:
                            continue

                        if not name or not content:
                            continue

                        if len(name) > MAX_NAME_LENGTH:
                            continue

                        if len(content) > MAX_MESSAGE_LENGTH:
                            continue

                        db.execute("""
                            INSERT OR IGNORE INTO messages
                                (id, name, content, time)
                            VALUES (?, ?, ?, ?)
                        """, (
                            message_id,
                            name,
                            content,
                            timestamp
                        ))

                        imported += 1

                    except (KeyError, TypeError, ValueError):
                        continue

                print(f"Backup importado: {imported} mensagens.")

            except (OSError, json.JSONDecodeError) as error:
                print(f"Não foi possível importar o backup: {error}")

        total = db.execute(
            "SELECT COUNT(*) FROM messages"
        ).fetchone()[0]

    print(f"Banco SQLite: {DB_PATH}")
    print(f"Mensagens armazenadas: {total}")


class ChatHandler(BaseHTTPRequestHandler):

    def requested_room(self):
        query = parse_qs(urlsplit(self.path).query)
        room = query.get("room", ["main"])[0]
        return room if room in ("main", "debug") else None

    @staticmethod
    def name_is_allowed(name, room, debug_client=False):
        is_dev = name.casefold().startswith("dev:")
        if room == "debug":
            return is_dev
        return not is_dev or debug_client

    def send_json(self, status, data):
        body = json.dumps(
            data, ensure_ascii=False
        ).encode("utf-8")

        self.send_response(status)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8"
        )
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS"
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()

        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Methods",
            "GET, POST, OPTIONS"
        )
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type"
        )
        self.end_headers()

    def do_GET(self):
        parsed_url = urlsplit(self.path)
        if parsed_url.path == "/klipy/config":
            self.send_json(200, {"apiKey": KLIPY_API_KEY})
            return

        if parsed_url.path != "/messages":
            self.send_json(404, {
                "error": "Endpoint not found"
            })
            return

        room = self.requested_room()
        if room is None:
            self.send_json(400, {"error": "Invalid room"})
            return

        try:
            with connect_db() as db:
                rows = db.execute("""
                    SELECT id, name, content, time
                    FROM messages
                    WHERE room = ?
                    ORDER BY id ASC
                """, (room,)).fetchall()

            messages = [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "content": row["content"],
                    "time": row["time"]
                }
                for row in rows
            ]

            self.send_json(200, {
                "messages": messages
            })

        except sqlite3.Error as error:
            print(f"Erro SQLite: {error}")
            self.send_json(500, {
                "error": "Database error"
            })

    def do_POST(self):
        if urlsplit(self.path).path != "/messages":
            self.send_json(404, {
                "error": "Endpoint not found"
            })
            return

        try:
            length = int(
                self.headers.get("Content-Length", "0")
            )

            if length <= 0 or length > MAX_REQUEST_SIZE:
                self.send_json(400, {
                    "error": "Invalid request size"
                })
                return

            raw_body = self.rfile.read(length)
            data = json.loads(raw_body.decode("utf-8"))

            if not isinstance(data, dict):
                self.send_json(400, {
                    "error": "Invalid JSON"
                })
                return

            name = data.get("name")
            content = data.get("content")

            if not isinstance(name, str):
                self.send_json(400, {
                    "error": "Invalid name"
                })
                return

            if not isinstance(content, str):
                self.send_json(400, {
                    "error": "Invalid message"
                })
                return

            name = name.strip()
            content = content.strip()
            room = data.get("room", "main")
            debug_client = data.get("debugClient", False) is True

            if room not in ("main", "debug"):
                self.send_json(400, {"error": "Invalid room"})
                return

            if not name or not content:
                self.send_json(400, {
                    "error": "Name and message are required"
                })
                return

            if len(name) > MAX_NAME_LENGTH:
                self.send_json(400, {
                    "error": "Name too long"
                })
                return

            if not self.name_is_allowed(name, room, debug_client):
                self.send_json(403, {
                    "error": "Names starting with dev: can post in the main room only from the debug version"
                    if room == "main"
                    else "Debug chat requires a name starting with dev:"
                })
                return

            if len(content) > MAX_MESSAGE_LENGTH:
                self.send_json(400, {
                    "error": "Message too long"
                })
                return

            timestamp = int(time.time())

            with connect_db() as db:
                cursor = db.execute("""
                    INSERT INTO messages (name, content, time, room)
                    VALUES (?, ?, ?, ?)
                """, (name, content, timestamp, room))

                message = {
                    "id": cursor.lastrowid,
                    "name": name,
                    "content": content,
                    "time": timestamp
                }

            self.send_json(201, {
                "message": message
            })

        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(400, {
                "error": "Invalid JSON"
            })

        except sqlite3.Error as error:
            print(f"Erro SQLite: {error}")
            self.send_json(500, {
                "error": "Database error"
            })

    def log_message(self, format, *args):
        print("[Chat2Chat]", format % args)


if __name__ == "__main__":
    init_db()
    print("KLIPY configurado." if KLIPY_API_KEY else
          "KLIPY sem chave: preencha KLIPY_API_KEY no .env.")

    print(f"Chat2Chat rodando em http://localhost:{PORT}")
    print("Pressione Ctrl+C para encerrar.")

    server = ThreadingHTTPServer((HOST, PORT), ChatHandler)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando Chat2Chat...")
    finally:
        server.server_close()
