import { useEffect, useRef, useCallback } from "react";
import { useButuStore } from "../store/useButuStore";
import type { SpatialMessage } from "../types";

const WS_PORT = 9001;
const RECONNECT_DELAY = 3000;

export function useWebSocketBridge(
  onIMUCoords: (x: number, y: number) => void,
  onPhysicalClick: () => void
) {
  const setWsConnected = useButuStore((s) => s.setWsConnected);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imuHistory = useRef<{ beta: number; gamma: number }[]>([]);

  const SCREEN_W = window.innerWidth;
  const SCREEN_H = window.innerHeight;

  const smoothIMU = useCallback(
    (beta: number, gamma: number): { x: number; y: number } => {
      imuHistory.current.push({ beta, gamma });
      if (imuHistory.current.length > 5) imuHistory.current.shift();

      const avgBeta =
        imuHistory.current.reduce((a, b) => a + b.beta, 0) /
        imuHistory.current.length;
      const avgGamma =
        imuHistory.current.reduce((a, b) => a + b.gamma, 0) /
        imuHistory.current.length;

      const clampedGamma = Math.max(-45, Math.min(45, avgGamma));
      const clampedBeta = Math.max(-45, Math.min(45, avgBeta - 45));

      const x = ((clampedGamma + 45) / 90) * SCREEN_W;
      const y = ((clampedBeta + 45) / 90) * SCREEN_H;

      return { x, y };
    },
    [SCREEN_W, SCREEN_H]
  );

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type: "ping", data: null }));
      };

      ws.onmessage = (event) => {
        try {
          const msg: SpatialMessage = JSON.parse(event.data as string);

          if (msg.type === "imu" && msg.data) {
            const imu = msg.data as { alpha: number; beta: number; gamma: number; timestamp: number };
            const { x, y } = smoothIMU(imu.beta, imu.gamma);
            onIMUCoords(x, y);
          } else if (msg.type === "click") {
            onPhysicalClick();
          }
        } catch {
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
    }
  }, [setWsConnected, smoothIMU, onIMUCoords, onPhysicalClick]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);
}
