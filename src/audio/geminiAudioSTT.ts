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
  if (!apiKey || !apiKey.startsWith('AIzaSy')) {
    console.warn('Valid Gemini API Key not configured:', apiKey);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('gemini_api_key_error', {
          detail: 'No valid Gemini API key configured. Please enter your key in Mic Tuning.',
        })
      );
    }
    return '';
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
  if (!apiKey || !apiKey.trim().startsWith('AIzaSy')) {
    return { ok: false, message: 'Invalid format. A valid Gemini API key starts with AIzaSy...' };
  }

  const cleanKey = apiKey.trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${cleanKey}`;

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
      return { ok: true, message: '✅ Success! Gemini AI connection verified and active.' };
    }

    const errJson = await res.json().catch(() => ({}));
    const msg = errJson?.error?.message || `HTTP ${res.status}`;
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

  private pcmChunks: Float32Array[] = [];
  private speechDetected = false;
  private silenceTimer: any = null;
  private speechStartTime = 0;
  private ambientNoiseFloor = 4.0;
  private monitorInterval: any = null;

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
        if (!this.isListening || this.isSpeaking || this.isTranscribing) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const frame = new Float32Array(inputData);

        // Compute true RMS energy of the frame (ignores single hall clicks/spoon drops)
        let sumSq = 0;
        for (let i = 0; i < inputData.length; i++) {
          sumSq += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSq / inputData.length);
        const volPercent = Math.min(100, Math.round(rms * 450));
        this.onVolumeCallback?.(volPercent);

        // Dynamically track ambient hall noise floor when not speaking
        if (!this.speechDetected) {
          this.ambientNoiseFloor = this.ambientNoiseFloor * 0.94 + volPercent * 0.06;
        }

        // Adaptive Noise Gate: must exceed user threshold AND must rise above the ambient hall noise!
        const gate = this.filterConfig.noiseGateThreshold;
        const effectiveGate = Math.max(gate, this.ambientNoiseFloor + 3.0);
        const IS_SPEECH = volPercent >= effectiveGate;

        if (IS_SPEECH) {
          if (!this.speechDetected) {
            this.speechDetected = true;
            this.speechStartTime = Date.now();
            this.onInterimCallback?.('Listening to your order...');
            this.onLogCallback?.(`Speech detected (${volPercent}% >= effective gate ${effectiveGate.toFixed(1)}%) — recording`);
          }

          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
          }

          this.pcmChunks.push(frame);

          // Hard ceiling: commit after 3 seconds of continuous speech (prevents recording endless hall noise)
          if (Date.now() - this.speechStartTime > 3000) {
            this.commitUtterance();
          }
        } else if (this.speechDetected) {
          this.pcmChunks.push(frame);

          if (!this.silenceTimer) {
            // User-set silence timeout (default 350ms - 400ms for rapid response)
            const silenceWaitMs = Math.max(250, this.filterConfig.silenceCutoffMs || 400);
            this.silenceTimer = setTimeout(() => {
              this.commitUtterance();
            }, silenceWaitMs);
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

  private async commitUtterance() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    if (!this.speechDetected || this.pcmChunks.length === 0 || this.isTranscribing) {
      this.pcmChunks = [];
      this.speechDetected = false;
      return;
    }

    this.isTranscribing = true;
    this.onStateCallback?.('THINKING');
    this.onInterimCallback?.('Understanding order with Gemini...');

    try {
      let totalLength = 0;
      for (const chunk of this.pcmChunks) {
        totalLength += chunk.length;
      }

      const merged = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of this.pcmChunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }

      // Reset chunks for next utterance immediately
      this.pcmChunks = [];
      this.speechDetected = false;

      const sampleRate = this.audioCtx?.sampleRate || 48000;
      const durationSec = (totalLength / sampleRate).toFixed(1);

      // Minimum 0.3s speech duration to filter out accidental clicks
      if (totalLength < sampleRate * 0.3) {
        this.isTranscribing = false;
        this.onInterimCallback?.('');
        if (this.isListening && !this.isSpeaking) {
          this.onStateCallback?.('LISTENING');
        }
        return;
      }

      this.onLogCallback?.(`Sending ${durationSec}s audio to Gemini 3.5...`);

      // Encode to standard 16kHz mono WAV base64
      const base64Wav = encodePcmToWavBase64(merged, sampleRate);

      // Transcribe via Gemini
      const text = await transcribeAudioWithGemini(base64Wav);

      if (text && this.isListening) {
        this.onLogCallback?.(`Gemini recognized: "${text}"`);
        this.onInterimCallback?.('');
        this.onTranscriptCallback?.(text);
      } else {
        this.onInterimCallback?.('');
        if (this.isListening && !this.isSpeaking) {
          this.onStateCallback?.('LISTENING');
        }
      }
    } catch (e: any) {
      this.onLogCallback?.(`Gemini recognition error: ${e?.message || e}`);
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
   * Explicitly opens recording for the customer right at the kiosk for 3.2 seconds.
   * Completely immune to ambient hall chatter!
   */
  public startTapToSpeak(durationMs = 3200) {
    if (this.isSpeaking || this.isTranscribing) return;
    this.isListening = true;
    this.speechDetected = true;
    this.speechStartTime = Date.now();
    this.pcmChunks = [];
    this.onInterimCallback?.('Listening to your order... Speak now!');
    this.onStateCallback?.('LISTENING');

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    setTimeout(() => {
      if (this.speechDetected && !this.isTranscribing && this.pcmChunks.length > 0) {
        this.commitUtterance();
      }
    }, durationMs);
  }

  public pauseForSpeaking() {
    this.isSpeaking = true;
    this.speechDetected = false;
    this.pcmChunks = [];
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  public resumeListening() {
    this.isSpeaking = false;
    this.speechDetected = false;
    this.pcmChunks = [];
    if (this.isListening && !this.isTranscribing) {
      this.onStateCallback?.('LISTENING');
    }
  }

  public stop() {
    this.isListening = false;
    this.isSpeaking = false;
    this.isTranscribing = false;
    this.speechDetected = false;
    this.pcmChunks = [];

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
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
