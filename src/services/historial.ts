import type { GatewayState, DeviceState } from "../types/network";
import { apiFetch } from "./api";

export interface HistorialRecord {
  _id: string;
  timestamp: string;
  gateways: Record<string, GatewayState>;
  dispositivos: Record<string, Record<string, DeviceState>>;
}

export function fetchUltimaHora(
  empresaId: string,
  fincaId: string,
): Promise<HistorialRecord[]> {
  return apiFetch<HistorialRecord[]>(
    `/api/${empresaId}/${fincaId}/historial/ultima-hora`,
  );
}

export function fetchPorFecha(
  empresaId: string,
  fincaId: string,
  fecha: string,
): Promise<HistorialRecord[]> {
  return apiFetch<HistorialRecord[]>(
    `/api/${empresaId}/${fincaId}/historial/fecha/${fecha}`,
  );
}
