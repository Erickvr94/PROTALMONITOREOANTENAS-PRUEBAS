// Para agregar una empresa: añade un objeto al array EMPRESAS.
// Para agregar una finca: añade un objeto al array fincas de la empresa correspondiente.
// Para quitar: elimina el objeto del array.

export interface Finca {
  id: string;
  name: string;
  wsUrl: string | null;
  hasHistorico: boolean;
  hasTendencias: boolean;
}

export interface Empresa {
  id: string;
  name: string;
  fincas: Finca[];
}

export const EMPRESAS: Empresa[] = [
  {
    id: "ipsp",
    name: "IPSP",
    fincas: [
      {
        id: "taura",
        name: "Taura",
        wsUrl:
          import.meta.env.VITE_SANTA_PRISCILA_WS ??
          "ws://localhost:8080/ws/ipsp",
        hasHistorico: true,
        hasTendencias: true,
      },
      {
        id: "chanduy",
        name: "Chanduy",
        wsUrl:
          import.meta.env.VITE_SANTA_PRISCILA_WS ??
          "ws://localhost:8080/ws/ipsp",
        hasHistorico: true,
        hasTendencias: true,
      },
      {
        id: "mexico",
        name: "Mexico",
        wsUrl:
          import.meta.env.VITE_SANTA_PRISCILA_WS ??
          "ws://localhost:8080/ws/ipsp",
        hasHistorico: true,
        hasTendencias: true,
      },
      {
        id: "cabala1",
        name: "Cabala 1",
        wsUrl:
          import.meta.env.VITE_SANTA_PRISCILA_WS ??
          "ws://localhost:8080/ws/ipsp",
        hasHistorico: true,
        hasTendencias: true,
      },
      {
        id: "cabala2",
        name: "Cabala 2",
        wsUrl:
          import.meta.env.VITE_SANTA_PRISCILA_WS ??
          "ws://localhost:8080/ws/ipsp",
        hasHistorico: true,
        hasTendencias: true,
      },
      //{ id: "panamano", name: "Pañanamo", wsUrl: import.meta.env.VITE_SANTA_PRISCILA_WS ?? "ws://localhost:8080/ws/ipsp", hasHistorico: false,  hasTendencias: false  },
      //{ id: "churute",  name: "Churute",  wsUrl: import.meta.env.VITE_SANTA_PRISCILA_WS ?? "ws://localhost:8080/ws/ipsp", hasHistorico: false,  hasTendencias: false  },
    ],
  },
  {
    id: "naturisa",
    name: "Naturisa",
    fincas: [],
  },
];

export function getEmpresa(empresaId: string): Empresa | undefined {
  return EMPRESAS.find((e) => e.id === empresaId);
}

export function getFinca(
  empresaId: string,
  fincaId: string,
): Finca | undefined {
  return getEmpresa(empresaId)?.fincas.find((f) => f.id === fincaId);
}
