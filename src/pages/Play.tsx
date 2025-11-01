import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ChangeEvent,
} from "react";
import {
  A,
  Button,
  Div,
  Header,
  Main,
  Option,
  Select,
  Span,
} from "style-props-html";
import { FaHome } from "react-icons/fa";

import { useElementRefBySelector } from "../hooks/fwk/useElementRefBySelector";
import { useElementSize } from "../hooks/fwk/useElementSize";
import { usePersistentState } from "../hooks/fwk/usePersistentState";

import CanvasKeyboard from "../components/CanvasKeyboard";
import { NumberStepper } from "../components/NumberStepper";
import type { Waveform, Envelope } from "../shared-types/audio-engine";
import Synth from "../audio/synth";
import { make12EDO } from "../data/edo-presets/12edo";
import { make22EDO } from "../data/edo-presets/22edo";
import { make19EDO } from "../data/edo-presets/19edo";
import { make24EDO } from "../data/edo-presets/24edo";
import { make31EDO } from "../data/edo-presets/31edo";
import { make36EDO } from "../data/edo-presets/36edo";
import { make41EDO } from "../data/edo-presets/41edo";
import { make48EDO } from "../data/edo-presets/48edo";
import { whiteKeyAspect } from "../data/piano-key-dimensions";
import { css } from "@emotion/react";
import Recorder, { type Recording } from "../audio/recorder";
import VolumeSlider from "../components/VolumeSlider";
import { connectSocket, joinRoom, subscribe, publish } from "../remote/socket";
import type { SettingsSyncPayload } from "../shared-types/remote";

const default12EdoManifest = make12EDO();
const default19EdoManifest = make19EDO();
const default22EdoManifest = make22EDO();
const default24EdoManifest = make24EDO();
const default31EdoManifest = make31EDO();
const default36EdoManifest = make36EDO();
const default41EdoManifest = make41EDO();
const default48EdoManifest = make48EDO();

const manifestPresets = {
  "12edo": default12EdoManifest,
  "19edo": default19EdoManifest,
  "22edo": default22EdoManifest,
  "24edo": default24EdoManifest,
  "31edo": default31EdoManifest,
  "36edo": default36EdoManifest,
  "41edo": default41EdoManifest,
  "48edo": default48EdoManifest,
};

const defaultEnvelope: Envelope = {
  attack: 0.01,
  decay: 0.1,
  sustain: 0.7,
  release: 0.5,
};

// --- Remote Play types/state (UI-first with stubbed logic) ---
type RemoteStatus =
  | "off"
  | "sender_armed"
  | "receiver_armed"
  | "connecting"
  | "connected"
  | "error";

type RemoteInfo = {
  ip: string;
  hostname: string;
  password: string; // Provided by backend alongside initial connection request
  room: string; // Provided by backend alongside initial connection request
};

type RemotePlayState = {
  status: RemoteStatus;
  info: RemoteInfo | null;
  errorMessage?: string | null;
};

export default function Play() {
  const bodyRef = useElementRefBySelector<HTMLBodyElement>("body");
  const bodySize = useElementSize(bodyRef);

  const cpanelRef = useRef<HTMLElement>(null);
  const playAreaRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const cpanelRefSize = useElementSize(cpanelRef);

  const bodyHeight = bodySize?.height || 0;
  const cpanelHeight = cpanelRefSize?.height || 0;

  const [manifestName, setManifestName, resetManifestName] = usePersistentState<
    keyof typeof manifestPresets
  >("manifestName", "12edo");
  const [waveform, setWaveform, resetWaveform] = usePersistentState<Waveform>(
    "waveform",
    "sine"
  );
  const [envelope, setEnvelope, resetEnvelope] = usePersistentState<Envelope>(
    "envelope",
    defaultEnvelope
  );

  const [synth, setSynth] = useState<Synth | null>(null);
  const [started, setStarted] = useState(false);

  // --- Simple, single active recording ---
  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // Active/committed take
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeMime, setActiveMime] = useState<string | null>(null);

  // Playback bounds (simple: always 0..duration; pause at end when bounded)
  const [playbackStart] = useState<number>(0);
  const [playbackEnd, setPlaybackEnd] = useState<number | null>(null);

  const [volumePct, setVolumePct] = usePersistentState<number>("volume", 80);

  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const clientIdRef = useRef<string>("");

  useEffect(() => {
    if (synth) synth.setVolume(volumePct / 100);
  }, [synth, volumePct]);

  // Init synth + recorder exactly once
  useEffect(() => {
    let mounted = true;
    (async () => {
      const s = await Synth.create();
      if (!mounted) return;
      setSynth(s);
      s.setWaveform(waveform);
      s.setEnvelope(envelope);
      try {
        const r = new Recorder(s.getMediaStream());
        setRecorder(r);
      } catch (err) {
        console.warn("Recorder unavailable:", err);
        setRecorder(null);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep synth params in sync
  useEffect(() => {
    if (synth) synth.setWaveform(waveform);
  }, [synth, waveform]);
  useEffect(() => {
    if (synth) synth.setEnvelope(envelope);
  }, [synth, envelope]);

  const backendBase = useMemo(() => {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:8080`;
  }, []);

  // Utility: hard reset playhead & reload the element to avoid scrubber glitches
  const resetPlayhead = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    try {
      el.pause();
      el.currentTime = 0;
      // Force a layout/metadata refresh to keep the scrubber honest
      el.load();
    } catch (e) {
      // no-op
    }
  }, []);

  // Record controls
  const handleRecordStart = useCallback(async () => {
    if (!synth || !recorder) return;
    await synth.resume();
    // Reset playhead and disable playback while recording
    resetPlayhead();
    recorder.start();
    setIsRecording(true);
  }, [synth, recorder, resetPlayhead]);

  // Stop and SAVE (commit directly to active)
  const handleRecordStopSave = useCallback(async () => {
    if (!recorder) return;
    const rec: Recording = await recorder.stop();
    setIsRecording(false);

    // Revoke previous active before replacing
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    const url = URL.createObjectURL(rec.blob);
    setActiveUrl(url);
    setActiveMime(rec.mimeType || "audio/webm");

    // Set bounds to the natural duration when metadata is ready
    const el = audioRef.current;
    if (el) {
      const onMeta = () => {
        setPlaybackEnd(isFinite(el.duration) ? el.duration : null);
        el.removeEventListener("loadedmetadata", onMeta);
      };
      el.addEventListener("loadedmetadata", onMeta);
    }

    // keep scrubber honest
    resetPlayhead();
  }, [recorder, activeUrl, resetPlayhead]);

  // Stop and DISCARD (do not overwrite active)
  const handleRecordStopDiscard = useCallback(async () => {
    if (!recorder) return;
    try {
      await recorder.stop();
    } finally {
      setIsRecording(false);
      resetPlayhead();
    }
  }, [recorder, resetPlayhead]);

  // Revoke blob URL on unmount for safety
  useEffect(() => {
    return () => {
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [activeUrl]);

  const [startingOctave, setStartingOctave, resetStartingOctave] =
    usePersistentState<number>("startingOctave", 4);
  const [octaveCount, setOctaveCount, resetOctaveCount] =
    usePersistentState<number>("octaveCount", 2);

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleResetSettings = useCallback(() => {
    resetManifestName();
    resetWaveform();
    resetEnvelope();
    resetStartingOctave();
    resetOctaveCount();
    setShowResetConfirm(false);
  }, [
    resetManifestName,
    resetWaveform,
    resetEnvelope,
    resetStartingOctave,
    resetOctaveCount,
  ]);

  const manifest = manifestPresets[manifestName];

  const playAreaSize = useElementSize(playAreaRef);
  const currentPlayAreaWidth = playAreaSize?.width || 0;
  const currentPlayAreaHeight = playAreaSize?.height || 0;

  const onIdPress = useCallback(
    (id: number, pitch: number) => {
      synth?.resume();
      synth?.noteOn(id, pitch, envelope);
    },
    [synth, envelope]
  );

  const onIdRelease = useCallback(
    (id: number) => {
      synth?.noteOff(id);
    },
    [synth]
  );

  const handleStart = useCallback(async () => {
    if (synth) {
      await synth.resume();
    }
    setStarted(true);
  }, [synth]);

  const octaveAspect = 7 * whiteKeyAspect;
  const targetKeyboardAspect = octaveAspect * (octaveCount ?? 1);
  let targetKeyboardWidth = currentPlayAreaWidth;
  let targetKeyboardHeight = targetKeyboardWidth / targetKeyboardAspect;
  if (targetKeyboardHeight > currentPlayAreaHeight) {
    targetKeyboardHeight = currentPlayAreaHeight;
    targetKeyboardWidth = targetKeyboardHeight * targetKeyboardAspect;
  }

  const canDownload = Boolean(activeUrl && activeMime);
  const filename = `recording.${activeMime?.includes("ogg") ? "ogg" : "webm"}`;

  // Enforce simple bounds by pausing at playbackEnd
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTimeUpdate = () => {
      if (playbackEnd != null && el.currentTime > playbackEnd) {
        el.pause();
        el.currentTime = playbackStart;
      }
    };
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => el.removeEventListener("timeupdate", onTimeUpdate);
  }, [playbackStart, playbackEnd]);

  // ---------------- Remote Play UI State + Stubs ----------------
  const [showRemoteDialog, setShowRemoteDialog] = useState(false);
  const [remote, setRemote] = usePersistentState<RemotePlayState>(
    "remotePlay",
    { status: "off", info: null }
  );

  const openRemoteDialog = useCallback(() => setShowRemoteDialog(true), []);
  const closeRemoteDialog = useCallback(() => setShowRemoteDialog(false), []);

  const turnRemoteOff = useCallback(() => {
    setRemote({ status: "off", info: null });
  }, [setRemote]);

  const armAsReceiver = useCallback(() => {
    // Placeholder: user chose to act as receiver.
    setRemote({ status: "receiver_armed", info: null });
    // In real implementation, start handshake with special socket server backend.
  }, [setRemote]);

  const armAsSender = useCallback(() => {
    // Placeholder: user chose to act as sender.
    setRemote({ status: "sender_armed", info: null });
    // In real implementation, start handshake with special socket server backend.
  }, [setRemote]);

  const beginRemoteHandshake = useCallback(async () => {
    setRemote((prev) => ({
      ...prev,
      status: "connecting",
      errorMessage: null,
    }));
    try {
      const role =
        (remote.status === "sender_armed" && "sender") ||
        (remote.status === "receiver_armed" && "receiver") ||
        "peer";

      const res = await fetch(`${backendBase}/connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const ip =
        data?.net?.primary_ip ?? data?.net?.all_ips?.[0] ?? "127.0.0.1";
      const hostname = data?.net?.hostname ?? "localhost";
      const password = data?.password ?? "unknown";
      const room = data?.room ?? "unknown";

      setRemote({
        status: "connected",
        info: { ip, hostname, password, room },
        errorMessage: null,
      });
      if (
        remote.status === "sender_armed" ||
        remote.status === "receiver_armed"
      ) {
        const info = { ...data, room, password }; // we already have room/password above

        // 1) Connect the socket
        const sock = connectSocket(backendBase);
        socketRef.current = sock;

        // 2) Join the room
        const joined = await joinRoom(sock, {
          room,
          password,
          // optional: re-use a persistent id if you want
        });
        clientIdRef.current = joined.client_id;

        // 3) Subscribe to channels we care about
        await subscribe(sock, { room, channels: ["settings-sync"] });

        // 4) If we are the SENDER, immediately publish the settings
        const iAmSender = remote.status === "sender_armed";
        if (iAmSender) {
          const payload: SettingsSyncPayload = {
            kind: "settings-sync",
            manifestName,
            waveform,
            envelope,
            volumePct,
            startingOctave,
            octaveCount,
          };

          await publish(sock, {
            room,
            password,
            client_id: clientIdRef.current,
            channel: "settings-sync",
            message: JSON.stringify(payload),
          });
        }
      }
    } catch (err: any) {
      setRemote({
        status: "error",
        info: null,
        errorMessage: err?.message || "Failed to reach remote play backend.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendBase, remote.status, setRemote]);
  const disconnectRemote = useCallback(() => {
    // Placeholder: tell backend to disconnect, then clear local state
    setRemote({ status: "off", info: null });
  }, [setRemote]);

  useEffect(() => {
    const sock = socketRef.current;
    if (!sock) return;

    const onMessage = (evt: any) => {
      try {
        // Backend wraps deliveries as { type:"message", channel, text, ... }
        if (evt?.type !== "message") return;
        if (evt?.channel !== "settings-sync") return;

        const parsed = JSON.parse(String(evt.text || "{}"));
        if (parsed?.kind !== "settings-sync") return;

        // Apply: make the receiver mirror the sender
        setManifestName(parsed.manifestName);
        setWaveform(parsed.waveform);
        setEnvelope(parsed.envelope);
        setVolumePct(parsed.volumePct);
        setStartingOctave(parsed.startingOctave);
        setOctaveCount(parsed.octaveCount);
      } catch {
        /* ignore bad payloads */
      }
    };

    sock.on("message", onMessage);
    return () => {
      sock.off("message", onMessage);
    };
  }, [
    setManifestName,
    setWaveform,
    setEnvelope,
    setVolumePct,
    setStartingOctave,
    setOctaveCount,
  ]);

  return (
    <>
      <Header
        width="100%"
        ref={cpanelRef}
        background="teal"
        padding="0.5rem"
        display="flex"
        flexDirection="row"
        alignItems="center"
        overflowX="auto"
        gap="0.5rem"
      >
        <A
          href="/"
          css={css`
            color: black;
            cursor: pointer;
            user-select: none;
            &:visited {
              color: black;
            }
            font-size: 2rem;
            background: white;
            border: 2px solid black;
            border-radius: 50%;
            width: 2.5rem;
            height: 2.5rem;
            display: flex;
            align-items: center;
            justify-content: center;
          `}
        >
          <FaHome />
        </A>

        <Div display="flex" alignItems="center">
          <VolumeSlider value={volumePct} onChange={setVolumePct} />
        </Div>

        <Button onClick={() => setShowResetConfirm(true)} padding="0.5rem">
          Reset All Settings
        </Button>

        {/* --- New: Set up Remote Play button --- */}
        <Button onClick={openRemoteDialog} padding="0.5rem">
          Set up remote play
        </Button>

        <Select
          value={manifestName}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            setManifestName(e.target.value as keyof typeof manifestPresets);
          }}
          fontSize="2rem"
        >
          {Object.keys(manifestPresets).map((presetName) => (
            <Option key={presetName} value={presetName}>
              {presetName}
            </Option>
          ))}
        </Select>

        <Select
          value={waveform}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            setWaveform(e.target.value as Waveform)
          }
          fontSize="2rem"
        >
          <Option value="sine">Sine</Option>
          <Option value="square">Square</Option>
          <Option value="triangle">Triangle</Option>
          <Option value="sawtooth">Sawtooth</Option>
          <Option value="power2">Power 2</Option>
          <Option value="power3">Power 3</Option>
          <Option value="power4">Power 4</Option>
          <Option value="selfmod0.1">Self Mod 0.1</Option>
          <Option value="selfmod0.2">Self Mod 0.2</Option>
          <Option value="selfmod0.3">Self Mod 0.3</Option>
        </Select>

        <label style={{ color: "white" }}>
          A:
          <input
            type="number"
            min={0}
            step={0.01}
            value={envelope.attack}
            onChange={(e) =>
              setEnvelope({
                ...envelope,
                attack: parseFloat(e.target.value) || 0,
              })
            }
            style={{ width: "4rem", marginLeft: "0.25rem" }}
          />
        </label>
        <label style={{ color: "white" }}>
          D:
          <input
            type="number"
            min={0}
            step={0.01}
            value={envelope.decay}
            onChange={(e) =>
              setEnvelope({
                ...envelope,
                decay: parseFloat(e.target.value) || 0,
              })
            }
            style={{ width: "4rem", marginLeft: "0.25rem" }}
          />
        </label>
        <label style={{ color: "white" }}>
          S:
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={envelope.sustain}
            onChange={(e) =>
              setEnvelope({
                ...envelope,
                sustain: parseFloat(e.target.value) || 0,
              })
            }
            style={{ width: "4rem", marginLeft: "0.25rem" }}
          />
        </label>
        <label style={{ color: "white" }}>
          R:
          <input
            type="number"
            min={0}
            step={0.01}
            value={envelope.release}
            onChange={(e) =>
              setEnvelope({
                ...envelope,
                release: parseFloat(e.target.value) || 0,
              })
            }
            style={{ width: "4rem", marginLeft: "0.25rem" }}
          />
        </label>
        <NumberStepper
          label="Oct Start:"
          value={startingOctave}
          onChange={setStartingOctave}
          min={0}
        />
        <NumberStepper
          label="Oct Count:"
          value={octaveCount}
          onChange={setOctaveCount}
          min={1}
        />

        {/* --- Recording controls (two-button finish) --- */}
        <Div display="flex" gap="0.5rem" marginLeft="auto" alignItems="center">
          {!isRecording ? (
            <Button
              onClick={handleRecordStart}
              background="#d32f2f"
              color="white"
              padding="0.5rem 1rem"
              title="Start recording"
            >
              ● Record
            </Button>
          ) : (
            <Div display="flex" gap="0.5rem">
              <Button
                onClick={handleRecordStopSave}
                background="#2e7d32"
                color="white"
                padding="0.5rem 1rem"
                title="Stop and save recording"
              >
                ■ Stop & Save
              </Button>
              <Button
                onClick={handleRecordStopDiscard}
                background="#616161"
                color="white"
                padding="0.5rem 1rem"
                title="Stop and discard recording"
              >
                ✕ Stop & Discard
              </Button>
            </Div>
          )}

          {/* Inline player for the committed take; greyed/disabled while recording */}
          <audio
            ref={audioRef}
            src={activeUrl ?? undefined}
            controls
            onPlay={() => {
              // If bounds are set and we're at end, snap to start
              const el = audioRef.current;
              if (el && playbackEnd != null && el.currentTime >= playbackEnd) {
                el.currentTime = playbackStart;
              }
            }}
            style={{
              maxWidth: 260,
              pointerEvents: isRecording ? "none" : "auto",
              opacity: isRecording ? 0.5 : 1,
            }}
            aria-disabled={isRecording}
          />

          {/* Download button; relies on the user to save if they want to keep */}
          <A
            href={activeUrl ?? undefined}
            download={canDownload ? filename : undefined}
            aria-disabled={!canDownload || isRecording}
            css={css`
              pointer-events: ${canDownload && !isRecording ? "auto" : "none"};
              opacity: ${canDownload && !isRecording ? 1 : 0.5};
            `}
            background="white"
            color="black"
            padding="0.5rem 0.75rem"
            borderRadius="0.375rem"
            title={
              canDownload
                ? isRecording
                  ? "Disabled while recording"
                  : "Download current recording"
                : "Record something to enable download"
            }
          >
            Download
          </A>
        </Div>
      </Header>

      <Main
        width="100%"
        ref={playAreaRef}
        height={`${bodyHeight - cpanelHeight}px`}
        background="orange"
        position="relative"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        {currentPlayAreaHeight > 0 &&
          currentPlayAreaWidth > 0 &&
          octaveCount &&
          startingOctave !== null && (
            <CanvasKeyboard
              manifest={manifest}
              startingOctave={startingOctave}
              octaveCount={octaveCount}
              onIdPress={onIdPress}
              onIdRelease={onIdRelease}
              width={targetKeyboardWidth}
              height={targetKeyboardHeight}
            />
          )}
      </Main>

      {/* --- Click-to-start overlay --- */}
      {!started && (
        <div className="audio-modal" onClick={handleStart}>
          <span>Click to Start Audio</span>
        </div>
      )}

      {/* --- Reset confirm modal --- */}
      {showResetConfirm && (
        <div className="audio-modal">
          <Div
            background="white"
            padding="2rem"
            borderRadius="0.5rem"
            display="flex"
            flexDirection="column"
            gap="1rem"
            alignItems="center"
          >
            <Span>Reset all settings to their defaults?</Span>
            <Div display="flex" gap="1rem">
              <Button
                onClick={handleResetSettings}
                background="red"
                color="white"
                padding="0.5rem 1rem"
              >
                Confirm
              </Button>
              <Button
                onClick={() => setShowResetConfirm(false)}
                background="grey"
                color="white"
                padding="0.5rem 1rem"
              >
                Cancel
              </Button>
            </Div>
          </Div>
        </div>
      )}

      {/* --- Remote Play dialog --- */}
      {showRemoteDialog && (
        <div className="audio-modal" role="dialog" aria-modal="true">
          <Div
            background="white"
            padding="1.5rem"
            borderRadius="0.5rem"
            display="flex"
            flexDirection="column"
            gap="0.75rem"
            minWidth="20rem"
            maxWidth="28rem"
          >
            <Div
              display="flex"
              justifyContent="space-between"
              alignItems="center"
            >
              <Span style={{ fontWeight: 700 }}>Remote Play</Span>
              <Button onClick={closeRemoteDialog}>Close</Button>
            </Div>

            {/* Status block */}
            {remote.status === "off" && (
              <>
                <Span>remote play is off</Span>
                <Div display="flex" gap="0.5rem" flexWrap="wrap">
                  {/* Intentionally keeping the original label casing/spelling */}
                  <Button onClick={armAsReceiver}>
                    Set up as remote play reciever
                  </Button>
                  <Button onClick={armAsSender}>
                    set up as remote play sender
                  </Button>
                </Div>
              </>
            )}

            {(remote.status === "sender_armed" ||
              remote.status === "receiver_armed") && (
              <>
                <Span>
                  {remote.status === "sender_armed"
                    ? "Sender selected."
                    : "Receiver selected."}{" "}
                  Both peers will handshake with a special socket server backend
                  (no direct sender/receiver handshake).
                </Span>
                <Div display="flex" gap="0.5rem">
                  <Button onClick={beginRemoteHandshake}>
                    Begin handshake
                  </Button>
                  <Button background="#eee" onClick={turnRemoteOff}>
                    Back
                  </Button>
                </Div>
              </>
            )}

            {remote.status === "connecting" && (
              <>
                <Span>Connecting to remote play…</Span>
                <Span style={{ fontSize: "0.9rem", opacity: 0.7 }}>
                  Placeholder: awaiting backend to return connection info.
                </Span>
                <Button background="#eee" onClick={turnRemoteOff}>
                  Cancel
                </Button>
              </>
            )}

            {remote.status === "connected" && remote.info && (
              <>
                <Span style={{ fontWeight: 600 }}>Connected</Span>
                <Div
                  background="#f6f6f6"
                  padding="0.75rem"
                  borderRadius="0.375rem"
                  display="flex"
                  flexDirection="column"
                  gap="0.25rem"
                >
                  <Span>
                    <strong>Room:</strong> {remote.info.room}
                  </Span>
                  <Span>
                    <strong>IP:</strong> {remote.info.ip}
                  </Span>
                  <Span>
                    <strong>Hostname:</strong> {remote.info.hostname}
                  </Span>
                  <Span>
                    <strong>Password:</strong> {remote.info.password}
                  </Span>
                </Div>
                <Div display="flex" gap="0.5rem">
                  <Button onClick={disconnectRemote}>Disconnect</Button>
                  <Button onClick={closeRemoteDialog}>Close</Button>
                </Div>
              </>
            )}

            {remote.status === "error" && (
              <>
                <Span style={{ color: "#b00020" }}>
                  {remote.errorMessage || "Remote play error (placeholder)."}
                </Span>
                <Div display="flex" gap="0.5rem">
                  <Button onClick={beginRemoteHandshake}>Retry</Button>
                  <Button background="#eee" onClick={turnRemoteOff}>
                    Turn off
                  </Button>
                </Div>
              </>
            )}
          </Div>
        </div>
      )}
    </>
  );
}
