import { useState, useEffect, useCallback } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getFinca } from "../config/fincas";
import { fetchCaidas } from "../services/caidas";
import type { CaidasResponse, DispositivoCaida } from "../types/caidas";
import "./TendenciasPage.css";

function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface RowItem {
  sector: string;
  nombre: string;
  ip: string;
  ubicacion: string;
  caidasCount: number;
  totalMuestras: number;
  porcentajeCaida: number;
}

function buildRows(data: CaidasResponse): RowItem[] {
  const rows: RowItem[] = [];
  for (const [sector, dispositivos] of Object.entries(data.dispositivos)) {
    for (const [nombre, d] of Object.entries(dispositivos)) {
      rows.push({
        sector,
        nombre,
        ip: d.ip,
        ubicacion: d.ubicacion,
        caidasCount: d.caidasCount,
        totalMuestras: d.totalMuestras,
        porcentajeCaida: d.porcentajeCaida,
      });
    }
  }
  return rows;
}

function statusClass(pct: number): string {
  if (pct === 0) return "status-ok";
  if (pct < 20) return "status-warn";
  if (pct < 80) return "status-danger";
  return "status-critical";
}

function statusLabel(pct: number): string {
  if (pct === 0) return "Estable";
  if (pct < 20) return "Intermitente";
  if (pct < 80) return "Inestable";
  return "Caido";
}

/* ── Pie chart via SVG ── */
function PieChart({
  porcentajeCaida,
  label,
}: {
  porcentajeCaida: number;
  label: string;
}) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 85;

  const caida = Math.max(0, Math.min(100, porcentajeCaida));
  const activo = 100 - caida;

  // Full circle edge cases
  if (caida === 0 || caida === 100) {
    return (
      <div className="pie-container">
        <svg viewBox={`0 0 ${size} ${size}`} className="pie-svg">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill={caida === 100 ? "#e05050" : "#3cc77a"}
          />
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            dominantBaseline="central"
            className="pie-pct-text"
          >
            {caida === 100 ? "100%" : "0%"}
          </text>
          <text
            x={cx}
            y={cy + 16}
            textAnchor="middle"
            dominantBaseline="central"
            className="pie-sub-text"
          >
            {caida === 100 ? "caida" : "activo"}
          </text>
        </svg>
        <div className="pie-label">{label}</div>
        <div className="pie-legend">
          <span className="legend-item">
            <span className="legend-dot" style={{ background: "#3cc77a" }} />
            Activo {activo.toFixed(1)}%
          </span>
          <span className="legend-item">
            <span className="legend-dot" style={{ background: "#e05050" }} />
            Caida {caida.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  }

  // Two-slice pie
  const startAngle = -Math.PI / 2;
  const caidaAngle = (caida / 100) * 2 * Math.PI;
  const midAngle = startAngle + caidaAngle;

  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(midAngle);
  const y2 = cy + r * Math.sin(midAngle);

  const largeCaida = caida > 50 ? 1 : 0;
  const largeActivo = activo > 50 ? 1 : 0;

  const pathCaida = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeCaida} 1 ${x2} ${y2} Z`;
  const pathActivo = `M ${cx} ${cy} L ${x2} ${y2} A ${r} ${r} 0 ${largeActivo} 1 ${x1} ${y1} Z`;

  return (
    <div className="pie-container">
      <svg viewBox={`0 0 ${size} ${size}`} className="pie-svg">
        <path d={pathActivo} fill="#3cc77a" />
        <path d={pathCaida} fill="#e05050" />
        <circle cx={cx} cy={cy} r={38} fill="#14182680" />
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          dominantBaseline="central"
          className="pie-pct-text"
        >
          {caida.toFixed(1)}%
        </text>
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          dominantBaseline="central"
          className="pie-sub-text"
        >
          caida
        </text>
      </svg>
      <div className="pie-label">{label}</div>
      <div className="pie-legend">
        <span className="legend-item">
          <span className="legend-dot" style={{ background: "#3cc77a" }} />
          Activo {activo.toFixed(1)}%
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: "#e05050" }} />
          Caida {caida.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

/* ── Tab types for future analyses ── */
type AnalisisTab = "caidas";

export default function TendenciasPage() {
  const { fincaId } = useParams<{ fincaId: string }>();
  const finca = getFinca(fincaId ?? "");

  const [tab] = useState<AnalisisTab>("caidas");
  const [fecha, setFecha] = useState(toLocalDate(new Date()));
  const [data, setData] = useState<CaidasResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<RowItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedRow(null);
    try {
      const res = await fetchCaidas(fecha);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fecha]);

  useEffect(() => {
    if (finca?.hasTendencias) load();
  }, [load, finca]);

  if (!finca) return <Navigate to="/dashboard" replace />;

  if (!finca.hasTendencias) {
    return (
      <div className="tendencias-page">
        <h1 className="page-title">{finca.name} — Tendencias</h1>
        <p className="page-subtitle">Analisis de tendencias de la red</p>
        <div className="tendencias-empty">
          Las tendencias de {finca.name} aun no estan disponibles.
        </div>
      </div>
    );
  }

  const rows = data ? buildRows(data) : [];

  // Group rows by sector for the table
  const sectors = data ? Object.keys(data.dispositivos) : [];

  return (
    <div className="tendencias-page">
      <div className="tendencias-header">
        <div>
          <h1 className="page-title">{finca.name} — Tendencias</h1>
          <p className="page-subtitle">Analisis de tendencias de la red</p>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="tendencias-toolbar">
        <div className="toolbar-modes">
          <button
            className={`toolbar-btn ${tab === "caidas" ? "toolbar-btn-active" : ""}`}
          >
            Analisis de caidas
          </button>
        </div>

        <div className="toolbar-date">
          <input
            type="date"
            className="date-input"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </div>

        {data && (
          <span className="toolbar-count">
            {data.totalRegistros} muestras
          </span>
        )}
      </div>

      {loading && (
        <div className="tendencias-empty">Cargando...</div>
      )}
      {error && <div className="tendencias-error">{error}</div>}

      {!loading && data && rows.length === 0 && (
        <div className="tendencias-empty">
          No hay datos de caidas para el {fecha}.
        </div>
      )}

      {!loading && data && rows.length > 0 && (
        <div className="tendencias-body">
          {/* ── Table ── */}
          <div className="tendencias-table-wrap">
            {/* Gateway summary */}
            <div className="section-label">Gateways</div>
            <table className="tendencias-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>IP</th>
                  <th>Sectores</th>
                  <th>Caidas</th>
                  <th>Muestras</th>
                  <th>% Caida</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.gateways).map(([id, gw]) => {
                  const isSelected =
                    selectedRow !== null &&
                    selectedRow.nombre === `GW-${id}`;
                  return (
                    <tr
                      key={`gw-${id}`}
                      className={`table-row-clickable ${isSelected ? "table-row-active" : ""}`}
                      onClick={() =>
                        setSelectedRow({
                          sector: gw.sectores.join(", "),
                          nombre: `GW-${id}`,
                          ip: gw.ip,
                          ubicacion: gw.sectores.join(", "),
                          caidasCount: gw.caidasCount,
                          totalMuestras: gw.totalMuestras,
                          porcentajeCaida: gw.porcentajeCaida,
                        })
                      }
                    >
                      <td className="col-mono">GW-{id}</td>
                      <td className="col-mono">{gw.ip}</td>
                      <td>{gw.sectores.join(", ")}</td>
                      <td className="col-num">{gw.caidasCount}</td>
                      <td className="col-num">{gw.totalMuestras}</td>
                      <td className="col-num">{gw.porcentajeCaida}%</td>
                      <td>
                        <span
                          className={`status-badge ${statusClass(gw.porcentajeCaida)}`}
                        >
                          {statusLabel(gw.porcentajeCaida)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Devices by sector */}
            {sectors.map((sector) => (
              <div key={sector}>
                <div className="section-label">{sector}</div>
                <table className="tendencias-table">
                  <thead>
                    <tr>
                      <th>Dispositivo</th>
                      <th>IP</th>
                      <th>Ubicacion</th>
                      <th>Caidas</th>
                      <th>Muestras</th>
                      <th>% Caida</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.dispositivos[sector]).map(
                      ([nombre, d]: [string, DispositivoCaida]) => {
                        const isSelected =
                          selectedRow !== null &&
                          selectedRow.nombre === nombre &&
                          selectedRow.sector === sector;
                        return (
                          <tr
                            key={nombre}
                            className={`table-row-clickable ${isSelected ? "table-row-active" : ""}`}
                            onClick={() =>
                              setSelectedRow({
                                sector,
                                nombre,
                                ip: d.ip,
                                ubicacion: d.ubicacion,
                                caidasCount: d.caidasCount,
                                totalMuestras: d.totalMuestras,
                                porcentajeCaida: d.porcentajeCaida,
                              })
                            }
                          >
                            <td className="col-mono">{nombre}</td>
                            <td className="col-mono">{d.ip}</td>
                            <td>{d.ubicacion}</td>
                            <td className="col-num">{d.caidasCount}</td>
                            <td className="col-num">{d.totalMuestras}</td>
                            <td className="col-num">{d.porcentajeCaida}%</td>
                            <td>
                              <span
                                className={`status-badge ${statusClass(d.porcentajeCaida)}`}
                              >
                                {statusLabel(d.porcentajeCaida)}
                              </span>
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* ── Pie chart panel ── */}
          <div className="tendencias-chart">
            {selectedRow ? (
              <PieChart
                porcentajeCaida={selectedRow.porcentajeCaida}
                label={`${selectedRow.nombre} (${selectedRow.sector})`}
              />
            ) : (
              <div className="chart-placeholder">
                <span className="chart-placeholder-icon">&#9673;</span>
                <span>Selecciona una fila para ver el grafico</span>
              </div>
            )}

            {selectedRow && (
              <div className="chart-details">
                <div className="detail-row">
                  <span className="detail-label">IP</span>
                  <span className="detail-value">{selectedRow.ip}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Ubicacion</span>
                  <span className="detail-value">{selectedRow.ubicacion}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Sector</span>
                  <span className="detail-value">{selectedRow.sector}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Caidas</span>
                  <span className="detail-value">
                    {selectedRow.caidasCount} / {selectedRow.totalMuestras}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
