import { useState, useEffect, useCallback } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getFinca } from "../config/fincas";
import { fetchCaidasRango } from "../services/caidas";
import type {
  CaidasDia,
  CaidasRangoResponse,
  DispositivoCaida,
} from "../types/caidas";
import "./TendenciasPage.css";

/* ── Helpers ── */

function toLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysAgo(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return toLocalDate(d);
}

function shortDate(fecha: string): string {
  const d = new Date(fecha + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
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

function buildRows(dia: CaidasDia): RowItem[] {
  const rows: RowItem[] = [];
  for (const [sector, dispositivos] of Object.entries(dia.dispositivos)) {
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

/** Looks up a selected row's porcentajeCaida in a given day's data */
function findDeviceInDay(dia: CaidasDia, row: RowItem): number | null {
  // Gateway row
  if (row.nombre.startsWith("GW-")) {
    const gwId = row.nombre.slice(3);
    const gw = dia.gateways[gwId];
    return gw ? gw.porcentajeCaida : null;
  }
  // Device row
  const sector = dia.dispositivos[row.sector];
  if (!sector) return null;
  const dev = sector[row.nombre];
  return dev ? dev.porcentajeCaida : null;
}

/* ── Bar chart ── */

interface BarDataPoint {
  fecha: string;
  porcentajeActivo: number;
}

function barColor(pctActivo: number): string {
  if (pctActivo === 100) return "#3cc77a";
  if (pctActivo > 80) return "#d4a030";
  if (pctActivo > 20) return "#e08232";
  return "#e05050";
}

function BarChart({ data, label }: { data: BarDataPoint[]; label: string }) {
  if (data.length === 0) return null;

  const barWidth = 26;
  const gap = 5;
  const chartHeight = 130;
  const topPad = 20;
  const bottomPad = 32;
  const totalHeight = chartHeight + topPad + bottomPad;
  const totalWidth = Math.max(data.length * (barWidth + gap) - gap + 20, 120);

  return (
    <div className="bar-container">
      <div className="bar-title">{label}</div>
      <div className="bar-scroll">
        <svg
          viewBox={`0 0 ${totalWidth} ${totalHeight}`}
          className="bar-svg"
          style={{ width: Math.max(totalWidth, 240), height: totalHeight }}
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((v) => {
            const y = topPad + chartHeight - (v / 100) * chartHeight;
            return (
              <g key={v}>
                <line
                  x1={0}
                  y1={y}
                  x2={totalWidth}
                  y2={y}
                  stroke="rgba(255,255,255,0.04)"
                  strokeWidth={1}
                />
                <text
                  x={totalWidth - 2}
                  y={y - 3}
                  textAnchor="end"
                  className="bar-grid-label"
                >
                  {v}%
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {data.map((pt, i) => {
            const x = 10 + i * (barWidth + gap);
            const h = (pt.porcentajeActivo / 100) * chartHeight;
            const y = topPad + chartHeight - h;
            return (
              <g key={pt.fecha}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={h}
                  rx={4}
                  fill={barColor(pt.porcentajeActivo)}
                  opacity={0.85}
                />
                {/* Value on top */}
                <text
                  x={x + barWidth / 2}
                  y={y - 4}
                  textAnchor="middle"
                  className="bar-value-label"
                >
                  {pt.porcentajeActivo.toFixed(0)}%
                </text>
                {/* Date below */}
                <text
                  x={x + barWidth / 2}
                  y={topPad + chartHeight + 16}
                  textAnchor="middle"
                  className="bar-date-label"
                >
                  {shortDate(pt.fecha)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="pie-legend" style={{ marginTop: "0.5rem" }}>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: "#3cc77a" }} />
          {"100%"}
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: "#d4a030" }} />
          {">80%"}
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: "#e08232" }} />
          {">20%"}
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: "#e05050" }} />
          {"≤20%"}
        </span>
      </div>
    </div>
  );
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

/* ── Main page ── */

type Modo = "fecha" | "rango";

export default function TendenciasPage() {
  const { fincaId } = useParams<{ fincaId: string }>();
  const finca = getFinca(fincaId ?? "");

  const [modo, setModo] = useState<Modo>("fecha");
  const [fecha, setFecha] = useState(toLocalDate(new Date()));
  const [fechaInicio, setFechaInicio] = useState(
    daysAgo(toLocalDate(new Date()), 6),
  );
  const [fechaFin, setFechaFin] = useState(toLocalDate(new Date()));

  const [rangeData, setRangeData] = useState<CaidasRangoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<RowItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedRow(null);
    try {
      let res: CaidasRangoResponse;
      if (modo === "fecha") {
        const inicio = daysAgo(fecha, 6);
        res = await fetchCaidasRango(inicio, fecha);
      } else {
        res = await fetchCaidasRango(fechaInicio, fechaFin);
      }
      setRangeData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
      setRangeData(null);
    } finally {
      setLoading(false);
    }
  }, [modo, fecha, fechaInicio, fechaFin]);

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

  // Derive table data from range response
  const tableDia: CaidasDia | null = (() => {
    if (!rangeData || rangeData.dias.length === 0) return null;
    if (modo === "fecha") {
      return (
        rangeData.dias.find((d) => d.fecha === fecha) ??
        rangeData.dias[rangeData.dias.length - 1]
      );
    }
    return rangeData.dias[rangeData.dias.length - 1];
  })();

  const rows = tableDia ? buildRows(tableDia) : [];
  const sectors = tableDia ? Object.keys(tableDia.dispositivos) : [];

  // Derive bar chart data for selected row
  const barData: BarDataPoint[] = (() => {
    if (!rangeData || !selectedRow) return [];
    return rangeData.dias
      .map((dia) => {
        const pctCaida = findDeviceInDay(dia, selectedRow);
        if (pctCaida === null) return null;
        return {
          fecha: dia.fecha,
          porcentajeActivo: +(100 - pctCaida).toFixed(2),
        };
      })
      .filter((x): x is BarDataPoint => x !== null);
  })();

  const tableLabel = modo === "fecha" ? fecha : `${fechaInicio} a ${fechaFin}`;

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
            className={`toolbar-btn ${modo === "fecha" ? "toolbar-btn-active" : ""}`}
            onClick={() => setModo("fecha")}
          >
            Fecha
          </button>
          <button
            className={`toolbar-btn ${modo === "rango" ? "toolbar-btn-active" : ""}`}
            onClick={() => setModo("rango")}
          >
            Rango
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

        {modo === "rango" && (
          <div className="toolbar-date toolbar-date-range">
            <label className="date-range-label">Desde</label>
            <input
              type="date"
              className="date-input"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
            <label className="date-range-label">Hasta</label>
            <input
              type="date"
              className="date-input"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>
        )}

        {tableDia && (
          <span className="toolbar-count">
            {tableDia.totalRegistros} muestras
            {modo === "rango" && rangeData
              ? ` · ${rangeData.dias.length} dias`
              : " · 7 dias"}
          </span>
        )}
      </div>

      {loading && <div className="tendencias-empty">Cargando...</div>}
      {error && <div className="tendencias-error">{error}</div>}

      {!loading && rangeData && rows.length === 0 && (
        <div className="tendencias-empty">
          No hay datos de caidas para {tableLabel}.
        </div>
      )}

      {!loading && tableDia && rows.length > 0 && (
        <>
          {/* ── Charts area (above table) ── */}
          <div className="tendencias-charts">
            {!selectedRow && (
              <div className="chart-placeholder">
                <span className="chart-placeholder-icon">&#9673;</span>
                <span>Selecciona una fila para ver los graficos</span>
              </div>
            )}

            {selectedRow && (
              <div className="charts-row">
                {/* Pie chart: only in fecha mode */}
                {modo === "fecha" && (
                  <div className="chart-card">
                    <PieChart
                      porcentajeCaida={selectedRow.porcentajeCaida}
                      label={`${selectedRow.nombre} (${selectedRow.sector})`}
                    />
                  </div>
                )}

                {/* Bar chart */}
                {barData.length > 0 && (
                  <div className="chart-card chart-card-grow">
                    <BarChart
                      data={barData}
                      label={
                        modo === "fecha"
                          ? `% Activo - Ultimos 7 dias`
                          : `% Activo - ${fechaInicio} a ${fechaFin}`
                      }
                    />
                  </div>
                )}

                {/* Details */}
                <div className="chart-card chart-card-details">
                  <div className="chart-details">
                    <div className="detail-row">
                      <span className="detail-label">Dispositivo</span>
                      <span className="detail-value">{selectedRow.nombre}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">IP</span>
                      <span className="detail-value">{selectedRow.ip}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Ubicacion</span>
                      <span className="detail-value">
                        {selectedRow.ubicacion}
                      </span>
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
                </div>
              </div>
            )}
          </div>

          {/* ── Table ── */}
          <div className="tendencias-table-wrap">
            {modo === "rango" && (
              <div className="table-date-note">
                Mostrando datos del {tableDia.fecha}
              </div>
            )}

            {/* Gateway summary */}
            <div className="section-label">Gateways</div>
            <table className="tendencias-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>IP</th>
                  <th>Sectores</th>
                  <th className="col-num">Caidas</th>
                  <th className="col-num">Muestras</th>
                  <th className="col-num">% Caida</th>
                  <th className="col-estado">Estado</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(tableDia.gateways).map(([id, gw]) => {
                  const isSelected =
                    selectedRow !== null && selectedRow.nombre === `GW-${id}`;
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
                      <td className="col-estado">
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
                      <th className="col-num">Caidas</th>
                      <th className="col-num">Muestras</th>
                      <th className="col-num">% Caida</th>
                      <th className="col-estado">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(tableDia.dispositivos[sector]).map(
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
                            <td className="col-estado">
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
        </>
      )}
    </div>
  );
}
