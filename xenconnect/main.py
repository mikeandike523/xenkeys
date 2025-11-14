#!/usr/bin/env python3
import time
import threading
from typing import Sequence, Optional, Set

import click
import mido
from flask import Flask, request
from flask_socketio import SocketIO, emit, disconnect

DEFAULT_PORT_NAME = "Python MIDI Generator"
DEFAULT_SOCKET_PORT = 5072

# ----------------------------- MIDI HELPERS ----------------------------- #


def open_midi_port(port_name: Optional[str] = None) -> mido.ports.BaseOutput:
    """Open a MIDI output port.

    On Windows this will typically be a loopMIDI / hardware device.
    On macOS/Linux you can still route to IAC/ALSA virtual cables.

    If ``port_name`` is given, we first try an exact match. If that fails,
    we look for the first port whose *name starts with* ``port_name``.
    This is useful for drivers that append an index (e.g. "Foo 1").
    """
    outputs = mido.get_output_names()

    if not outputs:
        raise RuntimeError("No MIDI output ports available.")

    if port_name:
        # 1) Try to find an exact match
        for name in outputs:
            if name == port_name:
                return mido.open_output(name)

        # 2) Fall back to prefix match (case-insensitive)
        prefix_matches = [
            name for name in outputs
            if name.lower().startswith(port_name.lower())
        ]
        if prefix_matches:
            chosen = prefix_matches[0]
            click.echo(
                f"Requested MIDI output '{port_name}' not found exactly; "
                f"using first prefix match: '{chosen}'"
            )
            return mido.open_output(chosen)

        # 3) Nothing matched at all
        raise RuntimeError(
            f"MIDI output '{port_name}' not found (no exact or prefix match).\n"\
            f"Available outputs:\n" + "\n".join(outputs)
        )

    # No explicit name: just use the first one
    click.echo("No --port-name provided, using first available MIDI output:")
    for i, name in enumerate(outputs):
        click.echo(f"  [{i}] {name}")
    return mido.open_output(outputs[0])



def send_note_on(outport: mido.ports.BaseOutput,
                 note: int,
                 velocity: int = 127,
                 channel: int = 0,
                 lock: Optional[threading.Lock] = None) -> None:
    """Send a MIDI Note On message."""
    msg = mido.Message(
        "note_on",
        note=note,
        velocity=velocity,
        channel=channel,
    )
    if lock:
        with lock:
            outport.send(msg)
    else:
        outport.send(msg)



def send_note_off(outport: mido.ports.BaseOutput,
                  note: int,
                  velocity: int = 0,
                  channel: int = 0,
                  lock: Optional[threading.Lock] = None) -> None:
    """Send a MIDI Note Off message."""
    msg = mido.Message(
        "note_off",
        note=note,
        velocity=velocity,
        channel=channel,
    )
    if lock:
        with lock:
            outport.send(msg)
    else:
        outport.send(msg)



def play_test_sequence(outport: mido.ports.BaseOutput,
                       notes: Sequence[int],
                       bpm: float = 120.0,
                       channel: int = 0,
                       velocity: int = 127,
                       lock: Optional[threading.Lock] = None) -> None:
    """Loop over the given MIDI note numbers at the given BPM.

    Each beat:
      - Note On at full velocity
      - Hold for 90% of the beat
      - Note Off for the remaining 10%
    """
    if not notes:
        raise ValueError("Test sequence cannot be empty.")

    seconds_per_beat = 60.0 / bpm
    note_length = seconds_per_beat * 0.9  # leave a small gap

    click.echo(
        f"Playing test sequence on virtual port '{outport.name}' at {bpm} BPM.\n"
        f"Notes: {list(notes)}\n"
        "Press Ctrl+C to stop."
    )

    i = 0
    try:
        while True:
            note = notes[i % len(notes)]
            send_note_on(outport, note=note, velocity=velocity, channel=channel, lock=lock)
            time.sleep(note_length)
            send_note_off(outport, note=note, velocity=0, channel=channel, lock=lock)
            time.sleep(seconds_per_beat - note_length)
            i += 1
    except KeyboardInterrupt:
        # Make sure all notes are off when we stop
        for note in set(notes):
            send_note_off(outport, note=note, velocity=0, channel=channel, lock=lock)
        click.echo("\nStopped test sequence.")


# -------------------------- SOCKET.IO SERVER --------------------------- #

app = Flask(__name__)
# Use default async_mode (eventlet/gevent/threading); you can force one if needed.
socketio = SocketIO(app, cors_allowed_origins="*")

# MIDI + auth state shared across handlers
_outport: Optional[mido.ports.BaseOutput] = None
_midi_lock: Optional[threading.Lock] = None
_password: Optional[str] = None

# single-client semantics
_first_client_lock = threading.Lock()
_first_client_sid: Optional[str] = None
_authed_sids: Set[str] = set()


def _validate_midi_params(data: dict) -> tuple[int, int, int]:
    """Extract and validate note / velocity / channel from JSON-like payload."""
    try:
        note = int(data.get("note"))
        velocity = int(data.get("velocity", 127))
        channel = int(data.get("channel", 0))
    except Exception as exc:  # noqa: BLE001 - we want any failure here
        raise ValueError(f"Invalid numeric parameters: {exc}") from exc

    if not (0 <= note <= 127):
        raise ValueError("note out of range (0-127)")
    if not (0 <= velocity <= 127):
        raise ValueError("velocity out of range (0-127)")
    if not (0 <= channel <= 15):
        raise ValueError("channel out of range (0-15)")

    return note, velocity, channel


def _require_ready() -> None:
    if _outport is None:
        raise RuntimeError("MIDI output port is not initialized on the server.")


def _require_auth() -> None:
    """Enforce password + single-client semantics for the current sid."""
    global _first_client_sid

    sid = request.sid

    # Enforce single authenticated client
    with _first_client_lock:
        if _first_client_sid is not None and _first_client_sid != sid:
            raise PermissionError(
                "Server is already connected to another client. "
                "Restart the server to accept a new connection."
            )

    # If no password configured, first connected client is implicitly authed
    if _password is None:
        if sid not in _authed_sids:
            with _first_client_lock:
                if _first_client_sid is None:
                    _first_client_sid = sid
            _authed_sids.add(sid)
        return

    # Password-protected: must have successfully called 'auth'
    if sid not in _authed_sids:
        raise PermissionError("Client is not authenticated. Call 'auth' first.")


@socketio.on("connect")
def handle_connect():  # type: ignore[no-untyped-def]
    """New client connection.

    We don't fully lock in the client until it authenticates or sends events.
    If we already have an active client, we reject here.
    """
    global _first_client_sid

    sid = request.sid
    click.echo(f"[socketio] Client connected: {sid}")

    with _first_client_lock:
        if _first_client_sid is not None and _first_client_sid != sid:
            # Reject additional clients
            emit(
                "error",
                {
                    "type": "capacity",
                    "message": (
                        "Server already connected to another client. "
                        "Restart the server to accept a new connection."
                    ),
                },
            )
            # returning False from a connect handler tells Socket.IO
            # to reject the connection.
            return False

    emit(
        "welcome",
        {
            "auth_required": _password is not None,
            "message": "MIDI Socket.IO server ready.",
        },
    )


@socketio.on("disconnect")
def handle_disconnect():  # type: ignore[no-untyped-def]
    global _first_client_sid
    sid = request.sid
    click.echo(f"[socketio] Client disconnected: {sid}")

    _authed_sids.discard(sid)
    with _first_client_lock:
        if _first_client_sid == sid:
            _first_client_sid = None


@socketio.on("auth")
def handle_auth(data):  # type: ignore[no-untyped-def]
    """Client authentication.

    Payload:
        {"password": "..."}

    If no password is configured server-side, this is effectively a no-op,
    but we still acknowledge it.
    """
    global _first_client_sid

    sid = request.sid
    supplied = None if data is None else data.get("password")

    if _password is None:
        # No password required; mark as authed and possibly first client
        _authed_sids.add(sid)
        with _first_client_lock:
            if _first_client_sid is None:
                _first_client_sid = sid
        emit("auth_ok", {"auth_required": False})
        click.echo(f"[socketio] Client {sid} marked as authenticated (no password).")
        return

    if supplied == _password:
        # successful auth
        with _first_client_lock:
            if _first_client_sid is None:
                _first_client_sid = sid
            elif _first_client_sid != sid:
                emit(
                    "auth_error",
                    {
                        "message": (
                            "Server is already connected to another client. "
                            "Restart the server to accept a new connection."
                        )
                    },
                )
                disconnect()
                return
        _authed_sids.add(sid)
        emit("auth_ok", {"auth_required": True})
        click.echo(f"[socketio] Client {sid} authenticated.")
    else:
        emit("auth_error", {"message": "Invalid password."})
        click.echo(f"[socketio] Client {sid} failed authentication.")
        disconnect()


@socketio.on("note_on")
def handle_note_on(data):  # type: ignore[no-untyped-def]
    """Handle a 'note_on' event.

    Expected payload (JSON-like dict):
        {"note": 60, "velocity": 127, "channel": 0}
    """
    try:
        _require_ready()
        _require_auth()
        if data is None:
            raise ValueError("Missing payload body.")

        note, velocity, channel = _validate_midi_params(data)
        send_note_on(_outport, note=note, velocity=velocity, channel=channel, lock=_midi_lock)
        emit("ack", {"event": "note_on", "ok": True})

    except PermissionError as exc:
        emit("error", {"type": "auth", "event": "note_on", "message": str(exc)})
    except Exception as exc:  # noqa: BLE001
        emit("error", {"type": "runtime", "event": "note_on", "message": str(exc)})


@socketio.on("note_off")
def handle_note_off(data):  # type: ignore[no-untyped-def]
    """Handle a 'note_off' event.

    Expected payload (JSON-like dict):
        {"note": 60, "velocity": 0, "channel": 0}
    """
    try:
        _require_ready()
        _require_auth()
        if data is None:
            raise ValueError("Missing payload body.")

        note, velocity, channel = _validate_midi_params(data)
        send_note_off(_outport, note=note, velocity=velocity, channel=channel, lock=_midi_lock)
        emit("ack", {"event": "note_off", "ok": True})

    except PermissionError as exc:
        emit("error", {"type": "auth", "event": "note_off", "message": str(exc)})
    except Exception as exc:  # noqa: BLE001
        emit("error", {"type": "runtime", "event": "note_off", "message": str(exc)})


def start_socketio_server(host: str,
                          port: int,
                          outport: mido.ports.BaseOutput,
                          lock: threading.Lock,
                          password: Optional[str]) -> None:
    """Start the Socket.IO server for MIDI events in a background thread.

    Exposes these Socket.IO events on the default namespace ('/'):

      - 'welcome' (server -> client)
          {"auth_required": bool, "message": str}

      - 'auth' (client -> server)
          {"password": str}

      - 'auth_ok' (server -> client)
          {"auth_required": bool}

      - 'auth_error' (server -> client)
          {"message": str}

      - 'note_on' (client -> server)
          {"note": int, "velocity": int, "channel": int}

      - 'note_off' (client -> server)
          {"note": int, "velocity": int, "channel": int}

      - 'ack' (server -> client)
          {"event": "note_on" | "note_off", "ok": true}

      - 'error' (server -> client)
          {"type": "auth"|"capacity"|"runtime", "event"?: str, "message": str}
    """
    global _outport, _midi_lock, _password

    _outport = outport
    _midi_lock = lock
    _password = password

    def run_server() -> None:
        click.echo(f"[socketio] Listening on http://{host}:{port} (Socket.IO)")
        # debug=False and use_reloader=False so it plays nicely with CLI tools
        socketio.run(app, host=host, port=port, debug=False, use_reloader=False)

    t = threading.Thread(target=run_server, daemon=True)
    t.start()


# ----------------------------- CLI ENTRYPOINT ---------------------------- #


@click.command()
@click.option(
    "--port-name",
    "-p",
    default=None,
    help=(
        "Name or prefix of the MIDI output port to use "
        "(e.g. 'Python MIDI Generator'). "
        "If omitted, the first available output port is used."
    ),
)
@click.option(
    "--list-ports",
    is_flag=True,
    help="List available MIDI output ports and exit.",
)
@click.option(
    "--bpm",
    default=120.0,
    show_default=True,
    type=float,
    help="Tempo in beats per minute for the test sequence.",
)
@click.option(
    "--channel",
    default=0,
    show_default=True,
    type=click.IntRange(0, 15),
    help="MIDI channel (0–15) for the test sequence.",
)
@click.option(
    "--velocity",
    default=127,
    show_default=True,
    type=click.IntRange(0, 127),
    help="Velocity for test notes.",
)
@click.option(
    "--test-seq",
    "-t",
    multiple=True,
    type=click.IntRange(0, 127),
    help=(
        "Test sequence of MIDI note numbers to cycle through, one per flag. "
        "Example: -t 60 -t 62 -t 64"
    ),
)
@click.option(
    "--socket-port",
    "-s",
    default=DEFAULT_SOCKET_PORT,
    show_default=True,
    type=int,
    help="TCP port for the Socket.IO MIDI server.",
)
@click.option(
    "--socket-host",
    default="127.0.0.1",
    show_default=True,
    help="Host/IP address on which to bind the Socket.IO server.",
)
@click.option(
    "--password",
    default=None,
    help=(
        "Password required for Socket.IO clients (sent via 'auth' event). "
        "If omitted, no authentication is required."
    ),
)
def main(port_name,
         list_ports,
         bpm,
         channel,
         velocity,
         test_seq,
         socket_port,
         socket_host,
         password):
    """Create a virtual MIDI device, optionally play a test sequence,
    and start a Socket.IO server for remote MIDI events.

    Socket.IO protocol (JSON-like events, default namespace '/'): 

      - Client connects (built-in 'connect' event)
      - Server emits 'welcome':

            {"auth_required": bool, "message": str}

      - If a password is configured, client must emit 'auth':

            socket.emit('auth', { password: 'your-password' })

      - Sending notes:

            socket.emit('note_on', { note: 60, velocity: 127, channel: 0 })
            socket.emit('note_off', { note: 60, velocity: 0,   channel: 0 })

      - On success, server emits 'ack':

            {"event": "note_on" | "note_off", "ok": true}

      - On error, server emits 'error':

            {"type": "auth"|"capacity"|"runtime", "event"?: str, "message": str}
    """
    # List MIDI ports and exit if requested
    if list_ports:
        outputs = mido.get_output_names()
        if not outputs:
            click.echo("No MIDI output ports available.")
        else:
            click.echo("Available MIDI output ports:")
            for i, name in enumerate(outputs):
                click.echo(f"  [{i}] {name}")
        return

    outport = open_midi_port(port_name)
    click.echo(f"Opened MIDI output port: '{outport.name}'")
    click.echo(
        "In your DAW (e.g. Reaper), choose this as a MIDI input device "
        "for a track to receive events."
    )

    midi_lock = threading.Lock()

    # Start Socket.IO server
    start_socketio_server(socket_host, socket_port, outport, midi_lock, password)

    # If a test sequence is specified, run it in the foreground
    if test_seq:
        notes = list(test_seq)
        play_test_sequence(
            outport,
            notes=notes,
            bpm=bpm,
            channel=channel,
            velocity=velocity,
            lock=midi_lock,
        )
    else:
        click.echo(
            "No test sequence provided. "
            "Virtual MIDI port and Socket.IO server will stay active. "
            "Press Ctrl+C to exit."
        )
        try:
            while True:
                time.sleep(1.0)
        except KeyboardInterrupt:
            click.echo("\nShutting down.")


if __name__ == "__main__":
    main()
