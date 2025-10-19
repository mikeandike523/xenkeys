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

import XenKeyboard from "./components/XenKeyboard";
import type { Waveform, Envelope } from "./shared-types/audio-engine";
import Synth from "./audio/synth";
import { make12EDO } from "./data/edo-presets/12edo";
import { make24EDO } from "./data/edo-presets/24edo";
import { make31EDO } from "./data/edo-presets/31edo";
import type XenOctaveDisplayManifest from "./types/XenOctaveDisplayManifest";
import iota from "./utils/algorithms/iota";

const default12EdoManifest = make12EDO();
const default24EdoManifest = make24EDO();
const default31EdoManifest = make31EDO();

const manifestPresets = {
  "12edo": default12EdoManifest,
  "24edo": default24EdoManifest,
  "31edo": default31EdoManifest,
};

function MultiOctaveDisplay({
  manifest,
  width,
  height,
  rows,
  cols,
  startingOctave,
  onIdPress,
  onIdRelease,
}: {
  manifest: XenOctaveDisplayManifest;
  width: number;
  height: number;
  rows: number;
  cols: number;
  startingOctave: number;
  onIdPress: (pitchId: number, pitch: number) => void;
  onIdRelease: (pitchId: number) => void;
}) {
  const octaveWidth = width / cols;
  const octaveHeight = height / rows;
  return iota(rows).map((row) => {
    return iota(cols).map((col) => {
      const startX = col * octaveWidth;
      const startY = row * octaveHeight;
      const octaveNumber = startingOctave + (rows - 1 - row) * cols + col;
      const reactKey = `octave-${octaveNumber}`;
      // Lower octave above higher octave to account for partially overflowing keys
      const zIndex = cols - 1 - col;
      return (
        <Div key={reactKey}>
          <XenKeyboard
            zIndex={zIndex}
            width={octaveWidth}
            height={octaveHeight}
            manifest={manifest}
            top={startY}
            left={startX}
            octaveNumber={octaveNumber}
            onIdPress={onIdPress}
            onIdRelease={onIdRelease}
          />
        </Div>
      );
    });
  });
}

function App() {
  const bodyRef = useElementRefBySelector<HTMLBodyElement>("body");

  const bodySize = useElementSize(bodyRef);

  const cpanelRef = useRef<HTMLElement>(null);
  const playAreaRef = useRef<HTMLElement>(null);

  const cpanelRefSize = useElementSize(cpanelRef);

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
  const [startingOctave, setStartingOctave] = useState<number>(4);
  const [octaveRows, _setOctaveRows] = useState<number>(1);
  const [octaveCols, _setOctaveCols] = useState<number>(2);

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
  const toggleFullScreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  }, []);

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
        <Button
          onClick={() => setHeaderCollapsed(true)}
          padding="0.5rem"
        >
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
        <label style={{  color: "white" }}>
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
        <label style={{  color: "white" }}>
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
        <Div
          display="flex"
          flexDirection="row"
          alignItems="center"
          gap="0.5rem"
        >
          <Span color="white">Oct:</Span>
          <Button
            onClick={() => {
              setStartingOctave(startingOctave - 1);
            }}
          >
            &lt;
          </Button>
          <Span color="white">{startingOctave}</Span>
          <Button
            onClick={() => {
              setStartingOctave(startingOctave + 1);
            }}
          >
            &gt;
          </Button>
        </Div>
        <Div marginLeft="auto" display="flex" alignItems="center">
          <Button onClick={toggleFullScreen} padding="0.5rem">
            ⛶
          </Button>
        </Div>
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
      >
        {currentPlayAreaHeight > 0 && currentPlayAreaWidth > 0 && (
          <MultiOctaveDisplay
            manifest={manifest}
            rows={octaveRows}
            cols={octaveCols}
            startingOctave={startingOctave}
            onIdPress={onIdPress}
            onIdRelease={onIdRelease}
            width={currentPlayAreaWidth}
            height={currentPlayAreaHeight}
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
