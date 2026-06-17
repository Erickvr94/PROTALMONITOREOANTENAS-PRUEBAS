import { useState, useEffect, useCallback } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getFinca } from "../config/fincas";
import {
  fetchUltimaHora,
  fetchPorFecha,
  type HistorialRecord,
} from "../services/historial";
import NetworkTopology from "../components/topology/NetworkTopology";
import "./HistoricoPage.css";

type Modo = "ultima-hora" | "fecha";

function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function HistoricoPage() {
  const { fincaId } = useParams<{ fincaId: string }>();
  const finca = getFinca(fincaId ?? "");

  const [modo, setModo] = useState<Modo>("ultima-hora");
  const [fecha, setFecha] = useState(toLocalDate(new Date()));
  const [records, setRecords] = useState<HistorialRecord[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data =
        modo === "ultima-hora"
          ? await fetchUltimaHora(fincaId!)
          : await fetchPorFecha(fincaId!, fecha);
      setRecords(data);
      setSelectedIdx(data.length > 0 ? data.length - 1 : 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [fincaId, modo, fecha]);

  useEffect(() => {
    if (finca) load();
  }, [load, finca]);

  if (!finca) return <Navigate to="/dashboard" replace />;

  if (!finca.hasHistorico) {
    return (
      <div className="historico-page">
        <h1 className="page-title">{finca.name} — Historico</h1>
        <p className="page-subtitle">Datos historicos de la red de antenas</p>
        <div className="historico-empty">
          Los datos historicos de {finca.name} aun no estan disponibles.
        </div>
      </div>
    );
  }

  const selected = records[selectedIdx] ?? null;

  const networkState = selected
    ? {
        gateways: selected.gateways,
        dispositivos: selected.dispositivos,
        timestamp: selected.timestamp,
      }
    : null;

  // Count summaries for timeline items
  function countOnline(rec: HistorialRecord) {
    const gwEntries = Object.values(rec.gateways);
    const gwOn = gwEntries.filter((g) => g.online).length;
    const allDevs = Object.values(rec.dispositivos).flatMap((s) =>
      Object.values(s),
    );
    const devOn = allDevs.filter((d) => d.online).length;
    return { gwOn, gwTotal: gwEntries.length, devOn, devTotal: allDevs.length };
  }

  return (
    <div className="historico-page">
      <div className="historico-header">
        <div>
          <h1 className="page-title">{finca.name} — Historico</h1>
          <p className="page-subtitle">Registros historicos de la red</p>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="historico-toolbar">
        <div className="toolbar-modes">
          <button
            className={`toolbar-btn ${modo === "ultima-hora" ? "toolbar-btn-active" : ""}`}
            onClick={() => setModo("ultima-hora")}
          >
            Ultima hora
          </button>
          <button
            className={`toolbar-btn ${modo === "fecha" ? "toolbar-btn-active" : ""}`}
            onClick={() => setModo("fecha")}
          >
            Por fecha
          </button>
        </div>

        {modo === "fecha" && (
          <div className="toolbar-date">
            <input
              type="date"
              className="date-input"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </div>
        )}

        <span className="toolbar-count">
          {loading
            ? "Cargando..."
            : `${records.length} registro${records.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {error && <div className="historico-error">{error}</div>}

      {!loading && records.length === 0 && !error && (
        <div className="historico-empty">
          No hay registros{" "}
          {modo === "ultima-hora" ? "en la ultima hora" : `para el ${fecha}`}.
        </div>
      )}

      {records.length > 0 && (
        <div className="historico-body">
          {/* ── Timeline sidebar ── */}
          <div className="historico-timeline">
            {records.map((rec, i) => {
              const t = new Date(rec.timestamp);
              const { gwOn, gwTotal, devOn, devTotal } = countOnline(rec);
              const allOk = gwOn === gwTotal && devOn === devTotal;
              return (
                <button
                  key={rec._id}
                  className={`timeline-item ${i === selectedIdx ? "timeline-item-active" : ""}`}
                  onClick={() => setSelectedIdx(i)}
                >
                  <span className="timeline-time">
                    {t.toLocaleTimeString()}
                  </span>
                  <span className="timeline-summary">
                    <span
                      className={`timeline-dot ${allOk ? "dot-ok" : "dot-warn"}`}
                    />
                    GW {gwOn}/{gwTotal} &middot; DISP {devOn}/{devTotal}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ── Topology view ── */}
          <div className="historico-view">
            {selected && (
              <div className="historico-view-header">
                <span className="view-timestamp">
                  {new Date(selected.timestamp).toLocaleString()}
                </span>
              </div>
            )}
            {networkState && <NetworkTopology state={networkState} />}
          </div>
        </div>
      )}
    </div>
  );
}
