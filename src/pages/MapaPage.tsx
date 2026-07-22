import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, Navigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getFinca } from "../config/empresas";
import { apiFetch } from "../services/api";
import { useWebSocket, type WsStatus } from "../hooks/useWebSocket";
import { useMantenimiento } from "../hooks/useMantenimiento";
import type { EquipoMant, EstadoMant } from "../types/tiposMantenimiento";
import "./MapaPage.css";

interface EstadoAntena {
  online: boolean | null;
  potencia: number | null;
  fecha: string | null;
}

interface Antena {
  id: string;
  nombre: string;
  grupo: string;
  tipo: string; // "antena" | "HMI" | "PLC" | "Raspberry" | ...
  ip: string;
  ubicacion: string | null;
  coordenadas: { lat: number | null; lon: number | null };
  estado: EstadoAntena;
  error: string | null;
}

interface MapaResponse {
  finca: string;
  timestamp: string;
  resumen: Record<string, number>;
  antenas: Antena[];
}

interface WsDispositivo {
  ip: string;
  ubicacion: string;
  online: boolean | null;
  potencia?: number | null;
  error?: string | null;
  ultimaActualizacion?: string;
}
interface WsEstadoCompleto {
  tipo: string;
  dispositivos?: Record<string, Record<string, WsDispositivo>>;
}

/*Clasificación */
type Caso = "ok" | "weak" | "nolink" | "down" | "nd" | "equipo";

const COLORES: Record<Caso, string> = {
  ok: "#16a34a",
  weak: "#eab308",
  nolink: "#f97316",
  down: "#dc2626",
  nd: "#9ca3af",
  equipo: "#16a34a",
};

const EMOJI_EQUIPO: Record<string, string> = {
  HMI: "🖥️",
  PLC: "📟",
  Raspberry: "🍓",
};

/* ── Modo mantenimiento: colores y helpers ─────────────────────────────── */

type Modo = "red" | "mant";

/* Paleta de grupos. Los primeros toman colores fijos; a partir de ahi se
   deriva un tono estable del nombre, para soportar N grupos sin tocar codigo. */
const PALETA = ["#2563eb", "#ea580c", "#0891b2", "#7c3aed", "#db2777", "#65a30d", "#0d9488"];
const cacheColor = new Map<string, string>();

function colorGrupo(g: string): string {
  const yaEsta = cacheColor.get(g);
  if (yaEsta) return yaEsta;
  let h = 0;
  for (let i = 0; i < g.length; i++) h = (h * 31 + g.charCodeAt(i)) >>> 0;
  const c = PALETA[h % PALETA.length];
  cacheColor.set(g, c);
  return c;
}

const COLOR_ESTADO_MANT: Record<EstadoMant, string> = {
  Pendiente: "#94a3b8",
  "En Proceso": "#d97706",
  Terminado: "#16a34a",
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function clasificar(a: Antena): Caso {
  if (a.tipo !== "antena") return "equipo";
  const e = a.estado;
  if (e.online === null) return "nd";
  if (!e.online) return "down";
  if (e.potencia === null) return "nolink";
  if (e.potencia <= -78) return "weak";
  return "ok";
}

function pill(a: Antena): [string, string] {
  if (a.tipo !== "antena")
    return a.estado.online
      ? ["🟢 EN LÍNEA", "pill-ok"]
      : a.estado.online === false
        ? ["🔴 APAGADO", "pill-down"]
        : ["SIN DATOS", "pill-nd"];
  switch (clasificar(a)) {
    case "ok":
      return [`${a.estado.potencia} dBm ✅`, "pill-ok"];
    case "weak":
      return [`${a.estado.potencia} dBm ⚠️`, "pill-weak"];
    case "nolink":
      return ["SIN ENLACE", "pill-nolink"];
    case "down":
      return ["SIN COMUNICACIÓN", "pill-down"];
    default:
      return ["SIN DATOS", "pill-nd"];
  }
}

/** Bloque de mantenimiento del popup: plan + orden + ejecucion. */
function popupMantHtml(
  eq: EquipoMant | null,
  editable: boolean,
  ordenActiva: { id: string; numero: string; grupo: string } | null,
): string {
  if (!eq) {
    return editable
      ? `<div class="mp-crono mp-crono-vacio">Equipo sin fila en el plan de mantenimiento</div>`
      : "";
  }
  const gc = colorGrupo(eq.grupo);
  const ec = COLOR_ESTADO_MANT[eq.estado];
  const id = eq.plan?.id ?? "";

  const editor = !editable
    ? ""
    : ordenActiva
      ? `
      <div class="mp-crono-edit">
        <div class="mp-ot">Registrando en <b>${esc(ordenActiva.numero)}</b> · Grupo ${esc(ordenActiva.grupo)}</div>
        <input class="mp-obs" data-mant-obs="${esc(id)}" placeholder="Observacion (opcional)"
               value="${esc(eq.ejecucion?.observaciones ?? "")}" />
        <div class="mp-crono-btns">
          <button class="gb gb-proc" data-mant-action="En Proceso" data-mant-id="${esc(id)}">En Proceso</button>
          <button class="gb gb-fin"  data-mant-action="Terminado"  data-mant-id="${esc(id)}">Terminado</button>
        </div>
      </div>`
      : `<div class="mp-crono-edit mp-crono-vacio">Selecciona una orden activa en la barra para poder marcar avances</div>`;

  return `
    <div class="mp-crono">
      <div class="pr"><span class="pk">Grupo</span>
        <span class="pill" style="background:${gc}22;color:${gc}">${esc(eq.grupo)}</span></div>
      <div class="pr"><span class="pk">Estado</span>
        <span class="pill" style="background:${ec}22;color:${ec}">${esc(eq.estado)}</span></div>
      ${eq.fechaTrabajo ? `<div class="pr"><span class="pk">Dia trabajado</span><span class="pv">${esc(eq.fechaTrabajo)}</span></div>` : ""}
      ${eq.orden ? `<div class="pr"><span class="pk">Orden</span><span class="pv">${esc(eq.orden.numero)}</span></div>` : ""}
      ${eq.plan ? `<div class="pr"><span class="pk">Planificado</span><span class="pv">Dia ${eq.plan.diaPlan} · ${esc(eq.plan.fechaPlan)}</span></div>` : ""}
      ${eq.plan?.mantenimiento ? `<div class="pr"><span class="pk">Tipo</span><span class="pv">${esc(eq.plan.mantenimiento)}</span></div>` : ""}
      ${eq.ejecucion?.observaciones ? `<div class="pr"><span class="pk">Obs.</span><span class="pv pv-wrap">${esc(eq.ejecucion.observaciones)}</span></div>` : ""}
      ${eq.ejecucion ? `<div class="pr"><span class="pk">Ult. edicion</span><span class="pv">${esc(eq.ejecucion.actualizadoEn)}</span></div>` : ""}
      ${editor}
    </div>`;
}

function popupHtml(
  a: Antena,
  torre?: { idx: number; total: number },
  extra = "",
): string {
  const [ptxt, pcls] = pill(a);
  const fecha = a.estado.fecha
    ? new Date(a.estado.fecha).toLocaleString("es-EC", { timeZone: "America/Guayaquil" })
    : "—";
  const torreFila =
    torre && torre.total > 1
      ? `<div class="pr"><span class="pk">Torre</span><span class="pv" style="color:#0284c7">🗼 ${torre.total} equipos (${torre.idx + 1}/${torre.total})</span></div>`
      : "";
  const tipoFila =
    a.tipo !== "antena"
      ? `<div class="pr"><span class="pk">Tipo</span><span class="pv">${EMOJI_EQUIPO[a.tipo] ?? "📟"} ${a.tipo}</span></div>`
      : "";
  return `
    <div class="mp-pop">
      <div class="pn">${a.tipo === "antena" ? "📡" : (EMOJI_EQUIPO[a.tipo] ?? "📟")} ${a.nombre}</div>
      <div class="pr"><span class="pk">Estado</span><span class="pill ${pcls}">${ptxt}</span></div>
      ${tipoFila}
      <div class="pr"><span class="pk">IP</span><span class="pv">${a.ip}</span></div>
      <div class="pr"><span class="pk">Grupo</span><span class="pv">${a.grupo}</span></div>
      ${a.ubicacion ? `<div class="pr"><span class="pk">Ubicación</span><span class="pv">${a.ubicacion}</span></div>` : ""}
      ${torreFila}
      <div class="pr"><span class="pk">Actualizado</span><span class="pv">${fecha}</span></div>
      ${a.error && !a.estado.online ? `<div class="mp-pop-error">${a.error}</div>` : ""}
      ${extra}
    </div>`;
}

function iconoMant(eq: EquipoMant | null, torre?: { idx: number; total: number }): L.DivIcon {
  const badge =
    torre && torre.total > 1 ? `<div class="tower-badge">${torre.idx + 1}/${torre.total}</div>` : "";
  if (!eq) {
    return L.divIcon({
      html: `<div class="mw mw-lg mw-sincrono"><div class="mc mc-lg"></div></div>`,
      className: "",
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -20],
    });
  }
  const gc = colorGrupo(eq.grupo);
  const bg = eq.estado === "Pendiente" ? gc : COLOR_ESTADO_MANT[eq.estado];
  const symb = eq.estado === "Terminado" ? "OK" : eq.estado === "En Proceso" ? "..." : eq.grupo.slice(0, 2);
  return L.divIcon({
    html: `<div class="mw mw-lg"><div class="mc mc-lg mc-mant" style="background:${bg};border-color:${gc}">${symb}</div>${badge}</div>`,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20],
  });
}

function iconoDe(a: Antena, torre?: { idx: number; total: number }): L.DivIcon {
  const caso = clasificar(a);
  if (a.tipo !== "antena") {
    const color = a.estado.online ? "#16a34a" : a.estado.online === false ? "#dc2626" : "#9ca3af";
    return L.divIcon({
      html: `<div class="mw-eq" style="--mk:${color}">${EMOJI_EQUIPO[a.tipo] ?? "📟"}</div>`,
      className: "",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -16],
    });
  }
  const badge =
    torre && torre.total > 1 ? `<div class="tower-badge">🗼${torre.idx + 1}/${torre.total}</div>` : "";
  return L.divIcon({
    html: `<div class="mw mk-${caso}" style="--mk:${COLORES[caso]}"><div class="mr"></div><div class="mc"></div>${badge}</div>`,
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -15],
  });
}

function spiralOffset(index: number, total: number): [number, number] {
  if (total === 1) return [0, 0];
  const STEP = 0.00011;
  const angle = (index / total) * 2 * Math.PI;
  return [STEP * Math.sin(angle), STEP * Math.cos(angle)];
}

/* ── Centro dinámico del mapa ───────────────────────────────────────────────
   Prioridad: HMI_1 → HMI_2 → … → RB → cualquier otro equipo → torre        */

function tieneCoord(a: Antena): boolean {
  return a.coordenadas.lat != null && a.coordenadas.lon != null;
}

function coordDe(a: Antena): [number, number] {
  return [a.coordenadas.lat!, a.coordenadas.lon!];
}

function rankReferencia(a: Antena): number | null {
  const n = `${a.nombre} ${a.id}`.toLowerCase();

  const hmi = n.match(/hmi[_\-\s]?(\d+)/);
  if (hmi) return 100 + Number(hmi[1]);        // HMI_1 → 101, HMI_2 → 102…
  if (/\bhmi\b/.test(n)) return 150;           // HMI sin número

  const rb = n.match(/\brb[_\-\s]?(\d*)\b/);
  if (rb) return 200 + (Number(rb[1]) || 0);   // RB, RB1, RB_2…

  return null;
}

function centroDinamico(
  antenas: Antena[],
): { centro: [number, number]; zoom: number; origen: string } | null {
  const conCoord = antenas.filter(tieneCoord);
  if (!conCoord.length) return null;

  const refs = conCoord
    .map((a) => ({ a, r: rankReferencia(a) }))
    .filter((x): x is { a: Antena; r: number } => x.r !== null)
    .sort((x, y) => x.r - y.r);
  if (refs.length) {
    return { centro: coordDe(refs[0].a), zoom: 17, origen: refs[0].a.nombre };
  }

  const equipo = conCoord.find((a) => a.tipo !== "antena");
  if (equipo) return { centro: coordDe(equipo), zoom: 17, origen: equipo.nombre };

  const torre = conCoord.find((a) => a.tipo === "antena");
  if (torre) return { centro: coordDe(torre), zoom: 15, origen: `torre ${torre.nombre}` };

  return null;
}

/* Diagnóstico: cuántas coordenadas DISTINTAS manda el backend */
function diagnosticoCoords(antenas: Antena[]): void {
  const sinCoord = antenas.filter((a) => !tieneCoord(a));
  const distintas = new Set(
    antenas.filter(tieneCoord).map((a) => `${a.coordenadas.lat},${a.coordenadas.lon}`),
  );
  console.info(
    `[MapaPage] ${antenas.length} dispositivos · ${distintas.size} coordenadas distintas · ${sinCoord.length} sin coordenada`,
    [...distintas],
  );
  if (sinCoord.length) console.warn("[MapaPage] sin coordenada:", sinCoord.map((a) => a.nombre));
}

const STATUS_LABELS: Record<WsStatus, string> = {
  connecting: "Conectando...",
  connected: "Conectado",
  disconnected: "Desconectado",
};

type Filtro = "all" | "ok" | "weak" | "nolink" | "down" | "equipo";

/* ── Página ── */

export default function MapaPage() {
  const { empresaId, fincaId } = useParams<{ empresaId: string; fincaId: string }>();
  const finca = getFinca(empresaId ?? "", fincaId ?? "");

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const torreRef = useRef<Map<string, { idx: number; total: number }>>(new Map());

  const [antenas, setAntenas] = useState<Map<string, Antena>>(new Map());
  const [filtro, setFiltro] = useState<Filtro>("all");
  const [busqueda, setBusqueda] = useState("");
  const [panelAbierto, setPanelAbierto] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [ultimaAct, setUltimaAct] = useState<string>("—");

  /* ── Modo mantenimiento ── */
  const [modo, setModo] = useState<Modo>("red");
  const [diaSel, setDiaSel] = useState<string>("all"); // "all" | "sin" | "YYYY-MM-DD"
  const [grupoSel, setGrupoSel] = useState<string>("all");
  const [ordenActivaId, setOrdenActivaId] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);

  const fincaKey = `${empresaId}:${finca?.id ?? ""}`;
  const mant = useMantenimiento(finca ? fincaKey : null);
  const mantRef = useRef(mant);
  mantRef.current = mant;

  const avisar = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3000);
  }, []);

  /* Contadores para los badges del header */
  const stats = useMemo(() => {
    let ok = 0, weak = 0, nolink = 0, down = 0, equipos = 0, eqOk = 0;
    for (const a of antenas.values()) {
      const c = clasificar(a);
      if (c === "equipo") { equipos++; if (a.estado.online) eqOk++; }
      else if (c === "ok") ok++;
      else if (c === "weak") weak++;
      else if (c === "nolink") nolink++;
      else if (c === "down") down++;
    }
    return { ok, weak, nolink, down, equipos, eqOk, total: antenas.size };
  }, [antenas]);

  const coincide = useCallback(
    (a: Antena): boolean => {
      let pasaFiltro: boolean;

      if (modo === "mant") {
        const eq = mantRef.current.ver(a.id, a.nombre);
        if (!eq) return false; // sin plan de mantenimiento no se muestra
        // El filtro de dia usa la fecha REALMENTE trabajada, no la planificada.
        const pasaDia =
          diaSel === "all" ||
          (diaSel === "sin" ? !eq.fechaTrabajo : eq.fechaTrabajo === diaSel);
        const pasaGrupo = grupoSel === "all" || eq.grupo === grupoSel;
        pasaFiltro = pasaDia && pasaGrupo;
      } else {
        const c = clasificar(a);
        pasaFiltro = filtro === "all" || c === filtro;
      }

      if (!busqueda.trim()) return pasaFiltro;
      const q = busqueda.trim().toLowerCase();
      const texto = `${a.nombre} ${a.ip} ${a.grupo} ${a.ubicacion ?? ""} ${a.tipo}`.toLowerCase();
      return pasaFiltro && texto.includes(q);
    },
    // mant.datos entra a proposito: fuerza recalcular el filtro tras cada avance
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtro, busqueda, modo, diaSel, grupoSel, mant.datos],
  );

  const ordenActiva = useMemo(
    () => mant.ordenes.find((o) => o.id === ordenActivaId) ?? null,
    [mant.ordenes, ordenActivaId],
  );
  const ordenActivaRef = useRef(ordenActiva);
  ordenActivaRef.current = ordenActiva;

  const refrescarMarcador = useCallback(
    (a: Antena) => {
      const mk = markersRef.current.get(a.id);
      if (!mk) return;
      const torre = torreRef.current.get(a.id);
      const enMant = modo === "mant";
      const eq = enMant ? mantRef.current.ver(a.id, a.nombre) : null;
      mk.setIcon(enMant ? iconoMant(eq, torre) : iconoDe(a, torre));
      mk.setPopupContent(
        popupHtml(a, torre, popupMantHtml(eq, enMant, ordenActivaRef.current)),
      );
    },
    [modo],
  );

  /* Repintar todos los marcadores al cambiar de modo, al cambiar la orden
     activa, o cuando llegan avances (propios o desde el movil). */
  useEffect(() => {
    for (const a of antenas.values()) refrescarMarcador(a);
  }, [modo, mant.datos, ordenActiva, antenas, refrescarMarcador]);

  /* Mostrar/ocultar marcadores según filtro + búsqueda */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const a of antenas.values()) {
      const mk = markersRef.current.get(a.id);
      if (!mk) continue;
      if (coincide(a)) { if (!map.hasLayer(mk)) mk.addTo(map); }
      else if (map.hasLayer(mk)) map.removeLayer(mk);
    }
  }, [antenas, coincide]);

  /* Carga inicial */
  useEffect(() => {
    if (!finca || !mapDivRef.current || mapRef.current) return;

    console.info("[MapaPage] v6 cargada");
    const map = L.map(mapDivRef.current, {
      zoomControl: true,
      minZoom: 3,
      maxZoom: 19,
    });
    // Vista provisional: Leaflet exige una vista antes de agregar capas.
    // Se reemplaza en cuanto responde /api/:empresa/:finca/mapa
    map.setView([-1.8, -79.5], 6);
    mapRef.current = map;
    let activo = true;

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, maxNativeZoom: 19, attribution: "Tiles © Esri" },
    ).addTo(map);

    apiFetch<MapaResponse>(`/api/${empresaId}/${finca.id}/mapa`)
      .then((data) => {
        if (!activo || mapRef.current !== map) return;

        diagnosticoCoords(data.antenas);

        const porTorre = new Map<string, Antena[]>();
        for (const a of data.antenas) {
          if (a.coordenadas.lat == null || a.coordenadas.lon == null) continue;
          const t = `${a.coordenadas.lat},${a.coordenadas.lon}`;
          if (!porTorre.has(t)) porTorre.set(t, []);
          porTorre.get(t)!.push(a);
        }

       /* / /console.log("Mapa request", {
          empresaId,
          fincaId,
          path: `/api/${empresaId}/${finca?.id}/mapa`,
        });*/

        const mapa = new Map<string, Antena>();
        const bounds: [number, number][] = [];
        for (const grupo of porTorre.values()) {
          grupo.forEach((a, i) => {
            const torre = { idx: i, total: grupo.length };
            torreRef.current.set(a.id, torre);
            const [dLat, dLon] = spiralOffset(i, grupo.length);
            const lat = a.coordenadas.lat! + dLat;
            const lon = a.coordenadas.lon! + dLon;
            bounds.push([lat, lon]);

            const mk = L.marker([lat, lon], { icon: iconoDe(a, torre) })
              .bindPopup(popupHtml(a, torre), { className: "mp-popup" })
              .addTo(map);
            markersRef.current.set(a.id, mk);
            mapa.set(a.id, a);
          });
        }

        try {
          map.invalidateSize();
          const ref = centroDinamico(data.antenas);
          const capa = bounds.length ? L.latLngBounds(bounds) : null;

          if (ref && capa) {
            // Centro en el HMI/RB, pero con un zoom que NO recorte el resto
            // de la finca: se toma el menor entre el zoom deseado y el que
            // hace caber todos los marcadores.
            const zoomQueEncaja = map.getBoundsZoom(
              capa.extend(ref.centro),
              false,
              L.point(30, 30),
            );
            map.setView(ref.centro, Math.min(ref.zoom, zoomQueEncaja));
            console.info(
              `[MapaPage] centrado en ${ref.origen} · zoom ${Math.min(ref.zoom, zoomQueEncaja)}`,
            );
          } else if (ref) {
            map.setView(ref.centro, ref.zoom);
          } else if (capa) {
            map.fitBounds(capa, { padding: [30, 30] });
          }
        } catch { /* vista inicial */ }

        setAntenas(mapa);

        // Carga del cronograma. Con el proveedor local se genera a partir de
        // estos mismos equipos; con Supabase, la semilla se ignora.
        mantRef.current.sembrar(
          [...mapa.values()].map((a) => ({
            id: a.id,
            nombre: a.nombre,
            tipo: a.tipo,
            ubicacion: a.ubicacion ?? null,
            lat: a.coordenadas.lat,
            lon: a.coordenadas.lon,
          })),
        );

        setUltimaAct(new Date(data.timestamp).toLocaleTimeString("es-EC", { timeZone: "America/Guayaquil" }));
        setCargando(false);
      })
      .catch((e) => {
        if (!activo) return;
        setErrorCarga(e instanceof Error ? e.message : String(e));
        setCargando(false);
      });

    return () => {
      activo = false;
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
      markersRef.current.clear();
      torreRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finca?.id]);

  /* Tiempo real por WebSocket */
  const onMessage = useCallback(
    (raw: unknown) => {
      const msg = raw as WsEstadoCompleto;
      if (!msg || msg.tipo !== "estado_completo" || !msg.dispositivos) return;

      setAntenas((prev) => {
        const next = new Map(prev);
        for (const [grupo, devices] of Object.entries(msg.dispositivos!)) {
          for (const [nombre, info] of Object.entries(devices)) {
            const id = `${grupo}.${nombre}`;
            const a = next.get(id);
            if (!a) continue;
            const act: Antena = {
              ...a,
              estado: {
                online: info.online ?? null,
                potencia: info.potencia ?? null,
                fecha: info.ultimaActualizacion ?? a.estado.fecha,
              },
              error: info.error ?? null,
            };
            next.set(id, act);
            refrescarMarcador(act);
          }
        }
        return next;
      });
      setUltimaAct(new Date().toLocaleTimeString("es-EC", { timeZone: "America/Guayaquil" }));
    },
    [refrescarMarcador],
  );

  const { status } = useWebSocket(finca?.wsUrl ?? null, onMessage, finca?.id);

  /* Los popups de Leaflet son HTML plano, así que los botones se atienden por
     delegación sobre el contenedor del mapa. */
  useEffect(() => {
    const cont = mapRef.current?.getContainer();
    if (!cont) return;

    const onClick = (ev: Event) => {
      const btn = (ev.target as HTMLElement).closest<HTMLElement>("[data-mant-action]");
      if (!btn) return;
      ev.preventDefault();
      const id = btn.dataset.mantId!;
      const estado = btn.dataset.mantAction as EstadoMant;
      const input = cont.querySelector<HTMLInputElement>(`[data-mant-obs="${CSS.escape(id)}"]`);
      const ot = ordenActivaRef.current;
      if (!ot) {
        avisar("Selecciona primero una orden activa en la barra de mantenimiento");
        return;
      }
      mantRef.current.marcar(id, ot.id, estado, input?.value ?? "");
      const nombre = antenas.get(id)?.nombre ?? id;
      avisar(`${nombre} → ${estado} (${ot.numero})`);
    };

    cont.addEventListener("click", onClick);
    return () => cont.removeEventListener("click", onClick);
  }, [antenas, avisar, cargando]);

  /* Progreso por grupo sobre lo REALMENTE ejecutado. */
  const progreso = useMemo(() => {
    if (!mant.datos || modo !== "mant") return [];
    const equipos = [...antenas.values()]
      .map((a) => mant.ver(a.id, a.nombre))
      .filter((e): e is EquipoMant => !!e)
      .filter((e) => diaSel === "all" || (diaSel === "sin" ? !e.fechaTrabajo : e.fechaTrabajo === diaSel));
    return mant.grupos
      .map((g) => {
        const its = equipos.filter((e) => e.grupo === g);
        return {
          grupo: g,
          hechos: its.filter((e) => e.estado === "Terminado").length,
          total: its.length,
        };
      })
      .filter((p) => p.total > 0);
  }, [mant, modo, antenas, diaSel]);

  const toggleModo = useCallback(() => {
    setModo((m) => {
      const nuevo = m === "red" ? "mant" : "red";
      if (nuevo === "mant") {
        setFiltro("all");
        avisar("Modo mantenimiento: color por grupo y avance real");
      } else {
        avisar("Modo red: color por estado de señal");
      }
      return nuevo;
    });
  }, [avisar]);

  const irACampamento = useCallback(() => {
    const eq = [...antenas.values()].find((a) => a.tipo !== "antena");
    const map = mapRef.current;
    if (!map) return;
    if (eq && eq.coordenadas.lat != null) {
      map.flyTo([eq.coordenadas.lat, eq.coordenadas.lon!], 18);
      setFiltro("equipo");
      setPanelAbierto(true);
    }
  }, [antenas]);

  const irA = useCallback((a: Antena) => {
    const map = mapRef.current;
    const mk = markersRef.current.get(a.id);
    if (!map || !mk) return;
    map.flyTo(mk.getLatLng(), 18);
    mk.openPopup();
  }, []);

  const listaPanel = useMemo(
    () => [...antenas.values()].filter(coincide).sort((x, y) => x.nombre.localeCompare(y.nombre)),
    [antenas, coincide],
  );

  const setF = (f: Filtro) => setFiltro((prev) => (prev === f ? "all" : f));

  if (!finca) return <Navigate to="/dashboard" replace />;

  return (
    <div className="mapa-page">
      <div className="mapa-header">
        <div>
          <h1 className="page-title">{finca.name} — Mapa</h1>
          <p className="page-subtitle">Estado y potencia en vivo · Actualizado {ultimaAct}</p>
        </div>
        <div className="mapa-toolbar">
          <button className={`fb ${filtro === "all" && !busqueda ? "on" : ""}`} onClick={() => { setFiltro("all"); setBusqueda(""); }}>Todas ({stats.total})</button>
          <button className={`badge-cnt ${filtro === "ok" ? "activo" : ""}`} onClick={() => setF("ok")}>
            <span className="dot" style={{ background: COLORES.ok }} /> {stats.ok} OK
          </button>
          <button className={`badge-cnt ${filtro === "weak" ? "activo" : ""}`} onClick={() => setF("weak")}>
            <span className="dot" style={{ background: COLORES.weak }} /> {stats.weak} Débil
          </button>
          <button className={`badge-cnt ${filtro === "nolink" ? "activo" : ""}`} onClick={() => setF("nolink")}>
            <span className="dot" style={{ background: COLORES.nolink }} /> {stats.nolink} Sin enlace
          </button>
          <button className={`badge-cnt ${filtro === "down" ? "activo" : ""}`} onClick={() => setF("down")}>
            <span className="dot" style={{ background: COLORES.down }} /> {stats.down} Caídas
          </button>
          {stats.equipos > 0 && (
            <button className={`badge-cnt ${filtro === "equipo" ? "activo" : ""}`} onClick={() => setF("equipo")}>
              🖥️ {stats.eqOk}/{stats.equipos} Equipos
            </button>
          )}
          {stats.equipos > 0 && (
            <button className="btn-campamento" onClick={irACampamento}>🏠Campamento</button>
          )}
          {mant.disponible && (
            <button className={`btn-mant ${modo === "mant" ? "on" : ""}`} onClick={toggleModo}>
              {modo === "mant" ? "Ver red" : "Mantenimiento"}
            </button>
          )}
          <div className="mapa-filtros">
            <button className="fb" style={{ marginLeft: "auto" }} onClick={() => setPanelAbierto((p) => !p)}>
              🔎 {panelAbierto ? "Ocultar buscador" : "Buscador"}
            </button>
          </div>
          <span className={`ws-status ws-${status}`}>
            <span className="ws-dot" />
            {STATUS_LABELS[status]}
          </span>

        </div>
      </div>



      {modo === "mant" && mant.datos && (
        <div className="mant-bar">
          <span className="mant-titulo">Mantenimiento</span>

          {/* Dia TRABAJADO, no planificado */}
          <select className="mb-sel" value={diaSel} onChange={(e) => setDiaSel(e.target.value)}>
            <option value="all">Todos los dias</option>
            <option value="sin">Sin intervenir</option>
            {mant.diasTrabajados.map((f) => (
              <option key={f} value={f}>
                Trabajado {f}
              </option>
            ))}
          </select>

          {/* Grupos dinamicos: los que existan en ordenes o plan */}
          <button
            className={`gb ${grupoSel === "all" ? "on" : ""}`}
            onClick={() => setGrupoSel("all")}
          >
            Todos
          </button>
          {mant.grupos.map((g) => (
            <button
              key={g}
              className={`gb ${grupoSel === g ? "on" : ""}`}
              style={grupoSel === g ? { borderColor: colorGrupo(g), color: colorGrupo(g) } : undefined}
              onClick={() => setGrupoSel(g)}
            >
              {g}
            </button>
          ))}

          {/* Orden activa: la que emitio la app movil. Marcar requiere una. */}
          <select
            className="mb-sel mb-ot"
            value={ordenActivaId}
            onChange={(e) => setOrdenActivaId(e.target.value)}
          >
            <option value="">Solo consulta (sin orden)</option>
            {mant.ordenes
              .filter((o) => o.estado !== "Cerrada")
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.numero} · {o.grupo} · {o.fecha}
                </option>
              ))}
          </select>

          <span className="mant-leg"><span className="dot" style={{ background: COLOR_ESTADO_MANT["En Proceso"] }} /> En proceso</span>
          <span className="mant-leg"><span className="dot" style={{ background: COLOR_ESTADO_MANT.Terminado }} /> Terminado</span>

          <button className="gb" onClick={mant.reiniciar} title="Borra los datos de prueba de este navegador">
            Reiniciar prueba
          </button>

          {mant.pendientesEnCola > 0 && (
            <span className="cola-badge" title="Avances pendientes de enviar">
              {mant.pendientesEnCola} sin enviar
            </span>
          )}

          <span className="mant-prog">
            {progreso.map((p) => `${p.grupo}: ${p.hechos}/${p.total}`).join("  ·  ")}
          </span>
        </div>
      )}

      {toast && <div className="mapa-toast">{toast}</div>}

      {errorCarga && <div className="mapa-error">No se pudo cargar el mapa: {errorCarga}</div>}
      {cargando && !errorCarga && <div className="mapa-cargando">Cargando dispositivos…</div>}

      <div className="mapa-body">
        <div ref={mapDivRef} className="mapa-leaflet" />

        {!panelAbierto && (
          <button className="panel-toggle" onClick={() => setPanelAbierto(true)}>◀</button>
        )}

        <div className={`mapa-panel ${panelAbierto ? "" : "cerrado"}`}>
          <input
            className="sp-search"
            placeholder="Buscar por nombre, IP, grupo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          <div className="sp-lista">
            {listaPanel.length === 0 && <div className="sp-vacio">Sin coincidencias</div>}
            {listaPanel.slice(0, 300).map((a) => {
              const eq = modo === "mant" ? mant.ver(a.id, a.nombre) : null;
              if (eq) {
                const c = COLOR_ESTADO_MANT[eq.estado];
                return (
                  <div key={a.id} className="sp-item" onClick={() => irA(a)}>
                    <div>
                      <div className="nm">{a.nombre}</div>
                      <div className="ip">
                        {eq.grupo}
                        {eq.fechaTrabajo ? ` · trabajado ${eq.fechaTrabajo}` : " · sin intervenir"}
                      </div>
                    </div>
                    <span className="pill" style={{ background: `${c}22`, color: c }}>
                      {eq.estado}
                    </span>
                  </div>
                );
              }
              const [ptxt, pcls] = pill(a);
              return (
                <div key={a.id} className="sp-item" onClick={() => irA(a)}>
                  <div>
                    <div className="nm">
                      {a.tipo !== "antena" ? (EMOJI_EQUIPO[a.tipo] ?? "📟") : "📡"} {a.nombre}
                    </div>
                    <div className="ip">{a.ip}</div>
                  </div>
                  <span className={`pill ${pcls}`}>{ptxt}</span>
                </div>
              );
            })}
          </div>
          <button className="fb" style={{ margin: 8 }} onClick={() => setPanelAbierto(false)}>Cerrar ▶</button>
        </div>
      </div>
    </div>
  );
}