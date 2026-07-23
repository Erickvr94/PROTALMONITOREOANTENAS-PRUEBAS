/* ─────────────────────────────────────────────────────────────────────────
   Página de verificación del Paso 1. No toca el mapa.

   Sirve para confirmar, antes de pintar nada, que:
     · los tableros se agrupan bien por ubicación (PLC + antena juntos),
     · la letra del grupo sale del join grupo_miembros → grupos_trabajo,
     · los valores reales de los enums (estado, área, mantenimiento).

   Montar en App.tsx dentro de las rutas del dashboard:
     <Route path="prueba-mant" element={<PruebaMantenimientoPage />} />
   ───────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "./conexionbasedatos";
import {
  cargarMantenimientoFinca,
  COLOR_ESTADO,
  fechaCorta,
  type DatosMantenimiento,
  type UbicacionMant,
} from "./services/mantenimientodatabase";

interface FincaOpt {
  id: string;
  nombre: string;
  empresa: string;
}

const celda: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: "1px solid #2a2f3a",
  verticalAlign: "top",
  fontSize: 13,
};

export default function PruebaMantenimientoPage() {
  const [fincas, setFincas] = useState<FincaOpt[]>([]);
  const [fincaId, setFincaId] = useState("");
  const [ordenId, setOrdenId] = useState("");
  const [datos, setDatos] = useState<DatosMantenimiento | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [soloConAvances, setSoloConAvances] = useState(true);

  /* Fincas disponibles */
  useEffect(() => {
    supabase
      .from("fincas")
      .select("id, nombre, empresas(nombre)")
      .order("nombre")
      .then(({ data, error }) => {
        if (error) return setError(error.message);
        const opts = (data ?? []).map((f: any) => ({
          id: f.id,
          nombre: f.nombre,
          empresa: f.empresas?.nombre ?? "",
        }));
        setFincas(opts);
        if (opts.length) setFincaId(opts[0].id);
      });
  }, []);

  /* Carga consolidada */
  useEffect(() => {
    if (!fincaId) return;
    setCargando(true);
    setError(null);
    cargarMantenimientoFinca(fincaId, ordenId ? { ordenId } : {})
      .then(setDatos)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setCargando(false));
  }, [fincaId, ordenId]);

  const filas: UbicacionMant[] = useMemo(() => {
    if (!datos) return [];
    const todas = [...datos.ubicaciones.values()];
    const vis = soloConAvances ? todas.filter((u) => u.avances.length > 0) : todas;
    return vis.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
  }, [datos, soloConAvances]);

  const resumen = useMemo(() => {
    const r = { Pendiente: 0, "En Proceso": 0, Terminado: 0 };
    for (const u of datos?.ubicaciones.values() ?? []) r[u.estado]++;
    return r;
  }, [datos]);

  return (
    <div style={{ padding: 20, color: "#e6e9ef", background: "#0f1218", minHeight: "100%" }}>
      <h2 style={{ margin: "0 0 4px" }}>Verificación del modo mantenimiento</h2>
      <p style={{ margin: "0 0 16px", color: "#9aa4b2", fontSize: 13 }}>
        Consolidación por ubicación, leída directo de Supabase.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={fincaId}
          onChange={(e) => {
            setFincaId(e.target.value);
            setOrdenId("");
          }}
          style={{ padding: 6, background: "#1a1f29", color: "#e6e9ef", border: "1px solid #2a2f3a" }}
        >
          {fincas.map((f) => (
            <option key={f.id} value={f.id}>
              {f.empresa} · {f.nombre}
            </option>
          ))}
        </select>

        <select
          value={ordenId}
          onChange={(e) => setOrdenId(e.target.value)}
          style={{ padding: 6, background: "#1a1f29", color: "#e6e9ef", border: "1px solid #2a2f3a" }}
        >
          <option value="">Todas las órdenes</option>
          {(datos?.ordenes ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              #{o.numero} · {o.titulo}
            </option>
          ))}
        </select>

        <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={soloConAvances}
            onChange={(e) => setSoloConAvances(e.target.checked)}
          />
          Solo ubicaciones con avances
        </label>

        {cargando && <span style={{ color: "#9aa4b2" }}>Cargando…</span>}
      </div>

      {error && (
        <p style={{ color: "#f31260", marginTop: 12 }}>
          {error} — revisa las políticas RLS de la tabla involucrada.
        </p>
      )}

      {datos && (
        <div
          style={{
            margin: "16px 0",
            padding: 12,
            background: "#141922",
            border: "1px solid #2a2f3a",
            borderRadius: 6,
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <b>Diagnóstico</b>
          <br />
          Tableros: {datos.diagnostico.tableros} · Ubicaciones: {datos.ubicaciones.size} · Avances:{" "}
          {datos.diagnostico.avances} · Avances sin grupo resuelto:{" "}
          <span style={{ color: datos.diagnostico.avancesSinGrupo ? "#f5a524" : "#17c964" }}>
            {datos.diagnostico.avancesSinGrupo}
          </span>
          <br />
          Estados en BD: {datos.diagnostico.estadosCrudos.join(", ") || "—"}
          <br />
          Áreas en BD: {datos.diagnostico.areasCrudas.join(", ") || "—"}
          <br />
          Mantenimiento en BD: {datos.diagnostico.mantenimientosCrudos.join(", ") || "—"}
          <br />
          Marcadores por color: {resumen.Terminado} terminado · {resumen["En Proceso"]} en proceso ·{" "}
          {resumen.Pendiente} pendiente
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#9aa4b2", fontSize: 12 }}>
            <th style={celda}>Ubicación</th>
            <th style={celda}>Equipos en BD</th>
            <th style={celda}>Estado</th>
            <th style={celda}>Grupo</th>
            <th style={celda}>Detalle de avances</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((u) => (
            <tr key={u.clave}>
              <td style={celda}>
                <b>{u.nombre}</b>
                <div style={{ color: "#6b7280", fontSize: 11 }}>{u.clave}</div>
              </td>
              <td style={celda}>
                {u.tableros.map((t) => (
                  <div key={t.id} style={{ fontSize: 12 }}>
                    <span style={{ color: "#9aa4b2" }}>{t.tipo ?? "?"}</span> · {t.nombre}
                  </div>
                ))}
              </td>
              <td style={celda}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: COLOR_ESTADO[u.estado],
                    color: "#0f1218",
                    fontWeight: 600,
                    fontSize: 11,
                  }}
                >
                  {u.estado}
                </span>
              </td>
              <td style={celda}>{u.grupos.join(", ") || "—"}</td>
              <td style={celda}>
                {u.avances.length === 0 && <span style={{ color: "#6b7280" }}>sin avances</span>}
                {u.avances.map((a) => (
                  <div key={a.id} style={{ marginBottom: 4, fontSize: 12 }}>
                    <b>{a.area}</b> · {a.estado} · {a.mantenimiento} · grupo {a.grupo} ·{" "}
                    {fechaCorta(a.fecha)} · OT #{a.ordenNumero}
                    <div style={{ color: "#9aa4b2" }}>
                      {a.tecnico} — {a.observaciones || "sin observaciones"}
                    </div>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}