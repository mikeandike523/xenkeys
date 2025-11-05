# app.py
# pip install flask flask-socketio eventlet
import os
import uuid
import time
import socket
from typing import Dict, Set
from flask import Flask, request
from flask_socketio import SocketIO, join_room, leave_room, emit
from flask import jsonify
import random
import string
from datetime import datetime, timedelta

# -----------------------------
# Config: single source of truth
# -----------------------------
PORT = int(os.getenv("PORT", "8080"))  # HTTP & WS share this port

app = Flask(__name__)
app.config["SECRET_KEY"] = "dev-on-trusted-lan"
socketio = SocketIO(app, cors_allowed_origins="*")  # WS with CORS for LAN

INVITES: Dict[str, Dict] = {}  # code -> {room,password,created,approved,denied,requested_by}
INVITE_TTL = timedelta(minutes=10)


def _rand_invite_code() -> str:
    # 6 chars A-Z + 0-9, easy to read (omit ambiguous if desired)
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choice(alphabet) for _ in range(6))

def _expire_invites_now():
    now = datetime.utcnow()
    for code, rec in list(INVITES.items()):
        if now - rec["created"] > INVITE_TTL:
            INVITES.pop(code, None)

# -----------------------------
# Manual CORS (fallback when built-in helpers misbehave)
# -----------------------------
CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",  # cache preflight for 24h
}

@app.before_request
def _handle_preflight_options():
    # Short-circuit CORS preflight early with no body
    if request.method == "OPTIONS":
        return "", 204, CORS_HEADERS

@app.after_request
def _add_cors_headers(resp):
    # Attach CORS headers to all responses
    for k, v in CORS_HEADERS.items():
        # Max-Age only relevant for preflight; harmless but you can skip if desired
        resp.headers[k] = v
    return resp


def _rand_room() -> str:
    # human-ish short id
    return "room-" + uuid.uuid4().hex[:6]


def _rand_password() -> str:
    # short demo secret (not for production)
    return uuid.uuid4().hex[:8]



# -----------------------------
# Network / host helpers
# -----------------------------

def _primary_ip() -> str:
    """Best-effort LAN IP (does not send traffic)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        # Using a public resolver as a routing hint; no packets are sent on connect()
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        try:
            s.close()
        except Exception:
            pass
    return ip


def _all_ipv4() -> Set[str]:
    """All IPv4s we can discover for this host (best-effort)."""
    ips: Set[str] = set()
    try:
        hostname = socket.gethostname()
        for fam, _, _, _, sockaddr in socket.getaddrinfo(hostname, None):
            if fam == socket.AF_INET:
                ips.add(sockaddr[0])
    except Exception:
        pass
    # Always include loopback & primary discovery
    ips.add("127.0.0.1")
    ips.add(_primary_ip())
    return ips


def network_info():
    hostname = socket.gethostname()
    fqdn = socket.getfqdn()
    primary_ip = _primary_ip()
    ips = sorted(_all_ipv4())
    # Prefer request context values when available
    server_port = None
    server_host = None
    try:
        if request:  # may not exist outside request context
            server_port = request.environ.get("SERVER_PORT")
            server_host = request.host  # e.g., "192.168.1.10:8080"
    except RuntimeError:
        pass

    return {
        "hostname": hostname,
        "fqdn": fqdn,
        "primary_ip": primary_ip,
        "all_ips": ips,
        # Single source of truth for our listener:
        "configured_port": PORT,
        # Request-context hints (may be None outside requests):
        "server_port": int(server_port) if server_port else None,
        "host_header": server_host,
        "http_base": (request.host_url if request else None),
    }


# -----------------------------
# In-memory state (trusted LAN)
# -----------------------------
class RoomState:
    def __init__(self, name: str, password: str):
        self.name = name
        self.password = password
        self.members: Set[str] = set()          # client_ids that joined
        self.subs: Dict[str, Set[str]] = {}     # sid -> channels set, or {"*"}
        self.sid_to_client: Dict[str, str] = {} # sid -> client_id


ROOMS: Dict[str, RoomState] = {}                # room_name -> RoomState


def require_room(name: str) -> RoomState:
    room = ROOMS.get(name)
    if not room:
        raise KeyError("room_not_found")
    return room


def check_password(room: RoomState, password: str):
    if room.password != password:
        raise PermissionError("bad_password")


# -----------------
# HTTP health/info
# -----------------
@app.get("/health")
def health():
    info = network_info()
    return {"status": "ok", "time": time.time(), "net": info}


@app.get("/whoami")
def whoami():
    return network_info()


@app.post("/connection")
def connection():
    """
    Minimal HTTP endpoint the frontend can call to get:
      - room name (created if missing)
      - password (random if new)
      - host/network info (ip/hostname/port)
    Body: {"role": "sender" | "receiver", "room": "optional-explicit-name"}
    """
    data = (request.get_json(silent=True) or {})
    role = (data.get("role") or "peer").lower()
    requested_room = (data.get("room") or "").strip()

    # Find-or-create a room
    if requested_room:
        room_name = requested_room
        room = ROOMS.get(room_name)
        if not room:
            room = RoomState(room_name, _rand_password())
            ROOMS[room_name] = room
    else:
        room_name = _rand_room()
        room = RoomState(room_name, _rand_password())
        ROOMS[room_name] = room

    net = network_info()
    payload = {
        "status": "ok",
        "role": role,
        "room": room_name,
        "password": room.password,
        "net": {
            "hostname": net["hostname"],
            "fqdn": net["fqdn"],
            "primary_ip": net["primary_ip"],
            "all_ips": net["all_ips"],
            "port": net["configured_port"],
            "http_base": net["http_base"],
        },
    }
    return jsonify(payload), 200

# === Join-code endpoints ===

@app.post("/invite/start")
def invite_start():
    """
    Receiver creates an ephemeral invite code and a private room/password.
    Returns: { code, room, password, net }
    """

    print("/invite/start called")

    data = (request.get_json(silent=True) or {})
    # Optionally accept requested room; otherwise random like /connection
    requested_room = (data.get("room") or "").strip()

    # create/find room (mirrors /connection)
    if requested_room:
        room_name = requested_room
        room = ROOMS.get(room_name)
        if not room:
            room = RoomState(room_name, _rand_password())
            ROOMS[room_name] = room
    else:
        room_name = _rand_room()
        room = RoomState(room_name, _rand_password())
        ROOMS[room_name] = room

    # generate/record invite
    _expire_invites_now()
    code = _rand_invite_code()
    INVITES[code] = {
        "room": room_name,
        "password": room.password,
        "created": datetime.utcnow(),
        "approved": False,
        "denied": False,
        "requested_by": None,   # filled by redeem
    }

    net = network_info()
    return jsonify({
        "status": "ok",
        "code": code,
        "room": room_name,
        "password": room.password,
        "net": {
            "hostname": net["hostname"],
            "fqdn": net["fqdn"],
            "primary_ip": net["primary_ip"],
            "all_ips": net["all_ips"],
            "port": net["configured_port"],
            "http_base": net["http_base"],
        },
    }), 200


@app.post("/invite/redeem")
def invite_redeem():
    """
    Sender calls this on the receiver's host to ask for access by code.
    Body: { code, sender_label? }
    Returns when approved:
      { status:"approved", room, password }
    While waiting:
      { status:"pending" }
    If denied/expired/invalid:
      { status:"denied" } or 404
    """
    _expire_invites_now()
    data = (request.get_json(silent=True) or {})
    code = (data.get("code") or "").strip().upper()
    sender_label = (data.get("sender_label") or "").strip()

    rec = INVITES.get(code)
    if not rec:
        return jsonify({"error": "invalid_or_expired"}), 404

    # record who asked (best-effort)
    if rec["requested_by"] is None:
        rec["requested_by"] = {
            "ip": request.remote_addr,
            "label": sender_label or "",
            "ts": time.time(),
        }

    if rec["denied"]:
        return jsonify({"status": "denied"}), 200
    if not rec["approved"]:
        return jsonify({"status": "pending"}), 200

    # approved → deliver secrets and burn the invite (single-use)
    payload = {"status": "approved", "room": rec["room"], "password": rec["password"]}
    INVITES.pop(code, None)
    return jsonify(payload), 200


@app.get("/invite/status")
def invite_status():
    """
    Receiver/Sender can poll status for a code (receiver to show pending, sender to wait).
    Query: ?code=ABC123
    Returns: { status: "idle"|"pending"|"approved"|"denied", requested_by?: {...} }
    """
    _expire_invites_now()
    code = ((request.args.get("code") or "").strip().upper())
    rec = INVITES.get(code)
    if not rec:
        return jsonify({"status": "denied"}), 200  # treat missing as denied/expired

    if rec["denied"]:
        return jsonify({"status": "denied"}), 200
    if rec["approved"]:
        return jsonify({"status": "approved"}), 200
    if rec["requested_by"] is None:
        return jsonify({"status": "idle"}), 200
    return jsonify({"status": "pending", "requested_by": rec["requested_by"]}), 200


@app.post("/invite/decision")
def invite_decision():
    """
    Receiver approves or denies a pending request.
    Body: { code, accept: boolean }
    """
    _expire_invites_now()
    data = (request.get_json(silent=True) or {})
    code = (data.get("code") or "").strip().upper()
    accept = bool(data.get("accept"))

    rec = INVITES.get(code)
    if not rec:
        return jsonify({"error": "invalid_or_expired"}), 404

    if accept:
        rec["approved"] = True
        return jsonify({"status": "approved"}), 200
    else:
        rec["denied"] = True
        return jsonify({"status": "denied"}), 200


# -------------
# Socket.IO API
# -------------
@socketio.on("whoami")
def whoami_event():
    """Emit host/IP/port info over Socket.IO for the caller."""
    emit("whoami", network_info())


@socketio.on("create_room")
def create_room(data):
    name = (data or {}).get("room")
    password = (data or {}).get("password")
    if not name or not password:
        return emit("error", {"error": "room and password required"})
    if name in ROOMS:
        return emit("error", {"error": "room_exists"})
    ROOMS[name] = RoomState(name, password)
    emit("room_created", {"room": name})


@socketio.on("join")
def join(data):
    room_name = (data or {}).get("room")
    password  = (data or {}).get("password")
    client_id = (data or {}).get("client_id") or str(uuid.uuid4())
    if not room_name or not password:
        return emit("error", {"error": "room and password required"})
    try:
        room = require_room(room_name)
        check_password(room, password)
    except KeyError:
        return emit("error", {"error": "room_not_found"})
    except PermissionError:
        return emit("error", {"error": "bad_password"})

    # Record membership & join Socket.IO room
    room.members.add(client_id)
    room.sid_to_client[request.sid] = client_id
    join_room(room_name)
    emit("joined", {"room": room_name, "client_id": client_id, "net": network_info()})


@socketio.on("leave")
def leave(data):
    room_name = (data or {}).get("room")
    try:
        room = require_room(room_name)
    except KeyError:
        return
    sid = request.sid
    client_id = room.sid_to_client.pop(sid, None)
    room.subs.pop(sid, None)
    leave_room(room_name)
    if client_id and client_id in room.members:
        room.members.remove(client_id)
    emit("left", {"room": room_name})


@socketio.on("subscribe")
def subscribe(data):
    """
    Subscribe caller to channels in a room.
    data: {room, channels: ["a","b"] or ["*"]}
    Caller must have joined first.
    """
    room_name = (data or {}).get("room")
    channels  = set((data or {}).get("channels") or ["*"])
    try:
        room = require_room(room_name)
    except KeyError:
        return emit("error", {"error": "room_not_found"})
    if request.sid not in room.sid_to_client:
        return emit("error", {"error": "not_joined"})
    # Normalize "*" subscription
    room.subs[request.sid] = {"*"} if "*" in channels or not channels else channels
    emit("subscribed", {"room": room_name, "channels": list(room.subs[request.sid])})


@socketio.on("publish")
def publish(data):
    """
    Publish a message to a room on a given channel.
    data: {room, password, client_id, channel, message}
    Only delivers to subscribers whose channel set matches.
    """
    room_name = (data or {}).get("room")
    password  = (data or {}).get("password")
    client_id = (data or {}).get("client_id")
    channel   = ((data or {}).get("channel") or "").strip()
    text      = (data or {}).get("message")

    if not all([room_name, password, client_id, channel, text]):
        return emit("error", {"error": "room,password,client_id,channel,message required"})

    try:
        room = require_room(room_name)
        check_password(room, password)
    except KeyError:
        return emit("error", {"error": "room_not_found"})
    except PermissionError:
        return emit("error", {"error": "bad_password"})

    if client_id not in room.members:
        return emit("error", {"error": "not_joined"})

    payload = {
        "type": "message",
        "room": room_name,
        "channel": channel,
        "from": client_id,
        "text": text,
        "ts": time.time(),
        "id": str(uuid.uuid4()),
    }

    # Deliver only to matching subscribers in this room
    # (filtering instead of broadcasting whole-room)
    delivered = 0
    for sid, chset in list(room.subs.items()):
        if "*" in chset or channel in chset:
            socketio.emit("message", payload, to=sid)
            delivered += 1

    emit("published", {"status": "ok", "delivered": delivered, "id": payload["id"]})


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    # Clean up from any rooms
    for room in ROOMS.values():
        room.subs.pop(sid, None)
        cid = room.sid_to_client.pop(sid, None)
        if cid and cid in room.members:
            room.members.remove(cid)


# -----------------------------
# Startup logging
# -----------------------------

def _log_startup_banner():
    info = {
        **network_info(),
        "http_examples": [
            f"http://127.0.0.1:{PORT}/health",
            f"http://{_primary_ip()}:{PORT}/health",
        ],
    }
    print("\n=== Server Network Info ===")
    for k, v in info.items():
        print(f"{k}: {v}")
    print("==========================\n")


if __name__ == "__main__":
    # eventlet provides efficient WS; good for LAN demos
    # You can also use socketio.run(app, host="0.0.0.0", port=PORT, debug=True)
    _log_startup_banner()
    socketio.run(app, host="0.0.0.0", port=PORT)
