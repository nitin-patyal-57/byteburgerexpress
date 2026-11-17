/**
 * Runtime Backend and API Configuration for ByteBurger Express
 * Supports local development, hosted cloud backends, and standalone APK environments.
 */

export const DEFAULT_GEMINI_API_KEY = '';

export function getBackendBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('byteburger_backend_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  }
  return (import.meta.env.VITE_BACKEND_URL || '').replace(/\/+$/, '');
}

export function setBackendBaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean) {
      localStorage.setItem('byteburger_backend_url', clean);
    } else {
      localStorage.removeItem('byteburger_backend_url');
    }
  }
}

export function getGeminiApiKey(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('byteburger_gemini_api_key');
    if (custom && custom.trim()) {
      return custom.trim();
    }
  }
  return (import.meta.env.VITE_GEMINI_API_KEY || DEFAULT_GEMINI_API_KEY).trim();
}

export function setGeminiApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    const clean = key.trim();
    if (clean) {
      localStorage.setItem('byteburger_gemini_api_key', clean);
    } else {
      localStorage.removeItem('byteburger_gemini_api_key');
    }
  }
}
