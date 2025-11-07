import { css } from "@emotion/react";
import { useRef, useEffect } from "react";
import { FaHome } from "react-icons/fa";
import { A, Button, Div, Header, Main } from "style-props-html";
import { useElementRefBySelector } from "../hooks/fwk/useElementRefBySelector";
import { useElementSize } from "../hooks/fwk/useElementSize";
import useMonacoEditor from "../hooks/useMonacoEditor";
import MonacoView from "../components/MonacoView";
import { usePersistentState } from "../hooks/fwk/usePersistentState";
import VolumeSlider from "../components/VolumeSlider";
import useConsoleViewState from "@/hooks/useConsoleViewState";
import ConsoleView from "@/components/ConsoleView";
import compile from "@/xenlang/compile";

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

  const consoleDivRef = useRef<HTMLDivElement>(null);

  const consoleState = useConsoleViewState(consoleDivRef);
  // Persist code editor content using IndexedDB
  const [code, setCode] = usePersistentState<string>("composeCode", "");

  // Load persisted code into editor when available
  useEffect(() => {
    codeEditorManager.setValue(code);
  }, [code, codeEditorManager]);

  // Save editor content on each change
  useEffect(() => {
    const editor = codeEditorManager.editor();
    if (!editor) return;
    const disposable = editor.onDidChangeModelContent(() => {
      setCode(codeEditorManager.getValue());
    });
    return () => disposable.dispose();
  }, [codeEditorManager, setCode]);

  const compileScript = async () => {
    compile(codeEditorManager.getValue(), {
      onLog: (msg) => consoleState.addMessage("log", msg),
      onWarning: (msg) => consoleState.addMessage("warning", msg),
      onError: (msg) => consoleState.addMessage("error", msg),
      onInfo: (msg) => consoleState.addMessage("info", msg),
    });
  };

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

        <Div marginLeft="auto"></Div>
        <Button onClick={compileScript} padding="0.5rem">
          Compile
        </Button>
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
        <ConsoleView ref={consoleDivRef} state={consoleState} height={`${bodyHeight - cpanelHeight}px`} overflowY="auto" />
      </Main>
    </>
  );
}
