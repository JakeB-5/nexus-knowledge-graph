import { useState, useEffect, useRef, useCallback } from "react";

export type WebSocketStatus = "connecting" | "open" | "closing" | "closed" | "error";

interface UseWebSocketOptions {
  /** Auto-reconnect on disconnect */
  reconnect?: boolean;
  /** Initial delay before first reconnect attempt (ms) */
  reconnectDelay?: number;
  /** Max delay between reconnect attempts (ms) */
  maxReconnectDelay?: number;
  /** Max number of reconnect attempts (0 = unlimited) */
  maxRetries?: number;
  /** WebSocket protocols */
  protocols?: string | string[];
  /** Called when a message is received */
  onMessage?: (event: MessageEvent) => void;
  /** Called when connection opens */
  onOpen?: (event: Event) => void;
  /** Called when connection closes */
  onClose?: (event: CloseEvent) => void;
  /** Called on error */
  onError?: (event: Event) => void;
}

interface UseWebSocketReturn<T = unknown> {
  status: WebSocketStatus;
  lastMessage: T | null;
  send: (data: string | ArrayBuffer | Blob) => void;
  sendJson: (data: unknown) => void;
  disconnect: () => void;
  reconnect: () => void;
  retryCount: number;
}

/**
 * WebSocket hook with auto-reconnect and exponential backoff.
 */
export function useWebSocket<T = unknown>(
  url: string | null,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn<T> {
  const {
    reconnect: shouldReconnect = true,
    reconnectDelay = 1000,
    maxReconnectDelay = 30000,
    maxRetries = 10,
    protocols,
    onMessage,
    onOpen,
    onClose,
    onError,
  } = options;

  const [status, setStatus] = useState<WebSocketStatus>("closed");
  const [lastMessage, setLastMessage] = useState<T | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const manualDisconnect = useRef(false);

  const clearRetryTimer = () => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  const connect = useCallback(() => {
    if (!url) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    manualDisconnect.current = false;
    setStatus("connecting");

    const ws = new WebSocket(url, protocols);
    wsRef.current = ws;

    ws.onopen = (event) => {
      setStatus("open");
      retryCountRef.current = 0;
      setRetryCount(0);
      clearRetryTimer();
      onOpen?.(event);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data as string) as T;
        setLastMessage(parsed);
      } catch {
        setLastMessage(event.data as T);
      }
      onMessage?.(event);
    };

    ws.onclose = (event) => {
      setStatus("closed");
      onClose?.(event);

      if (!manualDisconnect.current && shouldReconnect) {
        const count = retryCountRef.current + 1;
        if (maxRetries === 0 || count <= maxRetries) {
          const delay = Math.min(
            reconnectDelay * Math.pow(2, retryCountRef.current),
            maxReconnectDelay
          );
          retryCountRef.current = count;
          setRetryCount(count);
          retryTimerRef.current = setTimeout(connect, delay);
        }
      }
    };

    ws.onerror = (event) => {
      setStatus("error");
      onError?.(event);
    };
  }, [url, protocols, shouldReconnect, reconnectDelay, maxReconnectDelay, maxRetries, onOpen, onMessage, onClose, onError]);

  const disconnect = useCallback(() => {
    manualDisconnect.current = true;
    clearRetryTimer();
    if (wsRef.current) {
      setStatus("closing");
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const reconnectManual = useCallback(() => {
    disconnect();
    // Brief delay to allow socket to fully close
    setTimeout(connect, 100);
  }, [disconnect, connect]);

  const send = useCallback((data: string | ArrayBuffer | Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    } else {
      console.warn("useWebSocket: cannot send, socket is not open");
    }
  }, []);

  const sendJson = useCallback(
    (data: unknown) => send(JSON.stringify(data)),
    [send]
  );

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (url) connect();
    return () => {
      manualDisconnect.current = true;
      clearRetryTimer();
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return { status, lastMessage, send, sendJson, disconnect, reconnect: reconnectManual, retryCount };
}
