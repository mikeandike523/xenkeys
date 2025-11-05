import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent
} from "react";
import { FaHome } from "react-icons/fa";
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

import { useElementRefBySelector } from "../hooks/fwk/useElementRefBySelector";
import { useElementSize } from "../hooks/fwk/useElementSize";
import { usePersistentState } from "../hooks/fwk/usePersistentState";

import { css } from "@emotion/react";
import Recorder, { type Recording } from "../audio/recorder";
import Synth from "../audio/synth";
import CanvasKeyboard from "../components/CanvasKeyboard";
import { NumberStepper } from "../components/NumberStepper";
import VolumeSlider from "../components/VolumeSlider";
import { make12EDO } from "../data/edo-presets/12edo";
import { make19EDO } from "../data/edo-presets/19edo";
import { make22EDO } from "../data/edo-presets/22edo";
import { make24EDO } from "../data/edo-presets/24edo";
import { make31EDO } from "../data/edo-presets/31edo";
import { make36EDO } from "../data/edo-presets/36edo";
import { make41EDO } from "../data/edo-presets/41edo";
import { make48EDO } from "../data/edo-presets/48edo";
import { whiteKeyAspect } from "../data/piano-key-dimensions";
import { createReceiverPeer, createSenderPeer, type PeerConn } from "../remote/peer";
import type {
  Envelope,
  NoteOffMsg,
  NoteOnMsg,
  Waveform,
} from "../shared-types/audio-engine";
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

// Remote P2P state does not include backend info
type RemotePlayState = {
  status: RemoteStatus;
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

  // PeerJS P2P connection reference
  const peerRef = useRef<PeerConn | null>(null);


  const roleRef = useRef<"sender" | "receiver" | "peer">("peer");

  // UI state for join-code flow
  const [senderJoinCode, setSenderJoinCode] = useState("");
  const [receiverInviteCode, setReceiverInviteCode] = useState<string | null>(null);

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

  /** Generate a 6-character alphanumeric invite code for PeerJS */
  const generateInviteCode = useCallback((): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
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

  const [remote, setRemote] = useState<RemotePlayState>({ status: "off" });
  // track remote key press state for visuals
  const [remotePressedIds, setRemotePressedIds] = useState<number[]>([]);

  const onIdPress = useCallback(
    (id: number, pitch: number) => {
      // local playback unless acting as remote sender
      if (!(remote.status === "connected" && roleRef.current === "sender")) {
        synth?.resume();
        synth?.noteOn(id, pitch, envelope);
      }
      // Remote sender: send note-on via PeerJS data channel
      const peerConn = peerRef.current;
      if (peerConn && remote.status === "connected" && roleRef.current === "sender") {
        const msg: NoteOnMsg = { type: "noteOn", data: { id, freq: pitch, envelope } };
        peerConn.conn.send(msg);
      }
    },
    [synth, envelope, remote.status]
  );

  const onIdRelease = useCallback(
    (id: number) => {
      // local stop unless acting as remote sender
      if (!(remote.status === "connected" && roleRef.current === "sender")) {
        synth?.noteOff(id);
      }
      // Remote sender: send note-off via PeerJS data channel
      const peerConn = peerRef.current;
      if (peerConn && remote.status === "connected" && roleRef.current === "sender") {
        const msg: NoteOffMsg = { type: "noteOff", data: { id } };
        peerConn.conn.send(msg);
      }
    },
    [synth, remote.status]
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

  const openRemoteDialog = useCallback(() => setShowRemoteDialog(true), []);
  const closeRemoteDialog = useCallback(() => setShowRemoteDialog(false), []);

  const beginRemoteHandshake = useCallback(async () => {
    try {
      const role = roleRef.current === "sender" ? "sender" : "receiver";
      setRemote({ status: "connecting", errorMessage: null });
      if (role === "receiver") {
        // generate invite code and await sender connection via PeerJS
        const code = generateInviteCode();
        setReceiverInviteCode(code);
        console.log("Creating the peer with code: "+code)
        const peerConn = await createReceiverPeer(code);
        console.log("Done.")
        peerRef.current = peerConn;
      } else {
        if (!senderJoinCode) throw new Error("Please enter Invite Code.");
        const peerConn = await createSenderPeer(senderJoinCode);
        peerRef.current = peerConn;
      }
      setRemote({ status: "connected", errorMessage: null });
    } catch (err: any) {
      setRemote({ status: "error", errorMessage: err?.message || "Remote play connection failed." });
    }
  }, [generateInviteCode, senderJoinCode]);

  const turnRemoteOff = useCallback(() => {
    setRemote({ status: "off" });
  }, [setRemote]);
  const armAsReceiver = useCallback(() => {
    roleRef.current = "receiver";
    setReceiverInviteCode(null);
    setRemote({ status: "receiver_armed" });
    beginRemoteHandshake();
  }, [setRemote, beginRemoteHandshake]);

  const armAsSender = useCallback(() => {
    roleRef.current = "sender";
    setRemote({ status: "sender_armed" });
  }, [setRemote]);

  const disconnectRemote = useCallback(() => {
    // Clean up PeerJS connection
    const peerConn = peerRef.current;
    if (peerConn) {
      try {
        peerConn.peer.destroy();
      } catch {}
      peerRef.current = null;
    }
    setRemote({ status: "off" });
  }, [setRemote]);

  // Receiver-only listener attachment via PeerJS data channel
  useEffect(() => {
    const peerConn = peerRef.current;
    if (!peerConn || remote.status !== "connected" || roleRef.current !== "receiver") return;

    const onData = (msg: any) => {
      try {
        if ((msg as SettingsSyncPayload)?.kind === "settings-sync") {
          const parsed = msg as SettingsSyncPayload;
          setManifestName(parsed.manifestName as keyof typeof manifestPresets);
          setWaveform(parsed.waveform);
          setEnvelope(parsed.envelope);
          setVolumePct(parsed.volumePct);
          setStartingOctave(parsed.startingOctave);
          setOctaveCount(parsed.octaveCount);
        } else if ((msg as NoteOnMsg).type === "noteOn") {
          const m = msg as NoteOnMsg;
          setRemotePressedIds((prev) => (prev.includes(m.data.id) ? prev : [...prev, m.data.id]));
          onIdPress(m.data.id, m.data.freq);
        } else if ((msg as NoteOffMsg).type === "noteOff") {
          const m = msg as NoteOffMsg;
          setRemotePressedIds((prev) => prev.filter((i) => i !== m.data.id));
          onIdRelease(m.data.id);
        }
      } catch {
        /* ignore bad payloads */
      }
    };

    peerConn.conn.on("data", onData);
    return () => {
      peerConn.conn.off("data", onData);
    };
  }, [
    remote.status,
    setManifestName,
    setWaveform,
    setEnvelope,
    setVolumePct,
    setStartingOctave,
    setOctaveCount,
    onIdPress,
    onIdRelease,
  ]);

  // Sender-only settings sync via PeerJS
  useEffect(() => {
    const peerConn = peerRef.current;
    if (!peerConn || remote.status !== "connected" || roleRef.current !== "sender") return;
    const payload: SettingsSyncPayload = {
      kind: "settings-sync",
      manifestName,
      waveform,
      envelope,
      volumePct,
      startingOctave,
      octaveCount,
    };
    peerConn.conn.send(payload);
  }, [
    remote.status,
    manifestName,
    waveform,
    envelope,
    volumePct,
    startingOctave,
    octaveCount,
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
              externalPressedIds={remotePressedIds}
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
                    : "Receiver selected."}
                </Span>

                {remote.status === "receiver_armed" && (
                  <Div display="flex" flexDirection="column" gap="0.5rem">
                    {receiverInviteCode ? (
                      <>
                        <Span><strong>Share this code:</strong> {receiverInviteCode}</Span>
                        <Span>Waiting for sender to connect…</Span>
                      </>
                    ) : (
                      <Span>Preparing invite…</Span>
                    )}
                  </Div>
                )}

                {remote.status === "sender_armed" && (
                  <Div display="flex" flexDirection="column" gap="0.5rem">
                    <label>
                      Invite Code:
                      <input
                        autoCapitalize="off"
                        autoComplete="off"
                        autoCorrect="off"
                        value={senderJoinCode}
                        onChange={(e) => setSenderJoinCode(e.target.value.toUpperCase())}
                        placeholder="6 letters/digits"
                      />
                    </label>
                  </Div>
                )}
                <Div display="flex" gap="0.5rem">
                  {remote.status === "sender_armed" && (
                    <Button onClick={beginRemoteHandshake}>
                      Connect as sender
                    </Button>
                  )}
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
                  Awaiting PeerJS connection…
                </Span>
                <Button background="#eee" onClick={turnRemoteOff}>
                  Cancel
                </Button>
              </>
            )}

            {remote.status === "connected" && (
              <>
                <Span style={{ fontWeight: 600 }}>Connected</Span>
                <Div display="flex" flexDirection="column" gap="0.25rem">
                  {roleRef.current === "receiver" && (
                    <Span><strong>Invite Code:</strong> {receiverInviteCode}</Span>
                  )}
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
