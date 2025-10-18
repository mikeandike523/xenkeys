import { useRef, useState, type ChangeEvent } from "react";
import { Button, Header, Main, Select, Option } from "style-props-html";

import "./App.css";
import { useElementRefBySelector } from "./hooks/fwk/useElementRefBySelector";
import { useElementSize } from "./hooks/fwk/useElementSize";

import XenKeyboard from "./components/XenKeyboard";
import type XenOctaveDisplayManifest from "./types/XenOctaveDisplayManifest";
import { make12EDO } from "./data/edo-presets/12edo";
import {make24EDO} from "./data/edo-presets/24edo";


const default12EdoManifest = make12EDO();
const default24EdoManifest = make24EDO();

const manifestPresets = {
  "12edo": default12EdoManifest,
  "24edo": default24EdoManifest,
}

function App() {
  const bodyRef = useElementRefBySelector<HTMLBodyElement>("body");

  const bodySize = useElementSize(bodyRef);

  const cpanelRef = useRef<HTMLElement>(null);
  const playAreaRef = useRef<HTMLElement>(null);

  const cpanelRefSize = useElementSize(cpanelRef);

  const bodyHeight = bodySize?.height || 0;
  const cpanelHeight = cpanelRefSize?.height || 0;

  const [manifestName, setManifestName] = useState<keyof typeof manifestPresets>("12edo");

  const manifest = manifestPresets[manifestName];

  const playAreaSize = useElementSize(playAreaRef);

  const currentPlayAreaWidth = playAreaSize?.width || 0;
  const currentPlayAreaHeight = playAreaSize?.height || 0;

  return (
    <>
      <Header
        width="100%"
        ref={cpanelRef}
        //  For debugging
        background="teal"
        padding="0.5rem"
      >
        <Select value={manifestName} onChange={(e: ChangeEvent<HTMLSelectElement>)=>{
          setManifestName(e.target.value as keyof typeof manifestPresets);
        }} fontSize="2rem">
          <Option value="12edo">12EDO</Option>
          <Option value="24edo">24EDO</Option>
        </Select>
      </Header>
      <Main
        width="100%"
        ref={playAreaRef}
        height={`${bodyHeight - cpanelHeight}px`}
        // for debugging
        background="orange"
        position="relative"
      >
        {
          currentPlayAreaHeight > 0 && currentPlayAreaWidth > 0 &&

          <XenKeyboard
            manifest={manifest}
            width={currentPlayAreaWidth}
            height={currentPlayAreaHeight}
            // Great for multi-octave displays later
            octaveNumber={4}
            top={0}
            left={0}
            ></XenKeyboard>
        }
      </Main>
    </>
  );
}

export default App;
function make12EDOManifest() {
  throw new Error("Function not implemented.");
}

