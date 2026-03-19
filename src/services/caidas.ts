import type { CaidasResponse, CaidasRangoResponse } from "../types/caidas";
import { apiFetch } from "./api";

export function fetchCaidas(fecha: string): Promise<CaidasResponse> {
  return apiFetch<CaidasResponse>(`/api/historial/caidas/${fecha}`);
}

export function fetchCaidasRango(
  fechaInicio: string,
  fechaFin: string,
): Promise<CaidasRangoResponse> {
  return apiFetch<CaidasRangoResponse>(
    `/api/historial/caidas/${fechaInicio}/${fechaFin}`,
  );
}
