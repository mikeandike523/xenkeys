import { useRef, useState } from "react";
import { Button, Header, Main } from "style-props-html";

import "./App.css";
import { useElementRefBySelector } from "./hooks/fwk/useElementRefBySelector";
import { useElementSize } from "./hooks/fwk/useElementSize";

import XenKeyboard from "./components/XenKeyboard";
import type XenOctaveDisplayManifest from "./types/XenOctaveDisplayManifest";
import { make12EDO } from "./data/edo-presets/12edo";

const default12EdoManifest = make12EDO();

function App() {
  const bodyRef = useElementRefBySelector<HTMLBodyElement>("body");

  const bodySize = useElementSize(bodyRef);

  const cpanelRef = useRef<HTMLElement>(null);
  const playAreaRef = useRef<HTMLElement>(null);

  const cpanelRefSize = useElementSize(cpanelRef);

  const bodyHeight = bodySize?.height || 0;
  const cpanelHeight = cpanelRefSize?.height || 0;

  const [manifest, setManifest] = useState<XenOctaveDisplayManifest>(default12EdoManifest)

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
      >
        {/* for debugging */}
        <Button>Test</Button>
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

