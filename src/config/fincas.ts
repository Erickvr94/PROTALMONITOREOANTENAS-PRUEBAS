const SANTA_PRISCILA_WS =
  import.meta.env.VITE_SANTA_PRISCILA_WS ?? "ws://localhost:3000";

export interface Finca {
  id: string;
  name: string;
  wsUrl: string | null;
  hasHistorico: boolean;
}

export const FINCAS: Finca[] = [
  {
    id: "ipsp",
    name: "IPSP",
    wsUrl: SANTA_PRISCILA_WS,
    hasHistorico: true,
  },
  {
    id: "naturisa",
    name: "Naturisa",
    wsUrl: null,
    hasHistorico: false,
  },
];

export function getFinca(id: string): Finca | undefined {
  return FINCAS.find((f) => f.id === id);
}
