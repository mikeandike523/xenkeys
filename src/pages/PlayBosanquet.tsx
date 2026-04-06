import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
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
import { io, type Socket } from "socket.io-client";
import Recorder, { type Recording } from "../audio/recorder";
import Synth from "../audio/synth";
import CanvasHexKeyboard from "../components/CanvasHexKeyboard";
import { NumberStepper } from "../components/NumberStepper";
import VolumeSlider from "../components/VolumeSlider";
import { make31EDO } from "../data/edo-presets/31edo";
import { make31EdoBosanquetLayout } from "../data/bosanquet/layout31edo";
import {
  createReceiverPeer,
  createSenderPeer,
  type PeerConn,
} from "../remote/peer";
import type {
  Envelope,
  NoteOffMsg,
  NoteOnMsg,
  Waveform,
} from "../shared-types/audio-engine";
import type { SettingsSyncPayload } from "../shared-types/remote";
import type { XenOctaveDisplayRuntimeManifest } from "../types/XenOctaveDisplayManifest";
import getBaseFrequencyC from "../utils/music-theory/getBaseFrequency";

const manifestPreset = make31EDO();

const defaultEnvelope: Envelope = {
  attack: 0.01,
  decay: 0.1,
  sustain: 0.7,
  release: 0.5,
};

type RemoteStatus =
  | "off"
  | "sender_armed"
  | "receiver_armed"
  | "connecting"
  | "connected"
  | "error";

type RemotePlayState = {
  status: RemoteStatus;
  errorMessage?: string | null;
};

export default function PlayBosanquet() {
  const bodyRef = useElementRefBySelector<HTMLBodyElement>("body");
  const bodySize = useElementSize(bodyRef);

  const cpanelRef = useRef<HTMLElement>(null);
  const playAreaRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const cpanelRefSize = useElementSize(cpanelRef);

  const bodyHeight = bodySize?.height || 0;
  const cpanelHeight = cpanelRefSize?.height || 0;

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

  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [activeMime, setActiveMime] = useState<string | null>(null);

  const [playbackStart] = useState<number>(0);
  const [playbackEnd, setPlaybackEnd] = useState<number | null>(null);

  const [volumePct, setVolumePct] = usePersistentState<number>("volume", 80);
  const [a4Frequency, setA4Frequency, resetA4Frequency] =
    usePersistentState<number>("a4Frequency", 440);
  const [tuneCIn12Edo, setTuneCIn12Edo, resetTuneCIn12Edo] =
    usePersistentState<boolean>("tuneCIn12Edo", true);

  const peerRef = useRef<PeerConn | null>(null);
  const roleRef = useRef<"sender" | "receiver" | "peer">("peer");

  const [senderJoinCode, setSenderJoinCode] = useState("");
  const [receiverInviteCode, setReceiverInviteCode] = useState<string | null>(null);

  const [showXenConnectDialog, setShowXenConnectDialog] = useState(false);
  const [xenConnectHost, setXenConnectHost] = useState("localhost");
  const [xenConnectPortText, setXenConnectPortText] = useState("5072");
  const [xenConnectPassword, setXenConnectPassword] = useState("");
  const [xenConnectState, setXenConnectState] = useState<
    "idle" | "connecting" | "connected" | "error"
  >("idle");
  const [xenConnectError, setXenConnectError] = useState<string | null>(null);
  const xenSocketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (synth) synth.setVolume(volumePct / 100);
  }, [synth, volumePct]);

  useEffect(() => {
    if (!synth) return;
    if (xenConnectState === "connected") {
      synth.suspend();
    } else if (started) {
      synth.resume();
    }
  }, [synth, xenConnectState, started]);

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
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (synth) synth.setWaveform(waveform);
  }, [synth, waveform]);
  useEffect(() => {
    if (synth) synth.setEnvelope(envelope);
  }, [synth, envelope]);

  const resetPlayhead = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    try { el.pause(); el.currentTime = 0; el.load(); } catch {}
  }, []);

  const generateInviteCode = useCallback((): string => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  }, []);

  const handleRecordStart = useCallback(async () => {
    if (!synth || !recorder) return;
    await synth.resume();
    resetPlayhead();
    recorder.start();
    setIsRecording(true);
  }, [synth, recorder, resetPlayhead]);

  const handleRecordStopSave = useCallback(async () => {
    if (!recorder) return;
    const rec: Recording = await recorder.stop();
    setIsRecording(false);
    if (activeUrl) URL.revokeObjectURL(activeUrl);
    const url = URL.createObjectURL(rec.blob);
    setActiveUrl(url);
    setActiveMime(rec.mimeType || "audio/webm");
    const el = audioRef.current;
    if (el) {
      const onMeta = () => {
        setPlaybackEnd(isFinite(el.duration) ? el.duration : null);
        el.removeEventListener("loadedmetadata", onMeta);
      };
      el.addEventListener("loadedmetadata", onMeta);
    }
    resetPlayhead();
  }, [recorder, activeUrl, resetPlayhead]);

  const handleRecordStopDiscard = useCallback(async () => {
    if (!recorder) return;
    try { await recorder.stop(); } finally {
      setIsRecording(false);
      resetPlayhead();
    }
  }, [recorder, resetPlayhead]);

  useEffect(() => {
    return () => { if (activeUrl) URL.revokeObjectURL(activeUrl); };
  }, [activeUrl]);

  const [startingOctave, setStartingOctave, resetStartingOctave] =
    usePersistentState<number>("startingOctave", 4);
  const [octaveCount, setOctaveCount, resetOctaveCount] =
    usePersistentState<number>("bosanquet_octaveCount", 3);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showA4Dialog, setShowA4Dialog] = useState(false);
  const [a4FrequencyInput, setA4FrequencyInput] = useState(a4Frequency.toString());

  const handleResetSettings = useCallback(() => {
    resetWaveform();
    resetEnvelope();
    resetStartingOctave();
    resetOctaveCount();
    resetA4Frequency();
    resetTuneCIn12Edo();
    setShowResetConfirm(false);
  }, [resetWaveform, resetEnvelope, resetStartingOctave, resetOctaveCount, resetA4Frequency, resetTuneCIn12Edo]);

  const layout = useMemo(
    () => make31EdoBosanquetLayout(Math.max(1, Math.min(6, octaveCount))),
    [octaveCount]
  );

  const manifest = useMemo<XenOctaveDisplayRuntimeManifest>(() => {
    const C4Frequency = getBaseFrequencyC(
      a4Frequency,
      manifestPreset.totalEDO,
      4,
      manifestPreset.a4ToC5Microsteps,
      tuneCIn12Edo
    );
    return { ...manifestPreset, C4Frequency };
  }, [a4Frequency, tuneCIn12Edo]);

  const parsedA4Frequency = Number(a4FrequencyInput);
  const isA4FrequencyValid = Number.isFinite(parsedA4Frequency) && parsedA4Frequency > 0;

  const playAreaSize = useElementSize(playAreaRef);
  const currentPlayAreaWidth = playAreaSize?.width || 0;
  const currentPlayAreaHeight = playAreaSize?.height || 0;

  const [remote, setRemote] = useState<RemotePlayState>({ status: "off" });
  const [remotePressedIds, setRemotePressedIds] = useState<number[]>([]);

  const onIdPress = useCallback(
    (id: number, pitch: number) => {
      if (!((remote.status === "connected" && roleRef.current === "sender") || xenConnectState === "connected")) {
        synth?.resume();
        synth?.noteOn(id, pitch, envelope);
      }
      const peerConn = peerRef.current;
      if (peerConn && remote.status === "connected" && roleRef.current === "sender") {
        const msg: NoteOnMsg = { type: "noteOn", data: { id, freq: pitch, envelope } };
        peerConn.conn.send(msg);
      }
      if (xenConnectState === "connected" && xenSocketRef.current) {
        const midi = id - startingOctave * manifest.totalEDO;
        xenSocketRef.current.emit("noteOn", { midi });
      }
    },
    [synth, envelope, remote.status, xenConnectState, startingOctave, manifest.totalEDO]
  );

  const onIdRelease = useCallback(
    (id: number) => {
      if (!((remote.status === "connected" && roleRef.current === "sender") || xenConnectState === "connected")) {
        synth?.noteOff(id);
      }
      const peerConn = peerRef.current;
      if (peerConn && remote.status === "connected" && roleRef.current === "sender") {
        const msg: NoteOffMsg = { type: "noteOff", data: { id } };
        peerConn.conn.send(msg);
      }
      if (xenConnectState === "connected" && xenSocketRef.current) {
        const midi = id - startingOctave * manifest.totalEDO;
        xenSocketRef.current.emit("noteOff", { midi });
      }
    },
    [synth, remote.status, xenConnectState, startingOctave, manifest.totalEDO]
  );

  const handleStart = useCallback(async () => {
    if (synth) await synth.resume();
    setStarted(true);
  }, [synth]);

  const canDownload = Boolean(activeUrl && activeMime);
  const filename = `recording.${activeMime?.includes("ogg") ? "ogg" : "webm"}`;

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

  const [showRemoteDialog, setShowRemoteDialog] = useState(false);
  const openRemoteDialog = useCallback(() => setShowRemoteDialog(true), []);
  const closeRemoteDialog = useCallback(() => setShowRemoteDialog(false), []);
  const openXenConnectDialog = useCallback(() => setShowXenConnectDialog(true), []);
  const closeXenConnectDialog = useCallback(() => setShowXenConnectDialog(false), []);

  const connectXen = useCallback(() => {
    setXenConnectState("connecting");
    setXenConnectError(null);
    const port = parseInt(xenConnectPortText, 10);
    if (isNaN(port) || port < 0 || port > 65535) {
      setXenConnectState("error");
      setXenConnectError("Invalid port");
      return;
    }
    try {
      const socket = io(`http://${xenConnectHost}:${port}`, {
        auth: { password: xenConnectPassword },
      });
      xenSocketRef.current = socket;
      socket.on("connect", () => setXenConnectState("connected"));
      socket.on("connect_error", (err: any) => {
        setXenConnectState("error");
        setXenConnectError(err?.message || String(err));
      });
      socket.on("disconnect", () => setXenConnectState("idle"));
    } catch (err: any) {
      setXenConnectState("error");
      setXenConnectError(err?.message || String(err));
    }
  }, [xenConnectHost, xenConnectPortText, xenConnectPassword]);

  const disconnectXen = useCallback(() => {
    if (xenSocketRef.current) {
      xenSocketRef.current.disconnect();
      xenSocketRef.current = null;
    }
    setXenConnectState("idle");
    setXenConnectError(null);
  }, []);

  const beginRemoteHandshake = useCallback(async () => {
    try {
      const role = roleRef.current === "sender" ? "sender" : "receiver";
      setRemote({ status: "connecting", errorMessage: null });
      if (role === "receiver") {
        const code = generateInviteCode();
        setReceiverInviteCode(code);
        const peerConn = await createReceiverPeer(code);
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

  const turnRemoteOff = useCallback(() => setRemote({ status: "off" }), []);
  const armAsReceiver = useCallback(() => {
    roleRef.current = "receiver";
    setReceiverInviteCode(null);
    setRemote({ status: "receiver_armed" });
    beginRemoteHandshake();
  }, [beginRemoteHandshake]);
  const armAsSender = useCallback(() => {
    roleRef.current = "sender";
    setRemote({ status: "sender_armed" });
  }, []);
  const disconnectRemote = useCallback(() => {
    const peerConn = peerRef.current;
    if (peerConn) {
      try { peerConn.peer.destroy(); } catch {}
      peerRef.current = null;
    }
    setRemote({ status: "off" });
  }, []);

  // Receiver: listen for remote note events
  useEffect(() => {
    const peerConn = peerRef.current;
    if (!peerConn || remote.status !== "connected" || roleRef.current !== "receiver") return;
    const onData = (msg: any) => {
      try {
        if ((msg as SettingsSyncPayload)?.kind === "settings-sync") {
          const parsed = msg as SettingsSyncPayload;
          setWaveform(parsed.waveform);
          setEnvelope(parsed.envelope);
          setVolumePct(parsed.volumePct);
          setStartingOctave(parsed.startingOctave);
          setA4Frequency(parsed.a4Frequency);
          setTuneCIn12Edo(parsed.tuneCIn12Edo);
        } else if ((msg as NoteOnMsg).type === "noteOn") {
          const m = msg as NoteOnMsg;
          setRemotePressedIds((prev) => prev.includes(m.data.id) ? prev : [...prev, m.data.id]);
          onIdPress(m.data.id, m.data.freq);
        } else if ((msg as NoteOffMsg).type === "noteOff") {
          const m = msg as NoteOffMsg;
          setRemotePressedIds((prev) => prev.filter((i) => i !== m.data.id));
          onIdRelease(m.data.id);
        }
      } catch { /* ignore bad payloads */ }
    };
    peerConn.conn.on("data", onData);
    return () => { peerConn.conn.off("data", onData); };
  }, [remote.status, setWaveform, setEnvelope, setVolumePct, setStartingOctave, setA4Frequency, setTuneCIn12Edo, onIdPress, onIdRelease]);

  // Sender: sync settings
  useEffect(() => {
    const peerConn = peerRef.current;
    if (!peerConn || remote.status !== "connected" || roleRef.current !== "sender") return;
    const payload: SettingsSyncPayload = {
      kind: "settings-sync",
      manifestName: "31edo",
      waveform,
      envelope,
      volumePct,
      startingOctave,
      octaveCount,
      a4Frequency,
      tuneCIn12Edo,
    };
    peerConn.conn.send(payload);
  }, [remote.status, waveform, envelope, volumePct, startingOctave, a4Frequency, tuneCIn12Edo]);

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
            color: black; cursor: pointer; user-select: none;
            &:visited { color: black; }
            font-size: 2rem; background: white; border: 2px solid black;
            border-radius: 50%; width: 2.5rem; height: 2.5rem;
            display: flex; align-items: center; justify-content: center;
          `}
        >
          <FaHome />
        </A>

        {/* Link to piano keyboard */}
        <A
          href="/play"
          css={css`
            color: black; cursor: pointer; user-select: none;
            &:visited { color: black; }
            background: white; border: 2px solid black; border-radius: 0.25rem;
            padding: 0.25rem 0.5rem; text-decoration: none; white-space: nowrap;
            font-size: 0.9rem;
          `}
        >
          Piano
        </A>

        <Span color="white" style={{ fontWeight: 700, whiteSpace: "nowrap" }}>
          31-EDO Bosanquet
        </Span>

        <Div display="flex" alignItems="center">
          <VolumeSlider value={volumePct} onChange={setVolumePct} />
        </Div>

        <Button onClick={() => setShowResetConfirm(true)} padding="0.5rem">
          Reset All Settings
        </Button>

        <Button onClick={openRemoteDialog} padding="0.5rem">
          Set up remote play
        </Button>
        <Button onClick={openXenConnectDialog} padding="0.5rem">
          XenConnect
        </Button>

        <Div display="flex" alignItems="center" gap="0.5rem">
          <Span color="white">A4: {a4Frequency.toFixed(2)} Hz</Span>
          <Button
            padding="0.25rem 0.5rem"
            onClick={() => { setA4FrequencyInput(a4Frequency.toString()); setShowA4Dialog(true); }}
          >
            Change
          </Button>
          <label style={{ color: "white", display: "flex", gap: "0.25rem" }}>
            <input
              type="checkbox"
              checked={tuneCIn12Edo}
              onChange={(e) => setTuneCIn12Edo(e.target.checked)}
            />
            Tune C in 12edo
          </label>
        </Div>

        <Select
          value={waveform}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => setWaveform(e.target.value as Waveform)}
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
          <input type="number" min={0} step={0.01} value={envelope.attack}
            onChange={(e) => setEnvelope({ ...envelope, attack: parseFloat(e.target.value) || 0 })}
            style={{ width: "4rem", marginLeft: "0.25rem" }} />
        </label>
        <label style={{ color: "white" }}>
          D:
          <input type="number" min={0} step={0.01} value={envelope.decay}
            onChange={(e) => setEnvelope({ ...envelope, decay: parseFloat(e.target.value) || 0 })}
            style={{ width: "4rem", marginLeft: "0.25rem" }} />
        </label>
        <label style={{ color: "white" }}>
          S:
          <input type="number" min={0} max={1} step={0.05} value={envelope.sustain}
            onChange={(e) => setEnvelope({ ...envelope, sustain: parseFloat(e.target.value) || 0 })}
            style={{ width: "4rem", marginLeft: "0.25rem" }} />
        </label>
        <label style={{ color: "white" }}>
          R:
          <input type="number" min={0} step={0.01} value={envelope.release}
            onChange={(e) => setEnvelope({ ...envelope, release: parseFloat(e.target.value) || 0 })}
            style={{ width: "4rem", marginLeft: "0.25rem" }} />
        </label>

        <NumberStepper label="Oct Start:" value={startingOctave} onChange={setStartingOctave} min={0} />
        <NumberStepper label="Octaves:" value={octaveCount} onChange={setOctaveCount} min={1} max={6} />

        {/* Recording controls */}
        <Div display="flex" gap="0.5rem" marginLeft="auto" alignItems="center">
          {!isRecording ? (
            <Button onClick={handleRecordStart} background="#d32f2f" color="white" padding="0.5rem 1rem">
              ● Record
            </Button>
          ) : (
            <Div display="flex" gap="0.5rem">
              <Button onClick={handleRecordStopSave} background="#2e7d32" color="white" padding="0.5rem 1rem">
                ■ Stop & Save
              </Button>
              <Button onClick={handleRecordStopDiscard} background="#616161" color="white" padding="0.5rem 1rem">
                ✕ Stop & Discard
              </Button>
            </Div>
          )}
          <audio
            ref={audioRef}
            src={activeUrl ?? undefined}
            controls
            onPlay={() => {
              const el = audioRef.current;
              if (el && playbackEnd != null && el.currentTime >= playbackEnd) el.currentTime = playbackStart;
            }}
            style={{ maxWidth: 260, pointerEvents: isRecording ? "none" : "auto", opacity: isRecording ? 0.5 : 1 }}
            aria-disabled={isRecording}
          />
          <A
            href={activeUrl ?? undefined}
            download={canDownload ? filename : undefined}
            aria-disabled={!canDownload || isRecording}
            css={css`
              pointer-events: ${canDownload && !isRecording ? "auto" : "none"};
              opacity: ${canDownload && !isRecording ? 1 : 0.5};
            `}
            background="white" color="black" padding="0.5rem 0.75rem" borderRadius="0.375rem"
            title={canDownload ? (isRecording ? "Disabled while recording" : "Download recording") : "Record something first"}
          >
            Download
          </A>
        </Div>
      </Header>

      <Main
        width="100%"
        ref={playAreaRef}
        height={`${bodyHeight - cpanelHeight}px`}
        background="#1a1a2e"
        position="relative"
        overflow="hidden"
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        {currentPlayAreaHeight > 0 && currentPlayAreaWidth > 0 && (
          <CanvasHexKeyboard
            manifest={manifest}
            layout={layout}
            refOctave={startingOctave}
            refStep={0}
            onIdPress={onIdPress}
            onIdRelease={onIdRelease}
            externalPressedIds={remotePressedIds}
            width={currentPlayAreaWidth}
            height={currentPlayAreaHeight}
          />
        )}
      </Main>

      {/* Click-to-start overlay */}
      {!started && (
        <div className="audio-modal" onClick={handleStart}>
          <span>Click to Start Audio</span>
        </div>
      )}

      {/* Reset confirm */}
      {showResetConfirm && (
        <div className="audio-modal">
          <Div background="white" padding="2rem" borderRadius="0.5rem" display="flex" flexDirection="column" gap="1rem" alignItems="center">
            <Span>Reset all settings to their defaults?</Span>
            <Div display="flex" gap="1rem">
              <Button onClick={handleResetSettings} background="red" color="white" padding="0.5rem 1rem">Confirm</Button>
              <Button onClick={() => setShowResetConfirm(false)} background="grey" color="white" padding="0.5rem 1rem">Cancel</Button>
            </Div>
          </Div>
        </div>
      )}

      {/* A4 tuning dialog */}
      {showA4Dialog && (
        <div className="audio-modal" role="dialog" aria-modal="true">
          <Div background="white" padding="1.5rem" borderRadius="0.5rem" display="flex" flexDirection="column" gap="1rem" alignItems="stretch" minWidth="20rem">
            <Span style={{ fontWeight: 700 }}>Reference Frequency (A4)</Span>
            <label>
              Frequency (Hz):
              <input type="number" min={1} step={0.01} value={a4FrequencyInput}
                onChange={(e) => setA4FrequencyInput(e.target.value)}
                style={{ marginLeft: "0.5rem" }} />
            </label>
            <Div display="flex" gap="0.5rem" justifyContent="flex-end">
              <Button onClick={() => { if (!isA4FrequencyValid) return; setA4Frequency(parsedA4Frequency); setShowA4Dialog(false); }} disabled={!isA4FrequencyValid}>OK</Button>
              <Button background="#eee" onClick={() => setShowA4Dialog(false)}>Cancel</Button>
            </Div>
          </Div>
        </div>
      )}

      {/* Remote Play dialog */}
      {showRemoteDialog && (
        <div className="audio-modal" role="dialog" aria-modal="true">
          <Div background="white" padding="1.5rem" borderRadius="0.5rem" display="flex" flexDirection="column" gap="0.75rem" minWidth="20rem" maxWidth="28rem">
            <Div display="flex" justifyContent="space-between" alignItems="center">
              <Span style={{ fontWeight: 700 }}>Remote Play</Span>
              <Button onClick={closeRemoteDialog}>Close</Button>
            </Div>
            {remote.status === "off" && (
              <>
                <Span>remote play is off</Span>
                <Div display="flex" gap="0.5rem" flexWrap="wrap">
                  <Button onClick={armAsReceiver}>Set up as remote play reciever</Button>
                  <Button onClick={armAsSender}>set up as remote play sender</Button>
                </Div>
              </>
            )}
            {(remote.status === "sender_armed" || remote.status === "receiver_armed") && (
              <>
                <Span>{remote.status === "sender_armed" ? "Sender selected." : "Receiver selected."}</Span>
                {remote.status === "receiver_armed" && (
                  <Div display="flex" flexDirection="column" gap="0.5rem">
                    {receiverInviteCode ? (
                      <><Span><strong>Share this code:</strong> {receiverInviteCode}</Span><Span>Waiting for sender to connect…</Span></>
                    ) : <Span>Preparing invite…</Span>}
                  </Div>
                )}
                {remote.status === "sender_armed" && (
                  <Div display="flex" flexDirection="column" gap="0.5rem">
                    <label>
                      Invite Code:
                      <input autoCapitalize="off" autoComplete="off" autoCorrect="off"
                        value={senderJoinCode} onChange={(e) => setSenderJoinCode(e.target.value.toUpperCase())} placeholder="6 letters/digits" />
                    </label>
                  </Div>
                )}
                <Div display="flex" gap="0.5rem">
                  {remote.status === "sender_armed" && <Button onClick={beginRemoteHandshake}>Connect as sender</Button>}
                  <Button background="#eee" onClick={turnRemoteOff}>Back</Button>
                </Div>
              </>
            )}
            {remote.status === "connecting" && (
              <>
                <Span style={{ fontSize: "0.9rem", opacity: 0.7 }}>Awaiting connection…</Span>
                {roleRef.current === "receiver" && <Span><strong>Invite Code:</strong> {receiverInviteCode}</Span>}
                <Button background="#eee" onClick={turnRemoteOff}>Cancel</Button>
              </>
            )}
            {remote.status === "connected" && (
              <>
                <Span style={{ fontWeight: 600 }}>Connected</Span>
                <Div display="flex" gap="0.5rem">
                  <Button onClick={disconnectRemote}>Disconnect</Button>
                  <Button onClick={closeRemoteDialog}>Close</Button>
                </Div>
              </>
            )}
            {remote.status === "error" && (
              <>
                <Span style={{ color: "#b00020" }}>{remote.errorMessage || "Remote play error."}</Span>
                <Div display="flex" gap="0.5rem">
                  <Button onClick={beginRemoteHandshake}>Retry</Button>
                  <Button background="#eee" onClick={turnRemoteOff}>Turn off</Button>
                </Div>
              </>
            )}
          </Div>
        </div>
      )}

      {/* XenConnect dialog */}
      {showXenConnectDialog && (
        <div className="audio-modal" role="dialog" aria-modal="true">
          <Div background="white" padding="1.5rem" borderRadius="0.5rem" display="flex" flexDirection="column" gap="0.75rem" minWidth="20rem" maxWidth="28rem">
            <Div display="flex" justifyContent="space-between" alignItems="center">
              <Span style={{ fontWeight: 700 }}>XenConnect</Span>
              <Button onClick={closeXenConnectDialog}>Close</Button>
            </Div>
            {xenConnectState === "idle" && (
              <>
                <label>Host:&nbsp;<input value={xenConnectHost} onChange={(e) => setXenConnectHost(e.target.value)} placeholder="localhost" /></label>
                <label>Port:&nbsp;<input value={xenConnectPortText} onChange={(e) => setXenConnectPortText(e.target.value)} placeholder="5072" /></label>
                <label>Password:&nbsp;<input type="password" value={xenConnectPassword} onChange={(e) => setXenConnectPassword(e.target.value)} /></label>
                <Div display="flex" gap="0.5rem">
                  <Button onClick={connectXen}>Connect</Button>
                  <Button background="#eee" onClick={closeXenConnectDialog}>Cancel</Button>
                </Div>
              </>
            )}
            {xenConnectState === "connecting" && (
              <><Span>Connecting to {xenConnectHost}:{xenConnectPortText}…</Span><Button background="#eee" onClick={disconnectXen}>Cancel</Button></>
            )}
            {xenConnectState === "connected" && (
              <><Span style={{ fontWeight: 600 }}>Connected</Span><Div display="flex" gap="0.5rem"><Button onClick={disconnectXen}>Disconnect</Button><Button onClick={closeXenConnectDialog}>Close</Button></Div></>
            )}
            {xenConnectState === "error" && (
              <><Span style={{ color: "#b00020" }}>{xenConnectError || "Connection error."}</Span><Div display="flex" gap="0.5rem"><Button onClick={connectXen}>Retry</Button><Button background="#eee" onClick={closeXenConnectDialog}>Close</Button></Div></>
            )}
          </Div>
        </div>
      )}
    </>
  );
}
