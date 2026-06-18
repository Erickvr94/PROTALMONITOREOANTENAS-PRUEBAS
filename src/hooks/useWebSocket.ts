import { useState, useEffect, useRef, useCallback } from "react";

export type WsStatus = "connecting" | "connected" | "disconnected";

const RECONNECT_DELAY = 3000;

export function useWebSocket(
  url: string | null,
  onMessage?: (data: unknown) => void,
  fincaId?: string,
) {
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const [tick, setTick] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

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
        if (fincaId) {
          ws.send(JSON.stringify({ accion: "suscribir", finca: fincaId }));
        }
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
        onMessageRef.current?.(parsed);
        // Trigger re-render so the component reads the updated ref
        setTick((t) => t + 1);
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
  }, [url, fincaId]);

  return { status, send, tick };
}
