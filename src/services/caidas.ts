import type { CaidasResponse } from "../types/caidas";
import { apiFetch } from "./api";

export function fetchCaidas(fecha: string): Promise<CaidasResponse> {
  return apiFetch<CaidasResponse>(`/api/historial/caidas/${fecha}`);
}
