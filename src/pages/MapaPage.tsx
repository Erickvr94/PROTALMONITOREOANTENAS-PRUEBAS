import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, Navigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getFinca } from "../config/empresas";
import { apiFetch } from "../services/api";
import { useWebSocket, type WsStatus } from "../hooks/useWebSocket";
import "./MapaPage.css";

/* ── Tipos del endpoint /api/ipsp/:finca/mapa ── */

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

function popupHtml(a: Antena, torre?: { idx: number; total: number }): string {
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
    </div>`;
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
      const c = clasificar(a);
      const pasaFiltro = filtro === "all" || c === filtro;
      if (!busqueda.trim()) return pasaFiltro;
      const q = busqueda.trim().toLowerCase();
      const texto = `${a.nombre} ${a.ip} ${a.grupo} ${a.ubicacion ?? ""} ${a.tipo}`.toLowerCase();
      return pasaFiltro && texto.includes(q);
    },
    [filtro, busqueda],
  );

  const refrescarMarcador = useCallback((a: Antena) => {
    const mk = markersRef.current.get(a.id);
    if (!mk) return;
    mk.setIcon(iconoDe(a, torreRef.current.get(a.id)));
    mk.setPopupContent(popupHtml(a, torreRef.current.get(a.id)));
  }, []);

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

    console.info("[MapaPage] v4 cargada");
    const map = L.map(mapDivRef.current, { zoomControl: true });
    map.setView([-2.633, -79.68], 13);
    mapRef.current = map;
    let activo = true;

    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Tiles © Esri" },
    ).addTo(map);

    apiFetch<MapaResponse>(`/api/ipsp/${finca.id}/mapa`)
      .then((data) => {
        if (!activo || mapRef.current !== map) return;

        const porTorre = new Map<string, Antena[]>();
        for (const a of data.antenas) {
          if (a.coordenadas.lat == null || a.coordenadas.lon == null) continue;
          const t = `${a.coordenadas.lat},${a.coordenadas.lon}`;
          if (!porTorre.has(t)) porTorre.set(t, []);
          porTorre.get(t)!.push(a);
        }

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
              .bindPopup(popupHtml(a, torre))
              .addTo(map);
            markersRef.current.set(a.id, mk);
            mapa.set(a.id, a);
          });
        }

        try {
          map.invalidateSize();
          if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
        } catch { /* vista inicial */ }

        setAntenas(mapa);
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
