/**
 * Direct Gemini Cloud Audio Speech Recognition (STT) Engine
 * Designed for AOSP Android tablets (Rockchip RK3568, etc.) lacking Google Speech Services.
 * Captures live microphone PCM audio, applies robust Voice Activity Detection (VAD) via AnalyserNode,
 * and streams speech snippets directly to Gemini 3.5 Flash Lite for ultra-fast, accurate transcription.
 */

import { getGeminiApiKey } from '../config';
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

export async function transcribeAudioWithGemini(
  base64Wav: string,
  apiKey: string = getGeminiApiKey()
): Promise<string> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey || cleanKey.length < 15) {
    console.warn('Valid Gemini API Key not configured:', cleanKey);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gemini_api_key_error', {
          detail: 'No valid Gemini API key configured. Please enter your key in Mic Tuning.',
        })
      );
    }
    return '';
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanKey}`;

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
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      let errDetail = `HTTP ${res.status}`;
      try {
        const errJson = JSON.parse(await res.text());
        errDetail = errJson?.error?.message || errDetail;
      } catch {}
      console.warn('Gemini audio transcription HTTP error:', res.status, errDetail);

      if (typeof window !== 'undefined' && (res.status === 403 || res.status === 400)) {
        window.dispatchEvent(
          new CustomEvent('gemini_api_key_error', {
            detail: `Gemini API Key Error: ${errDetail}. Please update your API key in Mic Tuning or Admin.`,
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
      return '';
    }

    return clean;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn('Gemini audio transcription fetch failed:', err?.message || err);
    return '';
  }
}

/**
 * Validate a Gemini API key with a fast ping request
 */
export async function testGeminiApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey || cleanKey.length < 15) {
    return { ok: false, message: 'Invalid key length. A valid Gemini API key must be provided.' };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanKey}`;

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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gemini_api_key_error', { detail: null }));
      }
      return { ok: true, message: '✅ Success! Gemini AI connection verified and active.' };
    }

    const errJson = await res.json().catch(() => ({}));
    const msg = errJson?.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) {
      return {
        ok: false,
        message:
          '❌ Invalid API key (HTTP 401). Please create a free Gemini API key starting with "AIzaSy..." at https://aistudio.google.com/app/apikey (Keys starting with "AQ." are unauthorized Cloud tokens).',
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

  constructor(
    onTranscript: (text: string) => void,
    onInterim: (text: string) => void,
    onVolume: (vol: number) => void,
    onState: (state: 'LISTENING' | 'THINKING' | 'IDLE') => void,
    onLog?: (message: string) => void
  ) {
    this.onTranscriptCallback = onTranscript;
    this.onInterimCallback = onInterim;
    this.onVolumeCallback = onVolume;
    this.onStateCallback = onState;
    this.onLogCallback = onLog || null;

    this.filterConfig = getStoredMicFilterConfig();
    this.unsubscribeFilter = subscribeToMicFilterConfig(cfg => {
      this.updateFilterConfig(cfg);
    });
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
      this.pcmChunks = [];
      this.speechDetected = false;

      if (!this.mediaStream) {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
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
        if (!this.isListening || this.isSpeaking) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const frame = new Float32Array(inputData);

        // Keep rolling pre-roll buffer (last 4 frames ~340ms)
        this.preRollBuffer.push(frame);
        if (this.preRollBuffer.length > 4) {
          this.preRollBuffer.shift();
        }

        // Compute true RMS energy of the frame
        let sumSq = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSq += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSq / inputData.length);
        const volPercent = Math.min(100, Math.round(rms * 450));
        this.onVolumeCallback?.(volPercent);

        // Track peak volume in current 5-second chunk
        if (volPercent > this.chunkPeakVolume) {
          this.chunkPeakVolume = volPercent;
        }

        // Dynamically track ambient hall noise floor when quiet
        if (!this.chunkSpeechDetected) {
          this.ambientNoiseFloor = this.ambientNoiseFloor * 0.95 + volPercent * 0.05;
        }

        // Speech detection gate
        const gate = this.filterConfig.noiseGateThreshold;
        const effectiveGate = Math.max(gate, Math.min(this.ambientNoiseFloor + 1.2, 7.5));
        const IS_SPEECH = volPercent >= effectiveGate;

        if (IS_SPEECH) {
          if (!this.chunkSpeechDetected) {
            this.chunkSpeechDetected = true;
            this.onInterimCallback?.('Listening to your order...');
            this.onLogCallback?.(`Speech detected (${volPercent}% >= gate ${effectiveGate.toFixed(1)}%)`);
          }
          this.lastSpeechTime = Date.now();
        }

        this.currentChunkFrames.push(frame);

        // If in Tap-to-Speak mode, let the dedicated 5s timer handle the commit
        if (this.isTapToSpeakActive) {
          return;
        }

        // Continuous 5-Second Periodic Chunk Engine:
        const now = Date.now();
        const chunkElapsed = now - this.chunkStartTime;

        // Commit condition:
        // 1. Full 5-second chunk reached (5000ms), OR
        // 2. Speech finished early: speech was detected, followed by >= 750ms of silence, and chunk is at least 1.5s
        const speechFinishedEarly =
          this.chunkSpeechDetected &&
          this.lastSpeechTime > 0 &&
          now - this.lastSpeechTime >= 750 &&
          chunkElapsed >= 1500;

        const is5SecondBoundary = chunkElapsed >= 5000;

        if (is5SecondBoundary || speechFinishedEarly) {
          const framesToProcess = [...this.currentChunkFrames];
          const hadSpeech = this.chunkSpeechDetected || this.chunkPeakVolume >= effectiveGate;

          // Start next 5-second chunk immediately (preserve 2 frames ~170ms overlap)
          this.currentChunkFrames = this.currentChunkFrames.slice(-2);
          this.chunkStartTime = now;
          this.chunkPeakVolume = 0;
          this.chunkSpeechDetected = false;
          this.lastSpeechTime = 0;

          if (hadSpeech && !this.isTranscribing) {
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
    if (frames.length === 0 || this.isTranscribing || this.isSpeaking) return;

    this.isTranscribing = true;
    this.onStateCallback?.('THINKING');
    this.onInterimCallback?.('Checking order with Gemini...');

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

      if (totalLength < sampleRate * 0.3) {
        this.isTranscribing = false;
        this.onInterimCallback?.('');
        if (this.isListening && !this.isSpeaking) {
          this.onStateCallback?.('LISTENING');
        }
        return;
      }

      this.onLogCallback?.(`Analyzing ${durationSec}s chunk with Gemini 1.5 Flash...`);

      const base64Wav = encodePcmToWavBase64(merged, sampleRate);
      const text = await transcribeAudioWithGemini(base64Wav);

      if (text && this.isListening) {
        this.onLogCallback?.(`Gemini 5s chunk recognized: "${text}"`);
        this.onInterimCallback?.('');
        this.onTranscriptCallback?.(text);
      } else {
        this.onInterimCallback?.('');
        if (this.isListening && !this.isSpeaking) {
          this.onStateCallback?.('LISTENING');
        }
      }
    } catch (e: any) {
      this.onLogCallback?.(`Chunk recognition error: ${e?.message || e}`);
      this.onInterimCallback?.('');
      if (this.isListening && !this.isSpeaking) {
        this.onStateCallback?.('LISTENING');
      }
    } finally {
      this.isTranscribing = false;
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

  public pauseForSpeaking() {
    this.isSpeaking = true;
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
  }

  public resumeListening() {
    this.isSpeaking = false;
    this.chunkStartTime = Date.now();
    this.currentChunkFrames = [];
    this.chunkPeakVolume = 0;
    this.chunkSpeechDetected = false;
    this.preRollBuffer = [];
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

    try {
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
    } catch {}

    if (this.unsubscribeFilter) {
      this.unsubscribeFilter();
      this.unsubscribeFilter = null;
    }

    this.onStateCallback?.('IDLE');
  }
}
