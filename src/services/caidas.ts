import type { CaidasResponse, CaidasRangoResponse } from "../types/caidas";
import { apiFetch } from "./api";

export function fetchCaidas(
  empresaId: string,
  fincaId: string,
  fecha: string,
): Promise<CaidasResponse> {
  return apiFetch<CaidasResponse>(
    `/api/${empresaId}/${fincaId}/historial/caidas/${fecha}`,
  );
}

export function fetchCaidasRango(
  empresaId: string,
  fincaId: string,
  fechaInicio: string,
  fechaFin: string,
): Promise<CaidasRangoResponse> {
  return apiFetch<CaidasRangoResponse>(
    `/api/${empresaId}/${fincaId}/historial/caidas/${fechaInicio}/${fechaFin}`,
  );
}
