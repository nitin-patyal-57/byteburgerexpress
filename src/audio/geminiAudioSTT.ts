/**
 * Direct Gemini Cloud Audio Speech Recognition (STT) Engine
 * Designed for AOSP Android tablets (Rockchip RK3568, etc.) lacking Google Speech Services.
 * Captures live microphone PCM audio, applies robust Voice Activity Detection (VAD) via AnalyserNode,
 * and streams speech snippets directly to Gemini 3.5 Flash Lite for ultra-fast, accurate transcription.
 */

import { getGeminiApiKey, BUNDLED_GROQ_KEY } from '../config';
import { apkLogger } from '../utils/apkLogger';
import {
  MicFilterConfig,
  getStoredMicFilterConfig,
  subscribeToMicFilterConfig,
} from './micFilterConfig';

export function encodePcmToWavBase64(samples: Float32Array, inputSampleRate: number): string {
  const targetSampleRate = 16000;
  let downsampled: Float32Array;

  if (inputSampleRate === targetSampleRate) {
    downsampled = samples;
  } else {
    // Linear interpolation downsampling to 16000 Hz
    const ratio = inputSampleRate / targetSampleRate;
    const newLength = Math.round(samples.length / ratio);
    downsampled = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const origIndex = i * ratio;
      const left = Math.floor(origIndex);
      const right = Math.min(left + 1, samples.length - 1);
      const frac = origIndex - left;
      downsampled[i] = samples[left] * (1 - frac) + samples[right] * frac;
    }
  }

  const numSamples = downsampled.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');

  // fmt subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // SubChunk1Size = 16 for PCM
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, 1, true); // NumChannels = 1 (Mono)
  view.setUint32(24, targetSampleRate, true); // SampleRate = 16000
  view.setUint32(28, targetSampleRate * 2, true); // ByteRate = 16000 * 1 * 2
  view.setUint16(32, 2, true); // BlockAlign = 1 * 2
  view.setUint16(34, 16, true); // BitsPerSample = 16

  // data subchunk
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Write PCM 16-bit samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, downsampled[i]));
    const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  // Convert ArrayBuffer to binary string and base64
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, sub as any);
  }

  return btoa(binary);
}

export function encodePcmToWavBlob(samples: Float32Array, inputSampleRate: number): Blob {
  const targetSampleRate = 16000;
  let downsampled: Float32Array;

  if (inputSampleRate === targetSampleRate) {
    downsampled = samples;
  } else {
    const ratio = inputSampleRate / targetSampleRate;
    const newLength = Math.round(samples.length / ratio);
    downsampled = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const origIndex = i * ratio;
      const left = Math.floor(origIndex);
      const right = Math.min(left + 1, samples.length - 1);
      const frac = origIndex - left;
      downsampled[i] = samples[left] * (1 - frac) + samples[right] * frac;
    }
  }

  const numSamples = downsampled.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');

  // fmt subchunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  // data subchunk
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Write PCM 16-bit samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, downsampled[i]));
    const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Ultra-fast Groq Whisper Large v3 Turbo transcription (150ms-290ms latency)
 */
async function transcribeWithGroqWhisper(wavBlob: Blob, apiKey: string, abortSignal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append('file', wavBlob, 'audio.wav');
  form.append('model', 'whisper-large-v3-turbo');
  form.append('temperature', '0');
  form.append('response_format', 'json');
  form.append('prompt', 'ByteBurger Express food order: burger, fries, drink, combo, veg, cancel.');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => controller.abort());
  }
  const startTime = Date.now();
  const keyDisplay = apiKey.slice(0, 8) + '...' + apiKey.slice(-4);
  apkLogger.info('GEMINI', `Sending audio to Groq Whisper LPU (Key: ${keyDisplay})...`);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;

    if (!res.ok) {
      if (abortSignal?.aborted) return '';
      let errDetail = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        errDetail = errJson?.error?.message || errDetail;
      } catch {}
      apkLogger.error('GEMINI', `Groq Whisper HTTP ${res.status} error (${elapsed}ms): ${errDetail}`);
      return '';
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gemini_api_key_error', { detail: null }));
    }

    const data = await res.json();
    const clean = (data?.text || '').trim().replace(/^["']|["']$/g, '');

    // Filter silence artifacts, prompt echoes, and non-speech phonemes
    const upperClean = clean.toUpperCase().replace(/[.,!?;:]/g, '').trim();
    const isSingleLetterOrShort = upperClean.length <= 1 || /^[A-Z]$/.test(upperClean);
    const isNoiseArtifact =
      !upperClean ||
      isSingleLetterOrShort ||
      upperClean === 'THANK YOU' ||
      upperClean === 'YOU' ||
      upperClean === 'ENGLISH' ||
      upperClean === 'HINGLISH' ||
      upperClean === 'HINDI' ||
      upperClean === 'BISH' ||
      upperClean === 'AAND' ||
      upperClean === 'GIRA' ||
      upperClean === 'SILENCE' ||
      upperClean === 'NO SPEECH' ||
      upperClean === 'SUBTITLES' ||
      upperClean === 'FOUND ONE' ||
      upperClean === 'SHOWING OFF' ||
      upperClean === 'AND' ||
      upperClean === 'BYE';

    if (isNoiseArtifact) {
      apkLogger.info('GEMINI', `Groq Whisper 200 OK (${elapsed}ms) -> [FILTERED NOISE ARTIFACT: "${clean}"]`);
      return '';
    }

    apkLogger.success('GEMINI', `Groq Whisper 200 OK (${elapsed}ms) -> Transcribed: "${clean}"`);
    return clean;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (abortSignal?.aborted) return '';
    const isTimeout = err?.name === 'AbortError' || String(err?.message || '').includes('aborted');
    const msg = isTimeout ? 'Network timeout (>12s) on Groq' : (err?.message || err);
    apkLogger.error('GEMINI', `Groq Whisper fetch network error: ${msg}`);
    return '';
  }
}

export async function transcribeAudioWithGemini(
  base64Wav: string,
  apiKey: string = getGeminiApiKey(),
  abortSignal?: AbortSignal
): Promise<string> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey || cleanKey.length < 20 || cleanKey.includes('AIzaSyBOoTz')) {
    apkLogger.warn('GEMINI', 'No valid Voice AI key configured. Speech cannot be sent.');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gemini_api_key_error', {
          detail: 'Voice API Key Required: Tap here to enter your Groq or Gemini API key in Mic Tuning.',
        })
      );
    }
    return '';
  }

  // 1. If key is Groq (starts with gsk_), convert base64Wav to Blob and use ultra-fast Groq Whisper!
  if (cleanKey.startsWith('gsk_')) {
    const binary = atob(base64Wav);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/wav' });
    return transcribeWithGroqWhisper(blob, cleanKey, abortSignal);
  }

  // 2. Otherwise use Google Gemini Flash
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${cleanKey}`;
  const keyDisplay = cleanKey.slice(0, 6) + '...' + cleanKey.slice(-4);
  apkLogger.info('GEMINI', `Sending audio chunk to Gemini Flash (Key: ${keyDisplay})...`);

  const prompt =
    'You are a speech-to-text transcriber for a fast-food ordering kiosk (ByteBurger Express) in a busy, noisy restaurant hall.\n' +
    'The microphone captures ambient hall noise, background room reverberation, and customer speech.\n' +
    'DIRECTIVE: Focus strictly on the primary speaker in the foreground ordering at the kiosk. Filter out all background hall chatter and room noise.\n' +
    'Extract and transcribe ONLY their food order or kiosk command in English or Hinglish (e.g. "Add one double cheese burger", "one peri peri fries", "coke zero", "confirm order", "show burgers", "cancel").\n' +
    'If the audio contains only background static, noise, or silence without any customer food order, reply with ONLY "SILENCE".\n' +
    'Otherwise return ONLY the customer order phrase, without quotes or punctuation.';

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: 'audio/wav',
              data: base64Wav,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 25,
      candidateCount: 1,
    },
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  const startTime = Date.now();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;

    if (!res.ok) {
      let errDetail = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(await res.text());
        errDetail = errJson?.error?.message || errDetail;
      } catch { }
      apkLogger.error('GEMINI', `Gemini HTTP ${res.status} error (${elapsed}ms): ${errDetail}`);

      if (res.status === 401 || res.status === 403) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('byteburger_gemini_api_key');
        }
        apkLogger.warn('GEMINI', `Gemini key rejected (${res.status}). Auto-falling back to Groq Whisper LPU...`);
        const binary = atob(base64Wav);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'audio/wav' });
        return transcribeWithGroqWhisper(blob, BUNDLED_GROQ_KEY);
      }

      if (typeof window !== 'undefined') {
        let msg = errDetail;
        if (res.status === 403 || errDetail.toLowerCase().includes('leaked')) {
          msg = 'Gemini API Key was reported as leaked/revoked. Tap to enter a new key in Mic Tuning.';
        } else if (res.status === 401) {
          msg = 'Invalid API key (HTTP 401). Tap to enter a key in Mic Tuning.';
        }
        window.dispatchEvent(
          new CustomEvent('gemini_api_key_error', {
            detail: msg,
          })
        );
      }
      return '';
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gemini_api_key_error', { detail: null }));
    }

    const data = await res.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = candidateText.trim().replace(/^["']|["']$/g, '');

    if (!clean || clean.toUpperCase() === 'SILENCE' || clean.toLowerCase().includes('silence')) {
      apkLogger.info('GEMINI', `HTTP 200 OK (${elapsed}ms) -> [SILENCE / NO SPEECH]`);
      return '';
    }

    apkLogger.success('GEMINI', `HTTP 200 OK (${elapsed}ms) -> Transcribed: "${clean}"`);
    return clean;
  } catch (err: any) {
    clearTimeout(timeoutId);
    const isTimeout = err?.name === 'AbortError' || String(err?.message || '').includes('aborted');
    const msg = isTimeout ? 'Network timeout: Request took > 15s. Check kiosk WiFi speed.' : (err?.message || err);
    apkLogger.error('GEMINI', `Gemini fetch network error: ${msg}`);
    return '';
  }
}

/**
 * Validate a Voice API key (Groq or Gemini) with a fast ping request
 */
export async function testGeminiApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey || cleanKey.length < 15) {
    return { ok: false, message: 'Invalid key length. A valid API key must be provided.' };
  }

  // 1. Cartesia Sonic API validation ping
  if (cleanKey.startsWith('sk_car_')) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch('https://api.cartesia.ai/voices', {
        headers: {
          'X-API-Key': cleanKey,
          'Cartesia-Version': '2024-06-10',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        apkLogger.success('GEMINI', 'Cartesia Sonic API key verified successfully (HTTP 200 OK)');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gemini_api_key_error', { detail: null }));
        }
        return { ok: true, message: '✅ Success! Cartesia Sonic Studio Voice AI connection verified and active.' };
      }

      const errJson = await res.json().catch(() => ({}));
      const msg = errJson?.error?.message || `HTTP ${res.status}`;
      apkLogger.error('GEMINI', `Cartesia key test failed (${res.status}): ${msg}`);
      return { ok: false, message: `❌ Cartesia validation failed (${res.status}): ${msg}` };
    } catch (e: any) {
      return { ok: false, message: `❌ Network connection failed to Cartesia: ${e?.message || e}` };
    }
  }

  // 2. Groq API validation ping
  if (cleanKey.startsWith('gsk_')) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${cleanKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        apkLogger.success('GEMINI', 'Groq Whisper API key verified successfully (HTTP 200 OK)');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gemini_api_key_error', { detail: null }));
        }
        return { ok: true, message: '✅ Success! Groq Whisper LPU AI connection verified and active.' };
      }

      const errJson = await res.json().catch(() => ({}));
      const msg = errJson?.error?.message || `HTTP ${res.status}`;
      apkLogger.error('GEMINI', `Groq key test failed (${res.status}): ${msg}`);
      return { ok: false, message: `❌ Groq validation failed (${res.status}): ${msg}` };
    } catch (e: any) {
      return { ok: false, message: `❌ Network connection failed to Groq: ${e?.message || e}` };
    }
  }

  // 2. Google Gemini API validation ping
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${cleanKey}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Respond with OK' }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (res.ok) {
      apkLogger.success('GEMINI', 'Gemini API Key verification succeeded (HTTP 200 OK)');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gemini_api_key_error', { detail: null }));
      }
      return { ok: true, message: '✅ Success! Gemini AI connection verified and active.' };
    }

    const errJson = await res.json().catch(() => ({}));
    const msg = errJson?.error?.message || `HTTP ${res.status}`;
    apkLogger.error('GEMINI', `API Key test failed (${res.status}): ${msg}`);
    if (res.status === 401) {
      return {
        ok: false,
        message: '❌ Invalid API key (HTTP 401). Please check that your key is active and correctly formatted.',
      };
    }
    if (res.status === 403) {
      return { ok: false, message: `❌ Key blocked by Google: ${msg}. Please create a fresh key at aistudio.google.com` };
    }
    return { ok: false, message: `❌ Error (${res.status}): ${msg}` };
  } catch (e: any) {
    return { ok: false, message: `❌ Network connection failed: ${e?.message || e}` };
  }
}

/**
 * Real-Time Full-Duplex Echo Detection (like Gemini Live):
 * Determines whether a transcribed audio chunk is simply the kiosk's own loudspeaker
 * echo playing into the chassis microphone, or a genuine customer vocal interruption.
 */
export function isEchoOfAssistant(recognizedText: string, assistantSpeech: string): boolean {
  if (!recognizedText) return true;
  if (!assistantSpeech) return false;

  const rec = recognizedText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
  const asst = assistantSpeech.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();

  if (!rec) return true;

  // Directive customer words that ALWAYS mean a human is actively speaking/interrupting
  const directInterruptRegex = /\b(wait|stop|cancel|change|remove|delete|no|nahi|suno|bhai|aur|instead|ruk|ruko)\b/i;
  if (directInterruptRegex.test(rec)) {
    return false; // Definite customer vocal interruption!
  }

  // Exact or near substring match: if assistant was saying this exact phrase, it's echo
  if (asst.includes(rec)) {
    return true;
  }

  // Word overlap ratio check
  const recWords = rec.split(/\s+/).filter(w => w.length > 2);
  if (recWords.length === 0) return true;

  let matchedWords = 0;
  for (const word of recWords) {
    if (asst.includes(word)) {
      matchedWords++;
    }
  }

  const matchRatio = matchedWords / recWords.length;
  // If >= 65% of words are repeating the assistant's own sentence, treat as speaker echo
  if (matchRatio >= 0.65) {
    return true;
  }

  return false;
}

export class GeminiCloudAudioRecognizer {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;

  // Acoustic Human Speech Bandpass Filter Chain
  private highpassFilter: BiquadFilterNode | null = null;
  private lowpassFilter: BiquadFilterNode | null = null;
  private peakingFilter: BiquadFilterNode | null = null;
  private filterConfig: MicFilterConfig = getStoredMicFilterConfig();
  private unsubscribeFilter: (() => void) | null = null;

  private isListening = false;
  private isSpeaking = false;
  private isTranscribing = false;
  private currentAssistantSpeech: string = '';

  // 5-Second Periodic Chunk Engine
  private currentChunkFrames: Float32Array[] = [];
  private chunkStartTime: number = Date.now();
  private chunkPeakVolume: number = 0;
  private chunkSpeechDetected: boolean = false;
  private lastSpeechTime: number = 0;
  private isTapToSpeakActive: boolean = false;
  private tapToSpeakTimer: any = null;
  private tapToSpeakInterval: any = null;
  private onCountdownCallback: ((seconds: number | null) => void) | null = null;

  private preRollBuffer: Float32Array[] = []; // Rolling buffer to preserve the first words (~340ms)
  private ambientNoiseFloor = 4.0;

  private onTranscriptCallback: ((text: string) => void) | null = null;
  private onInterimCallback: ((text: string) => void) | null = null;
  private onVolumeCallback: ((vol: number) => void) | null = null;
  private onStateCallback: ((state: 'LISTENING' | 'THINKING' | 'IDLE') => void) | null = null;
  private onLogCallback: ((message: string) => void) | null = null;
  private onBargeInCallback: (() => void) | null = null;
  private bargeInConsecutiveFrames: number = 0;
  private speechStartTime: number = 0;
  private smoothedVolume: number = 0;
  private activeAbortController: AbortController | null = null;

  constructor(
    onTranscript: (text: string) => void,
    onInterim: (text: string) => void,
    onVolume: (vol: number) => void,
    onState: (state: 'LISTENING' | 'THINKING' | 'IDLE') => void,
    onLog?: (message: string) => void,
    onBargeIn?: () => void
  ) {
    this.onTranscriptCallback = onTranscript;
    this.onInterimCallback = onInterim;
    this.onVolumeCallback = onVolume;
    this.onStateCallback = onState;
    this.onLogCallback = onLog || null;
    this.onBargeInCallback = onBargeIn || null;

    this.filterConfig = getStoredMicFilterConfig();
    this.unsubscribeFilter = subscribeToMicFilterConfig(cfg => {
      this.updateFilterConfig(cfg);
    });
  }

  public setOnBargeIn(cb: () => void) {
    this.onBargeInCallback = cb;
  }

  public updateFilterConfig(config: MicFilterConfig) {
    this.filterConfig = { ...config };
    if (this.audioCtx && this.highpassFilter && this.lowpassFilter && this.peakingFilter) {
      try {
        const now = this.audioCtx.currentTime;
        this.highpassFilter.frequency.setValueAtTime(config.lowCutHz, now);
        this.lowpassFilter.frequency.setValueAtTime(config.highCutHz, now);
        this.peakingFilter.gain.setValueAtTime(config.voiceBoostGainDb, now);
      } catch {
        // ignore
      }
    }
    this.onLogCallback?.(
      `[MIC-FILTER] Updated: ${config.lowCutHz}Hz-${config.highCutHz}Hz | Gate: ${config.noiseGateThreshold}% | Speed: ${config.silenceCutoffMs}ms`
    );
  }

  public getFilterConfig(): MicFilterConfig {
    return { ...this.filterConfig };
  }

  public async start(): Promise<boolean> {
    try {
      this.isListening = true;
      this.isSpeaking = false;
      this.isTranscribing = false;
      this.currentChunkFrames = [];
      this.chunkSpeechDetected = false;

      if (!this.mediaStream) {
        const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
        // CRITICAL ANDROID POS FIX (Rockchip RK3568 / AOSP):
        // Passing echoCancellation: true forces Android AudioManager into MODE_IN_COMMUNICATION (earpiece mode),
        // which silences the kiosk loudspeaker completely! Disable hardware AEC on Android because we already
        // pause mic capture during TTS playback and run our own Biquad speech bandpass filter.
        // Disable hardware AGC and dynamic noise suppression to eliminate gain pumping and audio volume fluctuations
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: !isAndroid,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
        });
        try {
          (window as any).AndroidAudioBridge?.forceSpeaker?.();
        } catch {}
      }

      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!this.audioCtx) {
        // Do NOT force sampleRate: 16000; use hardware native to prevent ALSA/hardware errors!
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);

      // Acoustic Human Voice Filter Chain:
      // 1. High-Pass: cuts HVAC/refrigerator hum and mechanical rumble (< lowCutHz)
      this.highpassFilter = this.audioCtx.createBiquadFilter();
      this.highpassFilter.type = 'highpass';
      this.highpassFilter.frequency.setValueAtTime(this.filterConfig.lowCutHz, this.audioCtx.currentTime);
      this.highpassFilter.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      // 2. Low-Pass: cuts fryer sizzle, steam espresso hiss, metal tray clatter (> highCutHz)
      this.lowpassFilter = this.audioCtx.createBiquadFilter();
      this.lowpassFilter.type = 'lowpass';
      this.lowpassFilter.frequency.setValueAtTime(this.filterConfig.highCutHz, this.audioCtx.currentTime);
      this.lowpassFilter.Q.setValueAtTime(0.707, this.audioCtx.currentTime);

      // 3. Speech Formant Peaking Filter: boosts human vocal register at 1.8 kHz
      this.peakingFilter = this.audioCtx.createBiquadFilter();
      this.peakingFilter.type = 'peaking';
      this.peakingFilter.frequency.setValueAtTime(1800, this.audioCtx.currentTime);
      this.peakingFilter.Q.setValueAtTime(1.0, this.audioCtx.currentTime);
      this.peakingFilter.gain.setValueAtTime(this.filterConfig.voiceBoostGainDb, this.audioCtx.currentTime);

      // Chain: source -> highpass -> lowpass -> peaking
      let processedAudioSource: AudioNode = this.sourceNode;
      if (this.filterConfig.filterEnabled) {
        this.sourceNode.connect(this.highpassFilter);
        this.highpassFilter.connect(this.lowpassFilter);
        this.lowpassFilter.connect(this.peakingFilter);
        processedAudioSource = this.peakingFilter;
      }

      // Analyser for clean filtered volume & VAD
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      processedAudioSource.connect(this.analyser);

      // ScriptProcessor for clean raw PCM capture
      this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = 0;

      processedAudioSource.connect(this.processor);
      this.processor.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      this.processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!this.isListening) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const frame = new Float32Array(inputData);

        // Compute true RMS energy of the frame
        let sumSq = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSq += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSq / inputData.length);
        const rawVol = Math.min(100, Math.round(rms * 450));

        // Smooth volume envelope: fast attack (0.35/0.65), gentle decay (0.85/0.15) to eliminate visual flutter
        if (rawVol > this.smoothedVolume) {
          this.smoothedVolume = this.smoothedVolume * 0.35 + rawVol * 0.65;
        } else {
          this.smoothedVolume = this.smoothedVolume * 0.85 + rawVol * 0.15;
        }
        const volPercent = Math.round(this.smoothedVolume);
        this.onVolumeCallback?.(volPercent);

        // FULL-DUPLEX ACOUSTIC BARGE-IN:
        // While the assistant speaks, continue collecting audio frames so customer voice can interrupt.
        // False self-interruption is prevented by isEchoOfAssistant in the chunk processor.
        // If raw volume spikes to extreme shouting level (> 92%) after 400ms onset, allow quick barge-in.
        if (this.isSpeaking) {
          const timeSinceSpeechStart = Date.now() - this.speechStartTime;
          if (timeSinceSpeechStart > 400 && rawVol >= 92) {
            this.bargeInConsecutiveFrames++;
            if (this.bargeInConsecutiveFrames >= 3) {
              this.isSpeaking = false;
              this.bargeInConsecutiveFrames = 0;
              apkLogger.info('MIC', `⚡ Loud Customer Vocal Barge-In detected (${rawVol}% >= 92%)! Halting assistant speech in <20ms...`);
              if (this.onBargeInCallback) {
                this.onBargeInCallback();
              }
            }
          } else {
            this.bargeInConsecutiveFrames = 0;
          }
        }

        // Track peak volume in current chunk
        if (volPercent > this.chunkPeakVolume) {
          this.chunkPeakVolume = volPercent;
        }

        // Dynamically track ambient room noise floor when quiet
        if (!this.chunkSpeechDetected) {
          this.ambientNoiseFloor = this.ambientNoiseFloor * 0.95 + volPercent * 0.05;
        }

        // Adaptive Human Speech Gate:
        // Direct human voice at the kiosk is 18%–65% RMS; ambient room noise is 5%–11%.
        // Gate requires clear vocal energy above room noise to eliminate silence hallucinations.
        const speechGate = Math.max(12.0, this.ambientNoiseFloor + 5.0);
        const IS_SPEECH = volPercent >= speechGate;

        if (IS_SPEECH) {
          if (!this.chunkSpeechDetected) {
            this.chunkSpeechDetected = true;
            this.chunkStartTime = Date.now();
            // Prepend rolling pre-roll buffer so opening consonants (p-, b-, f-) are preserved chronologically
            this.currentChunkFrames = [...this.preRollBuffer];
            this.preRollBuffer = [];
            this.onInterimCallback?.('Listening to your order...');
            this.onLogCallback?.(`Speech detected (${volPercent}% >= gate ${speechGate.toFixed(1)}%)`);
          }
          this.lastSpeechTime = Date.now();
        }

        // Append frame to speech chunk if active, otherwise maintain rolling pre-roll buffer
        if (this.chunkSpeechDetected) {
          this.currentChunkFrames.push(frame);
        } else {
          this.preRollBuffer.push(frame);
          if (this.preRollBuffer.length > 4) {
            this.preRollBuffer.shift();
          }
        }

        // If in Tap-to-Speak mode, let the dedicated 5s timer handle the commit
        if (this.isTapToSpeakActive) {
          return;
        }

        // High-Speed Conversational Endpointing:
        // Customer spoke and then paused for >= 480ms (natural sentence completion)
        const now = Date.now();
        const speechElapsed = this.chunkSpeechDetected ? (now - this.chunkStartTime) : 0;
        const silenceSinceLastSpeech = this.chunkSpeechDetected ? (now - this.lastSpeechTime) : 0;

        const speechFinished =
          this.chunkSpeechDetected &&
          this.lastSpeechTime > 0 &&
          silenceSinceLastSpeech >= 480 &&
          speechElapsed >= 380;

        const isMaxBoundary = this.chunkSpeechDetected && speechElapsed >= 4000;

        if (speechFinished || isMaxBoundary) {
          const framesToProcess = [...this.currentChunkFrames];
          const peakVol = this.chunkPeakVolume;

          // Reset chunk state for next turn
          this.currentChunkFrames = [];
          this.preRollBuffer = [];
          this.chunkStartTime = now;
          this.chunkPeakVolume = 0;
          this.chunkSpeechDetected = false;
          this.lastSpeechTime = 0;

          // Only send if peak volume showed genuine human vocal energy
          if (peakVol >= Math.max(13.0, speechGate)) {
            if (this.isTranscribing && this.activeAbortController) {
              try { this.activeAbortController.abort(); } catch {}
              this.activeAbortController = null;
              this.isTranscribing = false;
            }
            this.processChunk(framesToProcess);
          }
        }
      };

      this.onStateCallback?.('LISTENING');
      return true;
    } catch (err) {
      console.error('GeminiCloudAudioRecognizer start failed:', err);
      return false;
    }
  }

  private async processChunk(frames: Float32Array[]) {
    if (frames.length === 0) return;

    this.isTranscribing = true;
    this.activeAbortController = new AbortController();
    const currentController = this.activeAbortController;

    this.onStateCallback?.('THINKING');
    this.onInterimCallback?.('⚡ Processing order...');

    try {
      let totalLength = 0;
      for (const chunk of frames) {
        totalLength += chunk.length;
      }

      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of frames) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      const sampleRate = this.audioCtx?.sampleRate || 48000;
      const durationSec = (totalLength / sampleRate).toFixed(1);

      if (totalLength < sampleRate * 0.25) {
        this.isTranscribing = false;
        this.onInterimCallback?.('');
        if (this.isListening && !this.isSpeaking) {
          this.onStateCallback?.('LISTENING');
        }
        return;
      }

      this.onLogCallback?.(`Analyzing ${durationSec}s chunk with Groq Whisper Turbo...`);

      const base64Wav = encodePcmToWavBase64(merged, sampleRate);
      const text = await transcribeAudioWithGemini(base64Wav, undefined, currentController.signal);

      // If this request was superseded by a newer barge-in/chunk, ignore stale text
      if (currentController.signal.aborted) {
        return;
      }

      if (text && this.isListening) {
        if (this.isSpeaking) {
          // Full-Duplex AEC Echo Verification:
          // Check if this audio chunk is simply the kiosk's own speaker echoing back
          if (isEchoOfAssistant(text, this.currentAssistantSpeech)) {
            apkLogger.info('MIC', `[AEC-ECHO-CANCELLED] Assistant speaker feedback filtered: "${text}"`);
            return;
          }

          // Genuine Customer Vocal Interruption (Barge-In)!
          apkLogger.success('MIC', `⚡ Customer vocal interruption detected: "${text}"! Halting assistant speech in <20ms...`);
          this.isSpeaking = false;
          this.currentAssistantSpeech = '';
          if (this.onBargeInCallback) {
            this.onBargeInCallback();
          }
          this.onTranscriptCallback?.(text);
          return;
        }

        this.onLogCallback?.(`Whisper recognized: "${text}"`);
        this.onInterimCallback?.('');
        this.onTranscriptCallback?.(text);
      } else {
        this.onInterimCallback?.('');
        if (this.isListening && !this.isSpeaking) {
          this.onStateCallback?.('LISTENING');
        }
      }
    } catch (e: any) {
      if (currentController.signal.aborted) return;
      this.onLogCallback?.(`Chunk recognition error: ${e?.message || e}`);
      this.onInterimCallback?.('');
      if (this.isListening && !this.isSpeaking) {
        this.onStateCallback?.('LISTENING');
      }
    } finally {
      if (this.activeAbortController === currentController) {
        this.isTranscribing = false;
        this.activeAbortController = null;
      }
    }
  }

  /**
   * Push-to-Talk / Tap-to-Speak trigger:
   * Explicitly opens a clean 5-second recording chunk with on-screen countdown.
   * At the end of 5 seconds, provides a distinct break and adds to cart.
   */
  public startTapToSpeak(durationMs = 5000, onCountdown?: (seconds: number | null) => void) {
    if (this.isSpeaking || this.isTranscribing) return;

    this.isListening = true;
    this.isTapToSpeakActive = true;
    this.currentChunkFrames = [];
    this.chunkStartTime = Date.now();
    this.chunkPeakVolume = 0;
    this.chunkSpeechDetected = true;
    this.lastSpeechTime = Date.now();
    this.onCountdownCallback = onCountdown || null;

    this.onInterimCallback?.('Listening to your order (5s chunk)... Speak now!');
    this.onStateCallback?.('LISTENING');

    if (this.tapToSpeakTimer) {
      clearTimeout(this.tapToSpeakTimer);
      this.tapToSpeakTimer = null;
    }
    if (this.tapToSpeakInterval) {
      clearInterval(this.tapToSpeakInterval);
      this.tapToSpeakInterval = null;
    }

    let remaining = Math.round(durationMs / 1000);
    this.onCountdownCallback?.(remaining);

    this.tapToSpeakInterval = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        this.onCountdownCallback?.(remaining);
      } else {
        clearInterval(this.tapToSpeakInterval);
        this.tapToSpeakInterval = null;
      }
    }, 1000);

    this.tapToSpeakTimer = setTimeout(async () => {
      this.isTapToSpeakActive = false;
      this.onCountdownCallback?.(null);

      const frames = [...this.currentChunkFrames];
      this.currentChunkFrames = [];
      this.chunkStartTime = Date.now();

      this.onInterimCallback?.('⚡ Checking order & adding to cart...');
      await this.processChunk(frames);
    }, durationMs);
  }

  public pauseForSpeaking(assistantText?: string) {
    this.isSpeaking = true;
    this.speechStartTime = Date.now();
    this.currentAssistantSpeech = (assistantText || '').trim();
    this.currentChunkFrames = [];
    this.chunkPeakVolume = 0;
    this.chunkSpeechDetected = false;
    this.bargeInConsecutiveFrames = 0;
    // Abort any in-flight background Whisper requests from the previous turn
    if (this.activeAbortController) {
      try { this.activeAbortController.abort(); } catch {}
      this.activeAbortController = null;
    }
    this.isTranscribing = false;
    if (this.tapToSpeakTimer) {
      clearTimeout(this.tapToSpeakTimer);
      this.tapToSpeakTimer = null;
    }
    if (this.tapToSpeakInterval) {
      clearInterval(this.tapToSpeakInterval);
      this.tapToSpeakInterval = null;
    }
  }

  public resumeListening() {
    this.isSpeaking = false;
    this.currentAssistantSpeech = '';
    this.chunkStartTime = Date.now();
    this.currentChunkFrames = [];
    this.chunkPeakVolume = 0;
    this.chunkSpeechDetected = false;
    this.bargeInConsecutiveFrames = 0;
    this.preRollBuffer = []; // Discard speaker echo tail to prevent acoustic feedback loop
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(t => {
        t.enabled = true;
      });
    }
    if (this.isListening && !this.isTranscribing) {
      this.onStateCallback?.('LISTENING');
    }
  }

  public stop() {
    this.isListening = false;
    this.isSpeaking = false;
    this.isTranscribing = false;
    this.isTapToSpeakActive = false;
    this.currentChunkFrames = [];
    this.preRollBuffer = [];
    if (this.tapToSpeakTimer) {
      clearTimeout(this.tapToSpeakTimer);
      this.tapToSpeakTimer = null;
    }
    if (this.tapToSpeakInterval) {
      clearInterval(this.tapToSpeakInterval);
      this.tapToSpeakInterval = null;
    }
    // Abort any in-flight transcription so a stopped mic can't fire callbacks.
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch { }
      this.activeAbortController = null;
    }

    try {
      if (this.processor) {
        this.processor.onaudioprocess = null;
      }
      this.processor?.disconnect();
      this.analyser?.disconnect();
      this.sourceNode?.disconnect();
      this.gainNode?.disconnect();
      this.highpassFilter?.disconnect();
      this.lowpassFilter?.disconnect();
      this.peakingFilter?.disconnect();
      this.processor = null;
      this.analyser = null;
      this.sourceNode = null;
      this.gainNode = null;
      this.highpassFilter = null;
      this.lowpassFilter = null;
      this.peakingFilter = null;
    } catch { }

    // Release the microphone hardware and the AudioContext. Without this,
    // every mic on/off cycle leaked a live MediaStream + AudioContext, and
    // the Android WebView caps both (~6 contexts) — voice ordering would
    // hard-fail after a handful of cycles until the app was restarted.
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => {
        try {
          track.stop();
        } catch { }
      });
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      if (this.audioCtx.state !== 'closed') {
        try {
          void this.audioCtx.close();
        } catch { }
      }
      this.audioCtx = null;
    }

    if (this.unsubscribeFilter) {
      this.unsubscribeFilter();
      this.unsubscribeFilter = null;
    }

    this.onStateCallback?.('IDLE');
  }
}
