
import {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ChangeEvent,
} from "react";
import {
  Button,
  Div,
  Header,
  Main,
  Option,
  Select,
  Span,
} from "style-props-html";

import "./App.css";
import { useElementRefBySelector } from "./hooks/fwk/useElementRefBySelector";
import { useElementSize } from "./hooks/fwk/useElementSize";
import { usePersistentState } from "./hooks/fwk/usePersistentState";

import CanvasKeyboard from "./components/CanvasKeyboard";
import { NumberStepper } from "./components/NumberStepper";
import type { Waveform, Envelope } from "./shared-types/audio-engine";
import Synth from "./audio/synth";
import { make12EDO } from "./data/edo-presets/12edo";
import { make22EDO } from "./data/edo-presets/22edo";
import { make19EDO } from "./data/edo-presets/19edo";
import { make24EDO } from "./data/edo-presets/24edo";
import { make31EDO } from "./data/edo-presets/31edo";
import { make36EDO } from "./data/edo-presets/36edo";
import { make41EDO } from "./data/edo-presets/41edo";
import { make48EDO } from "./data/edo-presets/48edo";
import { whiteKeyAspect } from "./data/piano-key-dimensions";

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

function App() {
  const bodyRef = useElementRefBySelector<HTMLBodyElement>("body");

  const bodySize = useElementSize(bodyRef);

  const cpanelRef = useRef<HTMLElement>(null);
  const playAreaRef = useRef<HTMLElement>(null);

  const cpanelRefSize = useElementSize(cpanelRef);

  const bodyWidth = bodySize?.width || 0;
  const bodyHeight = bodySize?.height || 0;

  const cpanelHeight = cpanelRefSize?.height || 0;

  const [manifestName, setManifestName, resetManifestName] =
    usePersistentState<keyof typeof manifestPresets>("manifestName", "12edo");
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

  useEffect(() => {
    if (bodyWidth > 0 && bodyHeight > 0) {
      // initialize with a default number of octaves and starting octave
      // This effect might not be needed anymore if persistent state is desired on first load
      // but keeping it in case the logic is to resize based on window size initially.
      // setOctaveCount(2);
      // setStartingOctave(4);
    }
  }, [bodyWidth, bodyHeight]);

  // Initialize the audio worklet once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    Synth.create().then((s) => {
      setSynth(s);
      s.setWaveform(waveform);
      s.setEnvelope(envelope);
    });
  }, []);

  useEffect(() => {
    if (synth) synth.setWaveform(waveform);
  }, [synth, waveform]);

  useEffect(() => {
    if (synth) synth.setEnvelope(envelope);
  }, [synth, envelope]);

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

  return (
    <>
      <Header
        width="100%"
        ref={cpanelRef}
        //  For debugging
        background="teal"
        padding="0.5rem"
        display="flex"
        flexDirection="row"
        alignItems="center"
        overflowX="auto"
        gap="0.5rem"
      >
        <Button onClick={() => setShowResetConfirm(true)} padding="0.5rem">
          Reset
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
      </Header>
      <Main
        width="100%"
        ref={playAreaRef}
        height={`${bodyHeight - cpanelHeight}px`}
        // for debugging
        background="orange"
        position="relative"
        overflow="auto"
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
      {!started && (
        <div className="audio-modal" onClick={handleStart}>
          <span>Click to Start Audio</span>
        </div>
      )}
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
    </>
  );
}

export default App;
