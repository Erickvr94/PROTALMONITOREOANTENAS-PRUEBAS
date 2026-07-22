/* ─────────────────────────────────────────────────────────────────────────
   Capas base del mapa. Todas son gratuitas y sin API key.
   Modulo aparte: MapaPage puede montar el mismo selector sin
   duplicar URLs ni atribuciones.
   ───────────────────────────────────────────────────────────────────────── */

import L from "leaflet";

export interface CapaBase {
  id: string;
  etiqueta: string;
  url: string;
  atribucion: string;
  maxZoom: number;
  /** Capa de etiquetas encima (la imagen satelital no trae nombres). */
  overlay?: { url: string; maxZoom: number };
  /** true si la capa es oscura: sirve para ajustar contrastes del marcador. */
  oscura?: boolean;
}

export const CAPAS_BASE: CapaBase[] = [
  {
    id: "satelite",
    etiqueta: "Satelite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    atribucion: "Imagenes &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
    overlay: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      maxZoom: 19,
    },
    oscura: true,
  },
  {
    id: "calles",
    etiqueta: "Calles",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    atribucion: "&copy; OpenStreetMap",
    maxZoom: 19,
  },
  {
    id: "hibrido",
    etiqueta: "Hibrido",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    atribucion: "Imagenes &copy; Esri &mdash; Calles &copy; Esri",
    maxZoom: 19,
    overlay: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
      maxZoom: 19,
    },
    oscura: true,
  },
  {
    id: "topo",
    etiqueta: "Topografico",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    atribucion: "&copy; OpenTopoMap, &copy; OpenStreetMap",
    maxZoom: 17,
  },
  {
    id: "claro",
    etiqueta: "Claro",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    atribucion: "&copy; CARTO, &copy; OpenStreetMap",
    maxZoom: 20,
  },
  {
    id: "oscuro",
    etiqueta: "Oscuro",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    atribucion: "&copy; CARTO, &copy; OpenStreetMap",
    maxZoom: 20,
    oscura: true,
  },
];

export const CAPA_POR_DEFECTO = "satelite";

export function buscarCapa(id: string): CapaBase {
  return CAPAS_BASE.find((c) => c.id === id) ?? CAPAS_BASE[0];
}

/**
 * Monta una capa base (mas su overlay de etiquetas si lo tiene) y devuelve
 * los layers creados para poder retirarlos al cambiar de capa.
 */
export function montarCapaBase(map: L.Map, id: string): L.TileLayer[] {
  const capa = buscarCapa(id);
  const capas: L.TileLayer[] = [
    L.tileLayer(capa.url, { maxZoom: capa.maxZoom, attribution: capa.atribucion }),
  ];
  if (capa.overlay) {
    capas.push(L.tileLayer(capa.overlay.url, { maxZoom: capa.overlay.maxZoom }));
  }
  // Las capas base van al fondo para no tapar marcadores ni polilineas.
  for (const c of capas) c.addTo(map).bringToBack();
  return capas;
}