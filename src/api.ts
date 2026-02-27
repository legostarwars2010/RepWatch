/**
 * API base URL for backend. Empty = same origin (use Vite proxy in dev).
 * Set VITE_API_URL=http://localhost:8080 in .env to hit the backend directly if proxy fails.
 */
export const API_BASE = (import.meta.env.VITE_API_URL as string)?.trim() || ''

export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE}${p}`
}
