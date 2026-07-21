/**
 * Cada empresa corre su propio backend en un puerto distinto, así que la URL
 */
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

const API_BASES: Record<string, string> = {
  ipsp: import.meta.env.VITE_IPSP_API ?? API_URL,
  grupobrito: import.meta.env.VITE_GRUPOBRITO_API ?? API_URL,
  naturisa: import.meta.env.VITE_NATURISA_API ?? API_URL,
};

const INTERNAL_TOKEN = import.meta.env.VITE_INTERNAL_TOKEN ?? "";

function baseDe(path: string): string {
  const m = path.match(/^\/api\/([^/]+)/);
  const empresa = m?.[1];
  if (empresa && API_BASES[empresa]) return API_BASES[empresa];
  return API_URL;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = localStorage.getItem("token");
  const base = baseDe(path);

  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(INTERNAL_TOKEN ? { "x-internal-token": INTERNAL_TOKEN } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = "";
    try {
      const body = JSON.parse(text);
      detail = body.error ?? body.message ?? text;
    } catch {
      detail = text;
    }
    // Incluye la base para que en consola se vea a QUÉ backend se pidió
    const info = `${res.status} ${res.statusText} — ${base}${path}`;
    throw new ApiError(res.status, detail ? `${info}: ${detail}` : info);
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
