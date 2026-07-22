import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { EMPRESAS } from "../config/empresas";
import {
  largoRuta,
  leerCronograma,
  type ParadaPlan,
  type PlanCargado,
} from "../services/planCronograma";
import { CAPAS_BASE, CAPA_POR_DEFECTO, montarCapaBase } from "../services/basemaps";
import "./PlanPage.css";

/* Misma derivacion de color que el modo mantenimiento, para que un grupo se
   vea igual en el plan y en la ejecucion. */
const PALETA = ["#2563eb", "#ea580c", "#0891b2", "#7c3aed", "#db2777", "#65a30d", "#0d9488"];
const cacheColor = new Map<string, string>();

function colorGrupo(g: string): string {
  const ya = cacheColor.get(g);
  if (ya) return ya;
  let h = 0;
  for (let i = 0; i < g.length; i++) h = (h * 31 + g.charCodeAt(i)) >>> 0;
  const c = PALETA[h % PALETA.length];
  cacheColor.set(g, c);
  return c;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export default function PlanPage() {
  const { empresaId, fincaId } = useParams();
  const empresa = EMPRESAS.find((e) => e.id === empresaId);
  const finca = empresa?.fincas.find((f) => f.id === fincaId);

  const [plan, setPlan] = useState<PlanCargado | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diaSel, setDiaSel] = useState<string>("all");
  const [gruposOn, setGruposOn] = useState<Set<string>>(new Set());
  const [numerar, setNumerar] = useState(true);
  const [verLineas, setVerLineas] = useState(false);
  const [capaBase, setCapaBase] = useState<string>(CAPA_POR_DEFECTO);
  const [arrastrando, setArrastrando] = useState(false);

  const mapRef = useRef<L.Map | null>(null);
  const capaRef = useRef<L.LayerGroup | null>(null);
  const baseRef = useRef<L.TileLayer[]>([]);
  const [mapaListo, setMapaListo] = useState(false);

  /* El contenedor del mapa solo se monta despues de cargar el archivo, asi
     que se inicializa por callback ref: un useEffect con deps [] correria
     cuando el div todavia no existe y el mapa nunca llegaria a crearse. */
  const montarMapa = useCallback((node: HTMLDivElement | null) => {
    if (!node || mapRef.current) return;
    const map = L.map(node, { zoomControl: true }).setView([-2.5, -79.6], 13);
    baseRef.current = montarCapaBase(map, CAPA_POR_DEFECTO);
    mapRef.current = map;
    // El div acaba de aparecer: Leaflet necesita releer su tamano real.
    setTimeout(() => map.invalidateSize(), 0);
    setMapaListo(true);
  }, []);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  /* ── Carga del archivo ── */
  const cargar = useCallback(async (archivo: File) => {
    setLeyendo(true);
    setError(null);
    try {
      const p = await leerCronograma(archivo);
      if (!p.paradas.length) {
        setError(
          "No se encontro ninguna fila con nombre de equipo y coordenadas. " +
            "Revisa que el archivo tenga columnas de latitud y longitud.",
        );
        setPlan(null);
        return;
      }
      setPlan(p);
      setGruposOn(new Set(p.grupos));
      setDiaSel("all");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPlan(null);
    } finally {
      setLeyendo(false);
    }
  }, []);

  const onArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) cargar(f);
    e.target.value = "";
  };

  const onSoltar = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastrando(false);
    const f = e.dataTransfer.files?.[0];
    if (f) cargar(f);
  };

  /* Cambio de capa base: se retira la anterior y se monta la nueva. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaListo) return;
    for (const c of baseRef.current) map.removeLayer(c);
    baseRef.current = montarCapaBase(map, capaBase);
  }, [capaBase, mapaListo]);

  /* ── Paradas visibles segun filtros ── */
  const visibles = useMemo(() => {
    if (!plan) return [];
    return plan.paradas.filter(
      (p) => gruposOn.has(p.grupo) && (diaSel === "all" || p.dia === Number(diaSel)),
    );
  }, [plan, gruposOn, diaSel]);

  /* Rutas: una polilinea por grupo y por dia, en el orden del cronograma. */
  const rutas = useMemo(() => {
    const m = new Map<string, ParadaPlan[]>();
    for (const p of visibles) {
      const k = `${p.grupo}|${p.dia}`;
      const arr = m.get(k);
      if (arr) arr.push(p);
      else m.set(k, [p]);
    }
    return [...m.entries()]
      .map(([k, ps]) => {
        const [grupo, dia] = k.split("|");
        const ordenadas = [...ps].sort((a, b) => a.orden - b.orden);
        return { grupo, dia: Number(dia), paradas: ordenadas, km: largoRuta(ordenadas) };
      })
      .sort((a, b) => a.dia - b.dia || a.grupo.localeCompare(b.grupo));
  }, [visibles]);

  /* ── Dibujo ── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (capaRef.current) {
      map.removeLayer(capaRef.current);
      capaRef.current = null;
    }
    if (!visibles.length) return;

    const capa = L.layerGroup();

    for (const r of rutas) {
      const color = colorGrupo(r.grupo);
      const pts = r.paradas.map((p) => [p.lat, p.lon] as [number, number]);

      if (verLineas && pts.length > 1) {
        L.polyline(pts, { color, weight: 3, opacity: 0.75, dashArray: "8 6" }).addTo(capa);
      }

      r.paradas.forEach((p, i) => {
        const etiqueta = numerar ? String(i + 1) : "";
        L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            html: `<div class="pl-mk" style="background:${color}">${etiqueta}</div>`,
            className: "",
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -18],
          }),
        })
          .bindPopup(
            `<div class="pl-pop">
               <div class="pl-pop-h" style="background:${color}">${esc(p.nombre)}</div>
               <div class="pl-pop-b">
                 <div><b>Grupo</b> ${esc(p.grupo)} &middot; parada ${i + 1} de ${r.paradas.length}</div>
                 <div><b>Dia</b> ${p.dia}${p.fecha ? ` &middot; ${esc(p.fecha)}` : ""}</div>
                 ${p.ubicacion ? `<div><b>Ubicacion</b> ${esc(p.ubicacion)}</div>` : ""}
                 ${p.ip ? `<div><b>IP</b> ${esc(p.ip)}</div>` : ""}
                 ${p.tipo ? `<div><b>Tipo</b> ${esc(p.tipo)}</div>` : ""}
                 ${p.mantenimiento ? `<div><b>Mantenimiento</b> ${esc(p.mantenimiento)}</div>` : ""}
                 <div class="pl-pop-hoja">${esc(p.hoja)}</div>
               </div>
             </div>`,
            { className: "pl-popup" },
          )
          .addTo(capa);
      });

      // Marca de arranque: solo aporta cuando la ruta esta dibujada.
      if (verLineas && pts.length) {
        L.circleMarker(pts[0], {
          radius: 9,
          color: "#fff",
          weight: 3,
          fillColor: color,
          fillOpacity: 1,
        })
          .bindTooltip(`Inicio ${r.grupo} · dia ${r.dia}`, { direction: "top" })
          .addTo(capa);
      }
    }

    capa.addTo(map);
    capaRef.current = capa;

    const bounds = L.latLngBounds(visibles.map((p) => [p.lat, p.lon] as [number, number]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40] });
  }, [visibles, rutas, numerar, verLineas, mapaListo]);

  const alternarGrupo = (g: string) => {
    setGruposOn((prev) => {
      const s = new Set(prev);
      if (s.has(g)) s.delete(g);
      else s.add(g);
      return s;
    });
  };

  const kmTotal = rutas.reduce((t, r) => t + r.km, 0);

  return (
    <div className="plan-page">
      <div className="plan-head">
        <div>
          <h1>Plan de mantenimiento</h1>
          <p className="plan-sub">
            {finca?.name ?? fincaId} · {empresa?.name ?? empresaId} — vista previa al ingreso,
            sin conexion a la base de datos
          </p>
        </div>
        {plan && (
          <label className="plan-btn">
            Cambiar archivo
            <input type="file" accept=".xlsx,.xlsm,.csv" onChange={onArchivo} hidden />
          </label>
        )}
      </div>

      {!plan && (
        <div
          className={`plan-drop ${arrastrando ? "on" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={onSoltar}
        >
          <div className="plan-drop-ic">+</div>
          <p className="plan-drop-t">
            {leyendo ? "Leyendo archivo..." : "Arrastra tu cronograma aqui"}
          </p>
          <p className="plan-drop-s">
            Excel o CSV. Se leen todas las hojas. Se necesitan columnas de equipo, latitud y
            longitud; grupo, dia y orden son opcionales pero definen la ruta.
          </p>
          <label className="plan-btn">
            Elegir archivo
            <input type="file" accept=".xlsx,.xlsm,.csv" onChange={onArchivo} hidden />
          </label>
        </div>
      )}

      {error && <div className="plan-error">{error}</div>}

      {plan && (
        <>
          <div className="plan-bar">
            <span className="plan-file">{plan.archivo}</span>

            <select className="plan-sel" value={diaSel} onChange={(e) => setDiaSel(e.target.value)}>
              <option value="all">Todos los dias ({plan.dias.length})</option>
              {plan.dias.map((d) => (
                <option key={d.dia} value={d.dia}>
                  Dia {d.dia}
                  {d.fecha ? ` · ${d.fecha}` : ""} ({d.paradas})
                </option>
              ))}
            </select>

            {plan.grupos.map((g) => (
              <button
                key={g}
                className={`plan-gb ${gruposOn.has(g) ? "on" : ""}`}
                style={
                  gruposOn.has(g)
                    ? { background: colorGrupo(g), borderColor: colorGrupo(g), color: "#fff" }
                    : undefined
                }
                onClick={() => alternarGrupo(g)}
              >
                {g}
              </button>
            ))}

            <label className="plan-check">
              <input
                type="checkbox"
                checked={numerar}
                onChange={(e) => setNumerar(e.target.checked)}
              />
              Numerar paradas
            </label>

            <label className="plan-check">
              <input
                type="checkbox"
                checked={verLineas}
                onChange={(e) => setVerLineas(e.target.checked)}
              />
              Lineas de ruta
            </label>

            <select
              className="plan-sel"
              value={capaBase}
              onChange={(e) => setCapaBase(e.target.value)}
              title="Capa base del mapa"
            >
              {CAPAS_BASE.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.etiqueta}
                </option>
              ))}
            </select>

            <span className="plan-stats">
              {visibles.length} equipos · {rutas.length} rutas · {kmTotal.toFixed(1)} km
            </span>
          </div>

          {!!plan.avisos.length && (
            <details className="plan-avisos">
              <summary>{plan.avisos.length} aviso(s) al leer el archivo</summary>
              <ul>
                {plan.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="plan-cuerpo">
            <div ref={montarMapa} className="plan-mapa" />

            <aside className="plan-lista">
              <div className="plan-lista-h">Jornadas</div>
              {rutas.map((r) => (
                <div key={`${r.grupo}-${r.dia}`} className="plan-ruta">
                  <div className="plan-ruta-h">
                    <span className="plan-dot" style={{ background: colorGrupo(r.grupo) }} />
                    <b>
                      Dia {r.dia} · {r.grupo}
                    </b>
                    <span className="plan-ruta-km">
                      {r.paradas.length} eq · {r.km.toFixed(1)} km
                    </span>
                  </div>
                  <div className="plan-ruta-p">
                    {r.paradas[0]?.fecha ?? "sin fecha"} — desde {r.paradas[0]?.nombre} hasta{" "}
                    {r.paradas[r.paradas.length - 1]?.nombre}
                  </div>
                </div>
              ))}
              {!rutas.length && <div className="plan-ruta-p">Ningun grupo seleccionado.</div>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}