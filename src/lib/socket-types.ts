
export interface ServerToClientEvents {
    connect_error: (error: Error) => void;
    waitingForPartner: () => void;
    partnerFound: (data: { peerId: string; room: string; initiator: boolean }) => void;
    webrtcSignal: (data: { from: string; signal: any }) => void; // Consider more specific type for signal
    receiveMessage: (data: { from: string; message: string }) => void;
    peerDisconnected: () => void;
}

export interface ClientToServerEvents {
    findPartner: (data: { chatType: 'text' | 'video'; interests: string[] }) => void;
    webrtcSignal: (data: { to: string; signal: any }) => void; // Consider more specific type for signal
    sendMessage: (data: { room: string; message: string }) => void;
    leaveChat: (room: string) => void;
}

export interface InterServerEvents {
    // Currently no inter-server events defined
}

export interface SocketData {
    // You can define any custom data you want to attach to the socket instance
    // e.g., username: string;
}
