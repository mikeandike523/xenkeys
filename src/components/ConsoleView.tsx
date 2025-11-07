import { forwardRef } from "react";
import { Div, type DivProps } from "style-props-html";

import { type ConsoleViewState } from "@/shared-types/console-view";

export interface ConsoleViewProps extends DivProps {
  state: ConsoleViewState;
}

export default forwardRef<HTMLDivElement, ConsoleViewProps>(
  function ConsoleView({ state, ...rest }, ref) {
    return (
      <Div ref={ref} display="flex" flexDirection="column" gap="1rem" {...rest}>
        {state.getMessages().map(([id, message]) => (
          <Div whiteSpace="pre-wrap" fontFamily="monospace" color={message.color} width="100%" key={id}>
            {message.text}
          </Div>
        ))}
      </Div>
    );
  }
);
