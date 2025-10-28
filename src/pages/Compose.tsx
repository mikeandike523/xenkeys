import { css } from "@emotion/react";
import { useRef } from "react";
import { FaHome } from "react-icons/fa";
import { A, Div, Header, Main } from "style-props-html";
import { useElementRefBySelector } from "../hooks/fwk/useElementRefBySelector";
import { useElementSize } from "../hooks/fwk/useElementSize";
import useMonacoEditor from "../hooks/useMonacoEditor";
import MonacoView from "../components/MonacoView";
import { usePersistentState } from "../hooks/fwk/usePersistentState";
import VolumeSlider from "../components/VolumeSlider";

export default function Compose() {
  const bodyRef = useElementRefBySelector<HTMLBodyElement>("body");
  const cpanelRef = useRef<HTMLElement>(null);
  const playAreaRef = useRef<HTMLElement>(null);

  const bodySize = useElementSize(bodyRef);
  const cpanelSize = useElementSize(cpanelRef);

  const bodyHeight = bodySize?.height || 0;
  const cpanelHeight = cpanelSize?.height || 0;

  const codeEditorManager = useMonacoEditor();

  const [volumePct, setVolumePct] = usePersistentState<number>("volume", 80);

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
      </Header>
      <Main
        ref={playAreaRef}
        width="100dvw"
        height={`${bodyHeight - cpanelHeight}px`}
        overflow="hidden"
        display="grid"
        gridTemplateRows="1fr"
        gridTemplateColumns="1fr 2fr 1fr"
      >
        <Div></Div>
        <MonacoView manager={codeEditorManager} />
        <Div></Div>
      </Main>
    </>
  );
}
