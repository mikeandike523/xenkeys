import { css } from "@emotion/react";
import { A, Div, H1, Img } from "style-props-html";
import {type ReactNode } from "react";

const tileStyles = css`
  color: black;
  &:visited {
    color: black;
  }
  &:hover {
    transform: scale(1.05);
  }
  &:active {
    transform: scale(0.95);
  }
`;

function TileLink({ href, title, children }:{
    href: string;
    title: string;
    children?: ReactNode|ReactNode[];
  
}) {
  return (
    <A
      href={href}
      cursor="pointer"
      userSelect="none"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="flex-start"
      gap="8px"
      background="skyblue"
      borderRadius="4px"
      padding="4px"
      transformOrigin="center"
      transition="transform 0.3s ease-in-out"
      textDecoration="none"
      css={tileStyles}
    >
      <H1 fontSize="24px" fontWeight="bold">
        {title}
      </H1>
      {children}
    </A>
  );
}

export default function Home() {
  return (
    <Div
      width="100%"
      height="100%"
      display="flex"
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
    >
      <Div
        display="grid"
        gridTemplateColumns="auto auto"
        width="auto"
        columnGap="16px"
      >
        <TileLink href="/play" title="Play">
          <Img cssWidth="min(100dvw, 300px)" cssHeight="auto" src="/piano.png" />
        </TileLink>

        <TileLink href="/compose" title="Compose">
          <Div
            width="min(100%, 300px)"
            height="auto"
            aspectRatio={1.4}
            border="2px dashed black"
          >
            Image Under Construction
          </Div>
        </TileLink>
      </Div>
    </Div>
  );
}
