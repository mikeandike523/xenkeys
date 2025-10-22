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

import CanvasKeyboard from "./components/CanvasKeyboard";
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


function App() {
  const bodyRef = useElementRefBySelector<HTMLBodyElement>("body");

  const bodySize = useElementSize(bodyRef);

  const cpanelRef = useRef<HTMLElement>(null);
  const playAreaRef = useRef<HTMLElement>(null);

  const cpanelRefSize = useElementSize(cpanelRef);

  const bodyWidth = bodySize?.width || 0;
  const bodyHeight = bodySize?.height || 0;

  const cpanelHeight = cpanelRefSize?.height || 0;

  const [manifestName, setManifestName] =
    useState<keyof typeof manifestPresets>("12edo");
  const [waveform, setWaveform] = useState<Waveform>("sine");
  const [envelope, setEnvelope] = useState<Envelope>({
    attack: 0.01,
    decay: 0.1,
    sustain: 0.7,
    release: 0.5,
  });
  const [synth, setSynth] = useState<Synth | null>(null);
  const [started, setStarted] = useState(false);
  const [startingOctave, setStartingOctave] = useState<number | null>(null);
  const [octaveCount, setOctaveCount] = useState<number | null>(null);

  useEffect(() => {
    if (bodyWidth > 0 && bodyHeight > 0) {
      // initialize with a default number of octaves and starting octave
      setOctaveCount(2);
      setStartingOctave(4);
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

  const [headerCollapsed, setHeaderCollapsed] = useState(false);

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
      {headerCollapsed ? (
        <Button
          position="fixed"
          top="0.5rem"
          left="0.5rem"
          background="teal"
          color="white"
          padding="0.5rem"
          zIndex={9999}
          onClick={() => setHeaderCollapsed(false)}
        >
          ☰
        </Button>
      ) : (
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
          <Button onClick={() => setHeaderCollapsed(true)} padding="0.5rem">
            ☰
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
          {startingOctave !== null && (
            <Div display="flex" flexDirection="row" alignItems="center" gap="0.5rem">
              <Span color="white">Oct Start:</Span>
              <Button onClick={() => setStartingOctave(startingOctave - 1)}>&lt;</Button>
              <Span color="white">{startingOctave}</Span>
              <Button onClick={() => setStartingOctave(startingOctave + 1)}>&gt;</Button>
            </Div>
          )}
          {octaveCount !== null && (
            <Div display="flex" flexDirection="row" alignItems="center" gap="0.5rem">
              <Span color="white">Octaves:</Span>
              <input
                type="number"
                min={1}
                step={1}
                value={octaveCount}
                onChange={(e) => setOctaveCount(parseInt(e.target.value) || 1)}
                style={{ width: "3rem", marginLeft: "0.25rem" }}
              />
            </Div>
          )}
        </Header>
      )}
      <Main
        width="100%"
        ref={playAreaRef}
        height={`${bodyHeight - cpanelHeight}px`}
        // for debugging
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
      {!started && (
        <div className="audio-modal" onClick={handleStart}>
          <span>Click to Start Audio</span>
        </div>
      )}
    </>
  );
}

export default App;
