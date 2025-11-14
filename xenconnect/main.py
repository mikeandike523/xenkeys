#!/usr/bin/env python3
import time
import socket
import threading
from typing import Sequence, Optional

import click
import mido

DEFAULT_PORT_NAME = "Python MIDI Generator"
DEFAULT_SOCKET_PORT = 5072


def open_virtual_port(port_name: str = DEFAULT_PORT_NAME) -> mido.ports.BaseOutput:
    """\
    Open a virtual MIDI output port that DAWs can see as an input device.
    """
    try:
        outport = mido.open_output(port_name, virtual=True)
    except TypeError:
        outport = mido.open_output(port_name)
    return outport


def send_note_on(outport: mido.ports.BaseOutput,
                 note: int,
                 velocity: int = 127,
                 channel: int = 0,
                 lock: Optional[threading.Lock] = None) -> None:
    """\
    Send a MIDI Note On message.
    """
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
    """\
    Send a MIDI Note Off message.
    """
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
    """\
    Loop over the given MIDI note numbers at the given BPM.

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


# ----------------------------- SOCKET SERVER ----------------------------- #


def handle_client(conn: socket.socket,
                  addr,
                  outport: mido.ports.BaseOutput,
                  lock: threading.Lock,
                  password: Optional[str]) -> None:
    """\
    Handle a single client connection.

    Simple line-based protocol (UTF-8, newline-terminated):

        First, if password is set:
            PASS <password>

        After successful auth:
            NOTE_ON <note> <velocity> [channel]
            NOTE_OFF <note> <velocity> [channel]
            QUIT

    Examples:
        NOTE_ON 60 127 0
        NOTE_OFF 60 0 0
    """
    conn_file = conn.makefile("rwb", buffering=0)
    authed = False if password else True

    def send_line(text: str) -> None:
        try:
            conn_file.write((text + "\n").encode("utf-8"))
        except OSError:
            pass

    click.echo(f"[socket] Client connected from {addr}")

    try:
        if password:
            send_line("WELCOME: send 'PASS <password>' to authenticate")
        else:
            send_line("WELCOME: no password required")

        while True:
            line_bytes = conn_file.readline()
            if not line_bytes:
                break
            line = line_bytes.decode("utf-8", errors="ignore").strip()
            if not line:
                continue

            # Authentication
            if not authed:
                parts = line.split(maxsplit=1)
                if len(parts) == 2 and parts[0].upper() == "PASS":
                    if parts[1] == password:
                        authed = True
                        send_line("OK AUTH")
                        click.echo(f"[socket] Client {addr} authenticated")
                    else:
                        send_line("ERR AUTH")
                        click.echo(f"[socket] Client {addr} failed auth")
                        break
                else:
                    send_line("ERR Need 'PASS <password>'")
                continue

            # After auth: handle commands
            parts = line.split()
            cmd = parts[0].upper()

            if cmd == "QUIT":
                send_line("OK BYE")
                break

            elif cmd in ("NOTE_ON", "NOTE_OFF"):
                if len(parts) < 3:
                    send_line("ERR Usage: NOTE_ON <note> <velocity> [channel]")
                    continue
                try:
                    note = int(parts[1])
                    velocity = int(parts[2])
                    channel = int(parts[3]) if len(parts) >= 4 else 0

                    if not (0 <= note <= 127):
                        raise ValueError("note out of range")
                    if not (0 <= velocity <= 127):
                        raise ValueError("velocity out of range")
                    if not (0 <= channel <= 15):
                        raise ValueError("channel out of range")
                except Exception as e:
                    send_line(f"ERR Bad params: {e}")
                    continue

                if cmd == "NOTE_ON":
                    send_note_on(outport, note=note, velocity=velocity,
                                 channel=channel, lock=lock)
                else:
                    send_note_off(outport, note=note, velocity=velocity,
                                  channel=channel, lock=lock)

                send_line("OK")
            else:
                send_line("ERR Unknown command")

    except Exception as e:
        click.echo(f"[socket] Error with client {addr}: {e}")
    finally:
        click.echo(f"[socket] Client disconnected {addr}")
        try:
            conn_file.close()
        except Exception:
            pass
        try:
            conn.close()
        except Exception:
            pass


def start_socket_server(host: str,
                        port: int,
                        outport: mido.ports.BaseOutput,
                        lock: threading.Lock,
                        password: Optional[str]) -> None:
    """\
    Start a simple multi-client TCP server for MIDI events.
    """
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((host, port))
    srv.listen(5)

    click.echo(f"[socket] Listening on {host}:{port}")

    def accept_loop():
        while True:
            try:
                conn, addr = srv.accept()
            except OSError:
                break
            t = threading.Thread(
                target=handle_client,
                args=(conn, addr, outport, lock, password),
                daemon=True,
            )
            t.start()

    t = threading.Thread(target=accept_loop, daemon=True)
    t.start()


# ----------------------------- CLI ENTRYPOINT ---------------------------- #


@click.command()
@click.option(
    "--port-name",
    "-p",
    default=DEFAULT_PORT_NAME,
    show_default=True,
    help="Name of the virtual MIDI output port.",
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
    help="TCP port for the MIDI command socket server.",
)
@click.option(
    "--socket-host",
    default="127.0.0.1",
    show_default=True,
    help="Host/IP address on which to bind the socket server.",
)
@click.option(
    "--password",
    default=None,
    help="Password required for socket clients (sent as 'PASS <password>'). "
         "If omitted, no authentication is required.",
)
def main(port_name,
         bpm,
         channel,
         velocity,
         test_seq,
         socket_port,
         socket_host,
         password):
    """\
    Create a virtual MIDI device, optionally play a test sequence,
    and start a socket server for remote MIDI events.

    Socket protocol (TCP, line-based):

        PASS <password>          # only if a password is configured
        NOTE_ON <note> <velocity> [channel]
        NOTE_OFF <note> <velocity> [channel]
        QUIT
    """
    outport = open_virtual_port(port_name)
    click.echo(f"Opened virtual MIDI output port: '{outport.name}'")
    click.echo(
        "In your DAW (e.g. Reaper), choose this as a MIDI input device "
        "for a track to receive events."
    )

    midi_lock = threading.Lock()

    # Start socket server
    start_socket_server(socket_host, socket_port, outport, midi_lock, password)

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
            "Virtual MIDI port and socket server will stay active. "
            "Press Ctrl+C to exit."
        )
        try:
            while True:
                time.sleep(1.0)
        except KeyboardInterrupt:
            click.echo("\nShutting down.")


if __name__ == "__main__":
    main()
