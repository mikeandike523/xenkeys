type LogMessage = {
    text: string;
    color: string;
    id: string
}

export default interface LiveLogManager {
    messages: LogMessage[];
    addMessage: (message: LogMessage) => void;
    updateMessage: (id: string, newData: Partial<LogMessage>) => void;
    removeMessage: (id: string) => void;
    clearMessages: () => void;
}