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
    return '';
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;

  const prompt =
    'You are an intelligent AI audio filter for a fast-food ordering kiosk (ByteBurger Express).\n' +
    'TASK: Transcribe ONLY when the speaker in the foreground is DIRECTLY ORDERING FOOD or commanding the kiosk screen.\n' +
    'VALID KIOSK ORDERS:\n' +
    '- "Add one double cheese burger", "two peri peri fries", "make it a meal combo"\n' +
    '- "Coke zero and one mineral water", "extra cheese on burger"\n' +
    '- "Confirm my order", "checkout", "UPI QR code", "pay by card", "cancel order"\n' +
    '- "Show me burgers", "call staff", "how much is total"\n\n' +
    'CRITICAL REJECTION RULES:\n' +
    '1. If two or more people are talking to EACH OTHER about personal or non-restaurant topics (e.g., greetings, phone calls, laughter, casual discussion, asking where someone is, general chatting), reply with ONLY "SILENCE".\n' +
    '2. If the audio is background crowd chatter, distant speech, hesitation sounds ("umm", "err"), or not a direct food order command, reply with ONLY "SILENCE".\n' +
    '3. Never hallucinate food items from casual chatter.\n' +
    'Return ONLY the customer food order phrase in English/Hinglish, or "SILENCE".';

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
      const errText = await res.text();
      console.warn('Gemini audio transcription HTTP error:', res.status, errText);
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

        // Compute peak deviation using AnalyserNode time-domain data (100% reliable across Android hardware)
        if (this.analyser) {
          const timeData = new Uint8Array(this.analyser.fftSize);
          this.analyser.getByteTimeDomainData(timeData);

          let maxDev = 0;
          for (let i = 0; i < timeData.length; i++) {
            const dev = Math.abs(timeData[i] - 128);
            if (dev > maxDev) maxDev = dev;
          }

          const volPercent = Math.min(100, Math.round((maxDev / 128) * 100));
          this.onVolumeCallback?.(volPercent);

          // Noise Gate: Ignore background noise/chatter below user-set threshold
          const gate = this.filterConfig.noiseGateThreshold;
          const IS_SPEECH = volPercent >= gate;

          if (IS_SPEECH) {
            if (!this.speechDetected) {
              this.speechDetected = true;
              this.speechStartTime = Date.now();
              this.onInterimCallback?.('Listening to your order...');
              this.onLogCallback?.(`Speech detected (${volPercent}% >= ${gate}%) — recording order`);
            }

            if (this.silenceTimer) {
              clearTimeout(this.silenceTimer);
              this.silenceTimer = null;
            }

            this.pcmChunks.push(frame);

            // Hard ceiling: commit after 5 seconds of continuous speech
            if (Date.now() - this.speechStartTime > 5000) {
              this.commitUtterance();
            }
          } else if (this.speechDetected) {
            this.pcmChunks.push(frame);

            if (!this.silenceTimer) {
              // User-set silence timeout (default 400ms for ultra-fast response!)
              const silenceWaitMs = Math.max(250, this.filterConfig.silenceCutoffMs || 400);
              this.silenceTimer = setTimeout(() => {
                this.commitUtterance();
              }, silenceWaitMs);
            }
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
