import type { CaidasResponse, CaidasRangoResponse } from "../types/caidas";
import { apiFetch } from "./api";

export function fetchCaidas(fincaId: string, fecha: string): Promise<CaidasResponse> {
  return apiFetch<CaidasResponse>(`/api/${fincaId}/historial/caidas/${fecha}`);
}

export function fetchCaidasRango(
  fincaId: string,
  fechaInicio: string,
  fechaFin: string,
): Promise<CaidasRangoResponse> {
  return apiFetch<CaidasRangoResponse>(
    `/api/${fincaId}/historial/caidas/${fechaInicio}/${fechaFin}`,
  );
}
