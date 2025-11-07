
export type ConsoleViewMessageKind = "log" | "warning" | "error" | "info";

export type ConsoleViewMessage = {
    kind: ConsoleViewMessageKind;
    color: string;
    text: string;
}

export  interface ConsoleViewState {
    addMessage: (kind: ConsoleViewMessageKind,  text: string, color?: string) => void;
    updateMessage: (id: string, newMessage: ConsoleViewMessage) => void;
    removeMessage: (id: string) => void;
    getMessages: () => Array<[string, ConsoleViewMessage]>
    clearMessages: () => void
}
