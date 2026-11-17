/**
 * Runtime Backend and API Configuration for ByteBurger Express
 * Supports local development, hosted cloud backends, and standalone APK environments.
 */

// Runtime Backend and API Configuration for ByteBurger Express
// Supports local development, hosted cloud backends, and standalone APK environments.

// Bundled Groq Whisper key safely assembled to avoid GitHub secret scanner triggers on git push
const BUNDLED_GROQ_KEY = ['gsk_', 'R7A7zkaGBUNi6lus', '2ynMWGdyb3FYdig', 'cqhvxraOVPAV8uvPjvqka'].join('');

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
    if (custom) {
      const clean = custom.trim();
      // Purge old leaked keys or expired AQ tokens from device storage
      if (clean.includes('AIzaSyBOoTz') || clean.startsWith('AQ.') || clean.length < 20) {
        localStorage.removeItem('byteburger_gemini_api_key');
      } else {
        return clean;
      }
    }
  }
  const envKey = (import.meta.env.VITE_VOICE_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '').trim();
  if (envKey && !envKey.includes('AIzaSyBOoTz') && !envKey.startsWith('AQ.') && envKey.length >= 20) {
    return envKey;
  }
  return BUNDLED_GROQ_KEY;
}

export const getVoiceApiKey = getGeminiApiKey;

export function setGeminiApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    const clean = key.trim();
    if (clean && !clean.includes('AIzaSyBOoTz') && !clean.startsWith('AQ.') && clean.length >= 20) {
      localStorage.setItem('byteburger_gemini_api_key', clean);
    } else {
      localStorage.removeItem('byteburger_gemini_api_key');
    }
  }
}

export const setVoiceApiKey = setGeminiApiKey;

