import { useState, useEffect, useRef, useCallback } from "react";

export type WsStatus = "connecting" | "connected" | "disconnected";

export interface UseWebSocketReturn {
  status: WsStatus;
  messages: unknown[];
  lastMessage: unknown | null;
  send: (data: string) => void;
  clearMessages: () => void;
}

const RECONNECT_DELAY = 3000;
const MAX_MESSAGES = 200;

export function useWebSocket(url: string | null): UseWebSocketReturn {
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const [messages, setMessages] = useState<unknown[]>([]);
  const [lastMessage, setLastMessage] = useState<unknown | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setLastMessage(null);
  }, []);

  const send = useCallback((data: string) => {
    wsRef.current?.send(data);
  }, []);

  useEffect(() => {
    if (!url) return;

    let closed = false;

    function connect() {
      if (closed) return;
      setStatus("connecting");

      const ws = new WebSocket(url!);
      wsRef.current = ws;

      ws.onopen = () => {
        if (closed) return;
        setStatus("connected");
      };

      ws.onmessage = (event) => {
        if (closed) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          parsed = event.data;
        }
        setLastMessage(parsed);
        setMessages((prev) => {
          const next = [...prev, parsed];
          return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
        });
      };

      ws.onclose = () => {
        if (closed) return;
        setStatus("disconnected");
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [url]);

  return { status, messages, lastMessage, send, clearMessages };
}
