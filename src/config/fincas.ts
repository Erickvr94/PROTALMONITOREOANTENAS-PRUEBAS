export interface Finca {
  id: string;
  name: string;
  wsUrl: string | null;
}

export const FINCAS: Finca[] = [
  {
    id: "ipsp",
    name: "IPSP",
    wsUrl: "ws://192.168.148.62:3000",
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
