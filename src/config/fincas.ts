const SANTA_PRISCILA_WS =
  import.meta.env.SANTA_PRISCILA_WS ?? "ws://localhost:3000";

export interface Finca {
  id: string;
  name: string;
  wsUrl: string | null;
}

export const FINCAS: Finca[] = [
  {
    id: "ipsp",
    name: "IPSP",
    wsUrl: SANTA_PRISCILA_WS,
  },
  {
    id: "naturisa",
    name: "Naturisa",
    wsUrl: null,
  },
];

export function getFinca(id: string): Finca | undefined {
  return FINCAS.find((f) => f.id === id);
}
