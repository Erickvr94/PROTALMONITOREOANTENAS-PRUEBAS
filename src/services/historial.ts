import type { GatewayState, DeviceState } from "../types/network";
import { apiFetch } from "./api";

export interface HistorialRecord {
  _id: string;
  timestamp: string;
  gateways: Record<string, GatewayState>;
  dispositivos: Record<string, Record<string, DeviceState>>;
}

export function fetchUltimaHora(): Promise<HistorialRecord[]> {
  return apiFetch<HistorialRecord[]>("/api/historial/ultima-hora");
}

export function fetchPorFecha(fecha: string): Promise<HistorialRecord[]> {
  return apiFetch<HistorialRecord[]>(`/api/historial/fecha/${fecha}`);
}
