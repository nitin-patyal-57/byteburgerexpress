import { normalizeQSRSpokenUtterance } from '../core/acousticNormalizer';
import { getBackendBaseUrl } from '../config';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition as CapSpeechRecognition } from '@capacitor-community/speech-recognition';
import { TextToSpeech as CapTextToSpeech } from '@capacitor-community/text-to-speech';
import { GeminiCloudAudioRecognizer } from './geminiAudioSTT';

export interface AudioVisualizerData {
  volume: number; // 0 to 100
  frequencyData: number[];
}

export interface FemaleVoicePersona {
  id: string;
  name: string;
  description: string;
  defaultPitch: number;
  defaultRate: number;
  accent: 'Indian English' | 'Hinglish' | 'Global English';
}

export const FEMALE_PERSONAS: FemaleVoicePersona[] = [
  {
    id: 'ananya',
    name: 'Ananya (Warm Host)',
    description: 'Warm, natural Indian English host with friendly conversational cadence',
    defaultPitch: 1.18,
    defaultRate: 0.96,
    accent: 'Indian English',
  },
  {
    id: 'priya',
    name: 'Priya (Hinglish Specialist)',
    description: 'Bilingual Hindi/English tone optimized for code-switching and desi menu items',
    defaultPitch: 1.24,
    defaultRate: 0.95,
    accent: 'Hinglish',
  },
  {
    id: 'meera',
    name: 'Meera (Soft & Friendly)',
    description: 'Gentle, clear hospitality assistant with melodious tone',
    defaultPitch: 1.22,
    defaultRate: 0.94,
    accent: 'Indian English',
  },
  {
    id: 'jenny',
    name: 'Jenny (Studio Natural)',
    description: 'High-clarity neural studio female voice with crisp articulation',
    defaultPitch: 1.08,
    defaultRate: 0.98,
    accent: 'Global English',
  },
];

export interface VoiceRCALogEntry {
  timestamp: string;
  type:
    | 'MIC_START'
    | 'MIC_STOP'
    | 'RECOGNITION_START'
    | 'RECOGNITION_RESULT'
    | 'RECOGNITION_ONEND'
    | 'RECOGNITION_ERROR'
    | 'RECOGNITION_RESTART'
    | 'BARGE_IN'
    | 'AUDIO_CTX_RESUME'
    | 'WATCHDOG_INTERIM_FLUSH'
    | 'WATCHDOG_REVIVAL';
  message: string;
  data?: any;
}

export interface VoiceRCAStatus {
  isListening: boolean;
  isSpeaking: boolean;
  recognitionState: 'ACTIVE' | 'STOPPED' | 'STARTING' | 'ERROR' | 'UNSUPPORTED';
  restartsCount: number;
  lastError: string | null;
  lastErrorCode: string | null;
  lastErrorTime: string | null;
  audioContextState: string;
  micTrackState: {
    enabled: boolean;
    muted: boolean;
    readyState: string;
  } | null;
  lastTranscript: string | null;
  lastTranscriptTime: string | null;
}

/**
 * Detects Android / mobile browser environments where Web Speech API requires:
 * 1. Exclusive hardware microphone access (no simultaneous getUserMedia stream lock)
 * 2. Single-utterance burst mode (continuous = false with instant onend auto-restart)
 * 3. Cumulative result segment deduplication
 */
export function isAndroidOrMobileDevice(userAgent?: string): boolean {
  const ua =
    userAgent !== undefined
      ? userAgent
      : typeof navigator !== 'undefined'
      ? navigator.userAgent || ''
      : '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
}

/**
 * Fixes Android Chrome's cumulative SpeechRecognitionResultList bug where
 * results[0]="order", results[1]="order belgian", results[2]="order belgian shake"
 * would otherwise concatenate into "orderorder belgianorder belgian shake".
 */
export function deduplicateAndroidTranscript(segments: string[]): string {
  const cleaned = segments.map(s => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return '';

  let acc = cleaned[0];
  for (let i = 1; i < cleaned.length; i++) {
    const curr = cleaned[i];
    const accLower = acc.toLowerCase();
    const currLower = curr.toLowerCase();

    if (currLower === accLower) {
      // Exact duplicate segment
      continue;
    } else if (currLower.startsWith(accLower)) {
      // Cumulative expansion (Android Chrome behavior): replace with longer phrase
      acc = curr;
    } else if (accLower.endsWith(currLower)) {
      // Trailing duplicate
      continue;
    } else {
      acc = `${acc} ${curr}`;
    }
  }

  // Also collapse immediate repeated words/phrases e.g. "coke coke" -> "coke" unless intentional numbers
  return acc.replace(/\b(\w+(?:\s+\w+)?)\s+\1\b/gi, '$1').trim();
}

export class AudioManager {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private recognition: any = null;
  private isListening = false;
  private isSpeaking = false;
  private currentAudioElement: HTMLAudioElement | null = null;
  private onTranscriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onBargeInCallback: (() => void) | null = null;
  private onStateChangeCallback: ((state: 'IDLE' | 'LISTENING' | 'SPEAKING') => void) | null = null;

  // Selected female voice cache
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private voicesLoadedPromise: Promise<SpeechSynthesisVoice[]> | null = null;
  private activeUtterance: SpeechSynthesisUtterance | null = null;
  private speechWatchdogTimer: any = null;

  // RCA & Self-Healing Watchdogs
  private geminiRecognizer: GeminiCloudAudioRecognizer | null = null;
  private isNativeAvailable: boolean = false;
  private lastVolume: number = 0;
  private recognitionRestartTimer: any = null;
  private interimInactivityTimer: any = null;
  private watchdogInterval: any = null;
  private isNativeRunning = false;
  private pendingInterimText = '';
  private lastCommittedText = '';
  private lastCommittedAtMs = 0;
  public isAndroidMobile: boolean = isAndroidOrMobileDevice();
  public rcaLogs: VoiceRCALogEntry[] = [];
  public recognitionState: 'ACTIVE' | 'STOPPED' | 'STARTING' | 'ERROR' | 'UNSUPPORTED' = 'STOPPED';
  public lastErrorCode: string | null = null;
  public lastErrorMessage: string | null = null;
  public lastErrorTime: string | null = null;
  public restartsCount = 0;
  public lastTranscript: string | null = null;
  public lastTranscriptTime: string | null = null;

  // Active Persona
  public activePersonaId = 'ananya';
  public userPitchMultiplier = 1.0;
  public userRateMultiplier = 1.0;

  // Acoustic settings
  public aecEnabled = true;
  public nsEnabled = true;
  public agcEnabled = true;
  public playGreetingChime = true;

  constructor() {
    this.initVoiceCache();
    this.initRecognition();
    this.attachGlobalRCADiagnostic();
  }

  public logRCA(type: VoiceRCALogEntry['type'], message: string, data?: any) {
    const entry: VoiceRCALogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      data,
    };
    this.rcaLogs.unshift(entry);
    if (this.rcaLogs.length > 60) {
      this.rcaLogs.pop();
    }
    if (type === 'RECOGNITION_ERROR') {
      console.warn(`[VOICE-RCA] ⚠️ ${type}: ${message}`, data || '');
    } else {
      console.log(`[VOICE-RCA] ℹ️ ${type}: ${message}`, data || '');
    }
  }

  public getRCAStatus(): VoiceRCAStatus {
    const track = this.micStream?.getAudioTracks()?.[0];
    return {
      isListening: this.isListening,
      isSpeaking: this.isSpeaking,
      recognitionState: this.recognitionState,
      restartsCount: this.restartsCount,
      lastError: this.lastErrorMessage,
      lastErrorCode: this.lastErrorCode,
      lastErrorTime: this.lastErrorTime,
      audioContextState: this.audioCtx ? this.audioCtx.state : 'none',
      micTrackState: track
        ? {
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState,
          }
        : this.isAndroidMobile && this.isListening
        ? {
            enabled: true,
            muted: false,
            readyState: 'live (Android Native Speech HAL)',
          }
        : null,
      lastTranscript: this.lastTranscript,
      lastTranscriptTime: this.lastTranscriptTime,
    };
  }

  private attachGlobalRCADiagnostic() {
    if (typeof window !== 'undefined') {
      (window as any).__VOICE_RCA__ = {
        getStatus: () => this.getRCAStatus(),
        getLogs: () => [...this.rcaLogs],
        diagnose: () => {
          const s = this.getRCAStatus();
          console.table({
            'Device Mode': this.isAndroidMobile ? 'Android / Mobile (Exclusive HAL)' : 'Desktop Kiosk',
            'Listening Mode Active': s.isListening ? 'YES ✅' : 'NO ❌',
            'Recognition Engine': s.recognitionState,
            'Auto-Restarts Count': s.restartsCount,
            'AudioContext State': s.audioContextState,
            'Microphone Track': s.micTrackState
              ? `${s.micTrackState.readyState} (muted: ${s.micTrackState.muted})`
              : 'NONE',
            'Last Error Code': s.lastErrorCode || 'None (Healthy)',
            'Last Error Time': s.lastErrorTime || 'N/A',
            'Last Explanation': s.lastError || 'All systems normal',
            'Last Spoken Transcript': s.lastTranscript || 'None yet',
          });
          console.log('--- RECENT VOICE LIFECYCLE EVENTS ---');
          console.table(this.rcaLogs.slice(0, 10));
          return s;
        },
        forceRestart: () => {
          this.scheduleRecognitionRestart('manual_console_trigger', 50);
          return 'Forced speech recognition restart initiated.';
        },
      };
    }
  }

  private initVoiceCache(): Promise<SpeechSynthesisVoice[]> {
    if (this.voicesLoadedPromise) return this.voicesLoadedPromise;

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.cachedVoices = [];
      return Promise.resolve([]);
    }

    this.voicesLoadedPromise = new Promise(resolve => {
      const existing = window.speechSynthesis.getVoices();
      if (existing && existing.length > 0) {
        this.cachedVoices = existing;
        resolve(existing);
        return;
      }

      // In Chromium browsers, voices load asynchronously
      const onVoicesChanged = () => {
        const v = window.speechSynthesis.getVoices();
        if (v && v.length > 0) {
          this.cachedVoices = v;
          window.speechSynthesis.onvoiceschanged = null;
          resolve(v);
        }
      };

      window.speechSynthesis.onvoiceschanged = onVoicesChanged;

      // Timeout fallback if event never fires
      setTimeout(() => {
        const v = window.speechSynthesis.getVoices();
        this.cachedVoices = v || [];
        resolve(this.cachedVoices);
      }, 500);
    });

    return this.voicesLoadedPromise;
  }

  private commitFinalTranscript(rawText: string, source: string) {
    const correctedText = normalizeQSRSpokenUtterance(rawText.trim());
    if (!correctedText) return;

    // Prevent duplicate double-fire within 1200ms (common on Android when both onresult and onend fire)
    const now = Date.now();
    if (
      correctedText.toLowerCase() === this.lastCommittedText.toLowerCase() &&
      now - this.lastCommittedAtMs < 1200
    ) {
      return;
    }

    this.lastCommittedText = correctedText;
    this.lastCommittedAtMs = now;
    this.pendingInterimText = '';

    if (this.interimInactivityTimer) {
      clearTimeout(this.interimInactivityTimer);
      this.interimInactivityTimer = null;
    }

    this.lastTranscript = correctedText;
    this.lastTranscriptTime = new Date().toLocaleTimeString();
    this.logRCA('RECOGNITION_RESULT', `Final transcript (${source}): "${correctedText}"`);

    if (this.onTranscriptCallback) {
      this.onTranscriptCallback(correctedText, true);
    }
  }

  private initRecognition() {
    if (typeof window === 'undefined') return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      this.recognitionState = 'UNSUPPORTED';
      this.lastErrorMessage = 'Web Speech API is not supported in this browser environment.';
      this.logRCA('RECOGNITION_ERROR', this.lastErrorMessage);
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      // CRITICAL ANDROID FIX: continuous=true on Android Chrome causes cumulative word duplication and hangs.
      // Use single-utterance burst mode on Android with automatic seamless restart in onend.
      this.recognition.continuous = !this.isAndroidMobile;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;
      this.recognition.lang = 'en-IN'; // Indian English / Hinglish default

      this.recognition.onstart = () => {
        this.recognitionState = 'ACTIVE';
      };

      this.recognition.onresult = (event: any) => {
        // On Android mobile, ignore microphone pickup while assistant TTS is actively playing out of phone speaker
        if (this.isAndroidMobile && this.isSpeaking) {
          return;
        }

        const finalSegments: string[] = [];
        const interimSegments: string[] = [];

        const startIdx = this.isAndroidMobile ? 0 : event.resultIndex || 0;
        for (let i = startIdx; i < event.results.length; ++i) {
          const transcriptPiece = event.results[i]?.[0]?.transcript || '';
          if (event.results[i].isFinal) {
            finalSegments.push(transcriptPiece);
          } else {
            interimSegments.push(transcriptPiece);
          }
        }

        const finalTranscript = deduplicateAndroidTranscript(finalSegments);
        const interimTranscript = deduplicateAndroidTranscript(interimSegments);

        // Sub-40ms BARGE-IN (Desktop with headset/AEC): If customer speaks while assistant is speaking, halt immediately
        if (!this.isAndroidMobile && (interimTranscript || finalTranscript) && this.isSpeaking) {
          this.flushImmediate();
          this.logRCA('BARGE_IN', 'Customer barge-in detected; flushed assistant speech buffer');
          if (this.onBargeInCallback) {
            this.onBargeInCallback();
          }
        }

        if (finalTranscript) {
          this.commitFinalTranscript(finalTranscript, 'onresult_final');
        } else if (interimTranscript) {
          this.pendingInterimText = interimTranscript;
          const correctedText = normalizeQSRSpokenUtterance(this.pendingInterimText);

          if (this.onTranscriptCallback) {
            this.onTranscriptCallback(correctedText, false);
          }

          // Resilient interim watchdog: If browser delays isFinal by >1.5s of silence, auto-commit
          if (this.interimInactivityTimer) {
            clearTimeout(this.interimInactivityTimer);
          }
          this.interimInactivityTimer = setTimeout(() => {
            if (
              this.pendingInterimText &&
              this.onTranscriptCallback &&
              this.isListening &&
              !this.isSpeaking
            ) {
              this.commitFinalTranscript(this.pendingInterimText, 'watchdog_1.5s');
            }
          }, 1500);
        }
      };

      this.recognition.onerror = (event: any) => {
        const error = event?.error || 'unknown';
        this.lastErrorCode = error;
        this.lastErrorTime = new Date().toLocaleTimeString();

        let explanation = `Speech error '${error}'`;
        if (error === 'no-speech') {
          explanation =
            'No speech detected during silence interval. Browser disconnected socket (auto-healing restart active).';
        } else if (error === 'network') {
          explanation = 'Network error communicating with speech recognition cloud server.';
        } else if (error === 'audio-capture') {
          explanation =
            'Microphone busy or locked by another stream. Releasing competing audio stream for exclusive SpeechRecognition access.';
          // If a competing getUserMedia stream is open, stop it immediately so SpeechRecognition can claim the mic
          if (this.micStream) {
            this.micStream.getTracks().forEach(t => t.stop());
            this.micStream = null;
          }
        } else if (error === 'not-allowed') {
          explanation = 'Microphone access denied or blocked by browser permission policy.';
          this.recognitionState = 'ERROR';
          this.isListening = false;
        } else if (error === 'aborted') {
          explanation = 'Recognition was aborted by browser or external audio switch.';
        }

        this.lastErrorMessage = explanation;
        this.logRCA('RECOGNITION_ERROR', explanation, { errorCode: error });

        if (error === 'no-speech' || error === 'aborted' || error === 'audio-capture') {
          if (this.isListening && !this.isSpeaking) {
            this.scheduleRecognitionRestart(`error_${error}`, this.isAndroidMobile ? 250 : 150);
          }
        } else if (error === 'network') {
          if (this.isListening && !this.isSpeaking) {
            this.scheduleRecognitionRestart('error_network', 800);
          }
        }
      };

      this.recognition.onend = () => {
        this.logRCA(
          'RECOGNITION_ONEND',
          'Speech recognition cycle ended (silence timeout or utterance complete)'
        );

        // If customer spoke interim words right before connection ended, commit them!
        if (
          this.pendingInterimText &&
          this.onTranscriptCallback &&
          this.isListening &&
          !this.isSpeaking
        ) {
          this.commitFinalTranscript(this.pendingInterimText, 'onend_flush');
        }

        if (this.isListening && !this.isSpeaking) {
          this.scheduleRecognitionRestart(
            'browser_silence_onend',
            this.isAndroidMobile ? 220 : 150
          );
        } else {
          this.recognitionState = 'STOPPED';
        }
      };
    } catch (e: any) {
      this.recognitionState = 'ERROR';
      this.lastErrorMessage = `Initialization failed: ${e?.message || e}`;
      this.logRCA('RECOGNITION_ERROR', this.lastErrorMessage);
    }
  }

  private async runNativeRecognitionLoop() {
    if (!this.isListening || this.isSpeaking || this.isNativeRunning) return;
    this.isNativeRunning = true;
    let consecutiveErrors = 0;

    while (this.isListening && !this.isSpeaking) {
      try {
        this.recognitionState = 'ACTIVE';
        if (this.onStateChangeCallback) {
          this.onStateChangeCallback('LISTENING');
        }

        this.logRCA('RECOGNITION_START', 'Starting native speech recognition listening session');

        const res: any = await CapSpeechRecognition.start({
          language: 'en-IN',
          maxResults: 1,
          prompt: '',
          partialResults: false,
          popup: false,
        });

        consecutiveErrors = 0;
        const matches: string[] = res?.matches || [];
        const spokenText = matches.length > 0 ? matches[0].trim() : '';

        if (spokenText && this.isListening && !this.isSpeaking) {
          this.logRCA('RECOGNITION_RESULT', `Native speech recognized: "${spokenText}"`);
          if (this.onTranscriptCallback) {
            this.onTranscriptCallback(spokenText, false);
          }
          this.commitFinalTranscript(spokenText, 'native_speech_result');
          // Order committed and sent to assistant TTS; break so assistant can speak cleanly
          break;
        }
      } catch (err: any) {
        consecutiveErrors++;
        const errMsg = String(err?.message || err || '');
        this.logRCA('RECOGNITION_ERROR', `Native recognition cycle ended: ${errMsg} (error #${consecutiveErrors})`);

        // If native recognition repeatedly fails (e.g. Android Speech Recognition Service busy or crashed), fallback to Gemini Cloud STT!
        if (consecutiveErrors >= 3 && !this.geminiRecognizer) {
          this.logRCA('RECOGNITION_ERROR', 'Native recognition failed 3 times. Falling back to Gemini Cloud Audio Recognizer!');
          this.isNativeAvailable = false;
          this.isNativeRunning = false;
          await this.startGeminiCloudRecognizer();
          return;
        }

        // Backoff delay before restarting listening session (350ms, 700ms, etc.)
        const backoffMs = Math.min(1500, 350 * consecutiveErrors);
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }

    this.isNativeRunning = false;
  }

  /**
   * Resilient self-healing restart with debounce and retry protection.
   * Keeps speech recognition continuously looping on both Android native and Web.
   */
  public scheduleRecognitionRestart(reason: string, delayMs = 150) {
    if (!this.isListening) return;

    if (this.recognitionRestartTimer) {
      clearTimeout(this.recognitionRestartTimer);
    }

    this.recognitionState = 'STARTING';

    // 1. Native Android Capacitor loop
    if (Capacitor.isNativePlatform()) {
      this.recognitionRestartTimer = setTimeout(() => {
        if (!this.isListening || this.isSpeaking) return;
        this.restartsCount++;
        this.logRCA('RECOGNITION_RESTART', `Capacitor loop restart #${this.restartsCount} (${reason})`);
        this.runNativeRecognitionLoop();
      }, delayMs);
      return;
    }

    // 2. Web Speech API browser loop
    this.recognitionRestartTimer = setTimeout(() => {
      if (!this.isListening || (this.isAndroidMobile && this.isSpeaking)) return;
      this.restartsCount++;
      this.logRCA(
        'RECOGNITION_RESTART',
        `Self-healing restart attempt #${this.restartsCount} (trigger: ${reason})`
      );

      try {
        if (!this.recognition) {
          this.initRecognition();
        }
        this.recognition.start();
        this.recognitionState = 'ACTIVE';
      } catch (err: any) {
        const isStateError =
          err?.name === 'InvalidStateError' ||
          String(err?.message || '').includes('already started');
        if (isStateError) {
          this.recognitionState = 'ACTIVE';
          return;
        }
        this.logRCA(
          'RECOGNITION_ERROR',
          `Recognition start retry notice: ${err?.message || err}. Backoff retry scheduled.`,
          { isStateError }
        );

        this.recognitionRestartTimer = setTimeout(() => {
          if (this.isListening && !(this.isAndroidMobile && this.isSpeaking)) {
            try {
              this.recognition?.start();
              this.recognitionState = 'ACTIVE';
            } catch {
              // subsequent watchdog will recover if needed
            }
          }
        }, 450);
      }
    }, delayMs);
  }

  public resumeListening(delayMs = 0) {
    this.isSpeaking = false;
    this.isListening = true;

    if (this.recognitionRestartTimer) {
      clearTimeout(this.recognitionRestartTimer);
      this.recognitionRestartTimer = null;
    }

    const trigger = () => {
      if (!this.isListening || this.isSpeaking) return;

      if (this.onStateChangeCallback) {
        this.onStateChangeCallback('LISTENING');
      }

      if (this.geminiRecognizer) {
        this.geminiRecognizer.resumeListening();
        return;
      }

      if (Capacitor.isNativePlatform() && this.isNativeAvailable) {
        this.runNativeRecognitionLoop();
      } else {
        this.scheduleRecognitionRestart('resume_listening_requested', 0);
      }
    };

    if (delayMs > 0) {
      this.recognitionRestartTimer = setTimeout(trigger, delayMs);
    } else {
      trigger();
    }
  }

  /**
   * Tap-to-Speak trigger:
   * Explicitly activates mic for 5.0 seconds for direct customer speech with clear countdown and break.
   * Completely bypasses hall noise.
   */
  public async tapToSpeak(durationMs = 5000, onCountdown?: (seconds: number | null) => void) {
    if (!this.geminiRecognizer) {
      await this.startGeminiCloudRecognizer();
    }
    if (this.geminiRecognizer) {
      this.geminiRecognizer.startTapToSpeak(durationMs, onCountdown);
    }
  }

  public async startGeminiCloudRecognizer(): Promise<boolean> {
    try {
      this.isListening = true;
      this.recognitionState = 'ACTIVE';
      if (!this.geminiRecognizer) {
        this.geminiRecognizer = new GeminiCloudAudioRecognizer(
          (text: string) => {
            if (text && this.isListening && !this.isSpeaking) {
              this.logRCA('RECOGNITION_RESULT', `Gemini transcribed: "${text}"`);
              this.commitFinalTranscript(text, 'gemini_cloud_audio');
            }
          },
          (interim: string) => {
            if (this.onTranscriptCallback && !this.isSpeaking) {
              this.onTranscriptCallback(interim, false);
            }
          },
          (vol: number) => {
            this.lastVolume = vol;
          },
          (state: 'LISTENING' | 'THINKING' | 'IDLE') => {
            if (this.onStateChangeCallback && !this.isSpeaking) {
              this.onStateChangeCallback(state === 'IDLE' ? 'IDLE' : 'LISTENING');
            }
          },
          (msg: string) => {
            this.logRCA('RECOGNITION_RESULT', msg);
          }
        );
      }

      const success = await this.geminiRecognizer.start();
      if (success) {
        if (this.onStateChangeCallback) {
          this.onStateChangeCallback('LISTENING');
        }
        this.logRCA('MIC_START', 'Gemini Cloud Audio Recognizer ready — Speak to order!');
        return true;
      }
    } catch (geminiErr: any) {
      this.logRCA('RECOGNITION_ERROR', `Gemini Audio start error: ${geminiErr?.message || geminiErr}`);
    }
    return false;
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  public async startMicrophone(
    onTranscript: (text: string, isFinal: boolean) => void,
    onBargeIn: () => void,
    onStateChange: (state: 'IDLE' | 'LISTENING' | 'SPEAKING') => void
  ): Promise<boolean> {
    this.onTranscriptCallback = onTranscript;
    this.onBargeInCallback = onBargeIn;
    this.onStateChangeCallback = onStateChange;

    this.logRCA(
      'MIC_START',
      `Initiating microphone (${this.isAndroidMobile ? 'Android Exclusive Speech Mode' : 'Desktop Full-Duplex Mode'})`
    );

    try {
      // 1. Primary: Gemini Cloud Audio Recognizer (Near-Field Acoustic Biquad Filtering + RMS Noise Gate + 5-Second Periodic Slicing)
      const geminiSuccess = await this.startGeminiCloudRecognizer();
      if (geminiSuccess) {
        // Also run Web Speech API in parallel as immediate local fallback if supported
        if (typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) {
          if (!this.recognition) {
            this.initRecognition();
          }
          if (this.recognition) {
            try {
              this.recognition.start();
            } catch {
              // already running or transitioning
            }
          }
        }
        return true;
      }

      // 2. Native Capacitor fallback if Gemini recognizer could not start
      if (Capacitor.isNativePlatform()) {
        try {
          const avail = await CapSpeechRecognition.available();
          if (avail && avail.available) {
            this.isNativeAvailable = true;
            this.isListening = true;
            this.recognitionState = 'ACTIVE';
            this.onStateChangeCallback('LISTENING');
            this.logRCA('MIC_START', 'Native Capacitor Speech Recognition active and listening');

            // Launch continuous native recognition loop!
            this.runNativeRecognitionLoop();
            return true;
          }
        } catch {
          this.isNativeAvailable = false;
        }
      }

      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
        this.logRCA('AUDIO_CTX_RESUME', 'AudioContext successfully resumed');
      }

      // Unlock speechSynthesis on user gesture (critical for Android Chrome & iOS Safari)
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.getVoices();
        } catch {
          // ignore
        }
      }

      // CRITICAL ANDROID FIX:
      // On Android OS, holding a getUserMedia MediaStream open at the same time as SpeechRecognition
      // causes SpeechRecognition to fail with "audio-capture" or "aborted".
      // Only open a persistent getUserMedia analyser stream on Desktop!
      if (!this.isAndroidMobile && navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: this.aecEnabled,
            noiseSuppression: this.nsEnabled,
            autoGainControl: this.agcEnabled,
            sampleRate: 16000,
            channelCount: 1,
          },
        });

        this.micStream = stream;
        if (this.audioCtx) {
          const source = this.audioCtx.createMediaStreamSource(stream);
          this.analyser = this.audioCtx.createAnalyser();
          this.analyser.fftSize = 64;
          source.connect(this.analyser);
        }
      }

      this.isListening = true;
      this.recognitionState = 'ACTIVE';

      if (!this.recognition) {
        this.initRecognition();
      }

      if (this.recognition) {
        try {
          this.recognition.start();
        } catch {
          // already started or transitioning
        }
      }

      this.onStateChangeCallback('LISTENING');

      // Setup periodic health watchdog (checks every 2.5 seconds)
      if (this.watchdogInterval) clearInterval(this.watchdogInterval);
      this.watchdogInterval = setInterval(async () => {
        if (!this.isListening) return;

        // 1. Check AudioContext suspension
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.logRCA('AUDIO_CTX_RESUME', 'Watchdog resumed suspended AudioContext');
          try {
            await this.audioCtx.resume();
          } catch {
            // ignore
          }
        }

        // 2. Check for silent engine death
        if (
          this.recognition &&
          this.recognitionState === 'STOPPED' &&
          this.isListening &&
          !this.isSpeaking
        ) {
          this.logRCA(
            'WATCHDOG_REVIVAL',
            'Watchdog detected stopped recognition while listening; reviving'
          );
          this.scheduleRecognitionRestart('watchdog_periodic_revival', 150);
        }
      }, 2500);

      return true;
    } catch (err: any) {
      // Even if getUserMedia fails, still start SpeechRecognition!
      this.isListening = true;
      this.lastErrorMessage = `Mic stream notice: ${err?.message || err}`;
      this.logRCA('RECOGNITION_ERROR', this.lastErrorMessage);
      if (this.recognition) {
        try {
          this.recognition.start();
          this.recognitionState = 'ACTIVE';
        } catch {
          // ignore
        }
      }
      this.onStateChangeCallback('LISTENING');
      return true;
    }
  }

  public stopMicrophone() {
    this.isListening = false;
    this.recognitionState = 'STOPPED';
    this.logRCA('MIC_STOP', 'Microphone and speech recognition stopped by user/system');

    this.geminiRecognizer?.stop();
    this.geminiRecognizer = null;

    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
    }
    if (this.recognitionRestartTimer) {
      clearTimeout(this.recognitionRestartTimer);
      this.recognitionRestartTimer = null;
    }
    if (this.interimInactivityTimer) {
      clearTimeout(this.interimInactivityTimer);
      this.interimInactivityTimer = null;
    }

    if (Capacitor.isNativePlatform()) {
      try {
        CapSpeechRecognition.stop();
      } catch {
        // ignore
      }
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
    this.analyser = null;
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('IDLE');
    }
  }

  public getVisualizerData(): AudioVisualizerData {
    if (this.lastVolume > 0 && this.isListening) {
      const v = this.lastVolume;
      return {
        volume: v,
        frequencyData: [v, v * 0.9, v * 1.2, v * 0.7, v * 1.1, v * 0.8, v * 1.0, v * 0.6].map(x => Math.min(100, Math.round(x))),
      };
    }

    if (!this.analyser) {
      // On Android mobile (where SpeechRecognition holds exclusive mic access), provide reactive activity pulse
      if (this.isListening && !this.isSpeaking) {
        const t = Date.now() / 160;
        const base = 24 + Math.round(Math.sin(t) * 14 + Math.cos(t * 1.7) * 10);
        return {
          volume: Math.max(10, Math.min(85, base)),
          frequencyData: [base, base + 12, base + 20, base - 5, base + 15, base, base - 8, base + 5],
        };
      }
      return { volume: 0, frequencyData: [0, 0, 0, 0, 0, 0, 0, 0] };
    }

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const volume = Math.min(100, Math.round((sum / dataArray.length) * 1.5));
    const frequencyData = Array.from(dataArray.slice(0, 8)).map(v => Math.round((v / 255) * 100));

    return { volume, frequencyData };
  }

  /**
   * Barge-in immediate flush: clears queued speech buffers and halts playback in < 40ms
   */
  public flushImmediate() {
    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.currentTime = 0;
        this.currentAudioElement.src = '';
      } catch {
        // ignore
      }
      this.currentAudioElement = null;
    }

    if (this.speechWatchdogTimer) {
      clearTimeout(this.speechWatchdogTimer);
      this.speechWatchdogTimer = null;
    }
    this.activeUtterance = null;

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }

    this.isSpeaking = false;
    if (this.onStateChangeCallback && this.isListening) {
      this.onStateChangeCallback('LISTENING');
    }
    if (this.isAndroidMobile && this.isListening) {
      this.scheduleRecognitionRestart('barge_in_resume', 180);
    }
  }

  /**
   * Plays a warm, subtle hospitality chime (C5 & E5 harmonic bell)
   * that primes human auditory attention before the female voice speaks.
   */
  public playSubtleHospitalityChime() {
    if (!this.playGreetingChime) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const now = ctx.currentTime;
      // Tone 1: 523.25 Hz (C5)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      gain1.gain.setValueAtTime(0.04, now);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Tone 2: 659.25 Hz (E5)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.08);
      gain2.gain.setValueAtTime(0.05, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.45);
    } catch {
      // AudioContext unavailable or blocked by autoplay
    }
  }

  /**
   * Scores and returns the highest-fidelity, most natural female voice available.
   * Completely excludes robotic male voices and eSpeak.
   */
  public async getBestFemaleVoice(text: string): Promise<SpeechSynthesisVoice | null> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

    let voices = this.cachedVoices;
    if (!voices || voices.length === 0) {
      voices = await this.initVoiceCache();
    }
    if (!voices || voices.length === 0) return null;

    const isHindiText = /[\u0900-\u097F]/.test(text);

    // Strict male keyword list to exclude robotic male voices
    const MALE_KEYWORDS = [
      'male', 'man', 'boy', 'david', 'mark', 'george', 'james', 'richard',
      'guy', 'stefan', 'ravi', 'prabhat', 'hemant', 'alex', 'fred',
      'daniel', 'oliver', 'espeak', 'kalpen', 'brian', 'tom', 'russell'
    ];

    const scoreVoice = (v: SpeechSynthesisVoice): number => {
      const name = v.name.toLowerCase();
      const lang = v.lang.toLowerCase();

      // Disqualify any explicitly male or eSpeak voices
      for (const m of MALE_KEYWORDS) {
        if (name.includes(m)) return -1000;
      }

      let score = 0;

      // Premium Neural / Natural / Studio indicator (+120)
      if (name.includes('natural') || name.includes('neural') || name.includes('online') || name.includes('enhanced') || name.includes('premium') || name.includes('network')) {
        score += 120;
      }

      // Hindi context matching
      if (isHindiText && (lang.startsWith('hi') || lang.includes('in'))) {
        score += 200;
        if (name.includes('swara') || name.includes('kalpana') || name.includes('kavya') || name.includes('google हिन्दी')) {
          score += 150;
        }
      }

      // Top Indian Female Voices (+150)
      const indianFemaleKeywords = ['heera', 'swara', 'priya', 'neerja', 'kavya', 'veena', 'sunita', 'kalpana', 'ananya', 'en-in-x-end', 'en-in-x-ena', 'hi-in-x-hia', 'hi-in-x-hid'];
      for (const k of indianFemaleKeywords) {
        if (name.includes(k)) score += 180;
      }

      // Indian English locale preference for ByteBurger Indian QSR (+90)
      if (lang === 'en-in' || lang === 'en_in') {
        score += 90;
      }

      // Highly acclaimed human female voices across Windows, Mac, Android, Chrome (+110)
      const topFemaleVoices = [
        'jenny', 'aria', 'ava', 'sonia', 'emma', 'samantha',
        'victoria', 'serena', 'karen', 'moira', 'tessa', 'zira',
        'google uk english female', 'google us english female'
      ];
      for (const f of topFemaleVoices) {
        if (name.includes(f)) score += 110;
      }

      // Explicit female designation in voice name (+70)
      if (name.includes('female') || name.includes('woman')) {
        score += 70;
      }

      // English language compatibility (+40)
      if (lang.startsWith('en')) {
        score += 40;
      }

      return score;
    };

    const scored = voices
      .map(v => ({ voice: v, score: scoreVoice(v) }))
      .filter(item => item.score > -500)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0 && scored[0].score > 0) {
      return scored[0].voice;
    }

    // Fallback: any voice that doesn't match male keywords
    const nonMale = voices.find(v => {
      const n = v.name.toLowerCase();
      return !MALE_KEYWORDS.some(m => n.includes(m));
    });

    return nonMale || voices[0] || null;
  }

  /**
   * Speaks the response with a female human voice.
   * Primary: Native Capacitor TTS on Android for zero-latency local speech.
   * Cloud Fallback: Gemini 3.8 Flash Lite TTS ('Kore' female voice) if configured.
   * Browser Fallback: Tuned human female browser speech synthesizer with warm pitch and natural prosody.
   */
  public async speak(text: string, onEnd?: () => void) {
    if (!text) {
      onEnd?.();
      return;
    }

    this.flushImmediate();
    this.isSpeaking = true;

    // Immediately pause microphone during speech so the kiosk speaker is not heard
    this.geminiRecognizer?.pauseForSpeaking();
    if (Capacitor.isNativePlatform()) {
      try {
        CapSpeechRecognition.stop().catch(() => {});
      } catch {}
    } else if (this.isAndroidMobile && this.recognition) {
      try {
        this.recognition.stop();
      } catch {}
    }

    if (this.onStateChangeCallback) {
      this.onStateChangeCallback('SPEAKING');
    }

    // Play subtle friendly welcome chime to prime human acoustic presence
    this.playSubtleHospitalityChime();

    let finished = false;
    const finishSpeech = () => {
      if (finished) return;
      finished = true;
      this.isSpeaking = false;
      this.currentAudioElement = null;

      onEnd?.();

      if (this.isListening) {
        // Exactly 1 second delay after assistant speech finishes before mic automatically turns on again to hear next item!
        setTimeout(() => {
          if (this.isListening && !this.isSpeaking) {
            this.resumeListening(0);
          }
        }, 1000);
      } else {
        if (this.onStateChangeCallback) {
          this.onStateChangeCallback('IDLE');
        }
      }
    };

    // Attempt 1: Native Capacitor TTS on Android (instant, offline, zero-latency)
    if (Capacitor.isNativePlatform()) {
      try {
        const speakPromise = CapTextToSpeech.speak({
          text,
          lang: 'en-IN',
          rate: 0.95,
          pitch: 1.15,
          volume: 1.0,
          category: 'ambient',
        });
        const timeoutMs = Math.max(2500, (text.split(/\s+/).length / 2) * 1000 + 2000);
        const timeoutPromise = new Promise(resolve => setTimeout(resolve, timeoutMs));
        await Promise.race([speakPromise, timeoutPromise]);
        finishSpeech();
        return;
      } catch (e) {
        console.warn('Native Capacitor TTS fallback:', e);
      }
    }

    // Attempt 2: Server-side Gemini Flash Lite TTS ('Kore' female voice)
    const baseUrl = getBackendBaseUrl();
    if (baseUrl && baseUrl.startsWith('http')) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(`${baseUrl}/api/v1/voice/synthesize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceName: 'Kore' }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.available && data.audioBase64) {
            const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
            this.currentAudioElement = audio;

            audio.onended = () => {
              finishSpeech();
            };

            audio.onerror = () => {
              this.speakWithBrowserFallback(text, finishSpeech);
            };

            await audio.play();
            return;
          }
        }
      } catch {
        // Fall through to browser speech synthesis
      }
    }

    // Attempt 3: High-fidelity female human browser speech synthesis
    await this.speakWithBrowserFallback(text, finishSpeech);
  }

  private async speakWithBrowserFallback(text: string, onEnd?: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.isSpeaking = false;
      if (this.isListening) {
        this.scheduleRecognitionRestart('no_tts_resume', 100);
      }
      onEnd?.();
      return;
    }

    const persona = FEMALE_PERSONAS.find(p => p.id === this.activePersonaId) || FEMALE_PERSONAS[0];
    const femaleVoice = await this.getBestFemaleVoice(text);

    const utterance = new SpeechSynthesisUtterance(text);
    this.activeUtterance = utterance;

    // Warm, melodious female acoustic profile:
    // If voice is already a verified neural/natural female voice, set pitch ~1.06 - 1.12
    // If voice is a standard browser voice, set pitch ~1.20 - 1.25 to hit the ~220Hz female vocal register
    const isNeuralOrKnownFemale = femaleVoice && (
      femaleVoice.name.toLowerCase().includes('natural') ||
      femaleVoice.name.toLowerCase().includes('neural') ||
      femaleVoice.name.toLowerCase().includes('jenny') ||
      femaleVoice.name.toLowerCase().includes('aria') ||
      femaleVoice.name.toLowerCase().includes('samantha')
    );

    const basePitch = isNeuralOrKnownFemale ? 1.08 : persona.defaultPitch;
    utterance.pitch = Math.min(1.4, Math.max(0.8, basePitch * this.userPitchMultiplier));
    utterance.rate = Math.min(1.2, Math.max(0.7, persona.defaultRate * this.userRateMultiplier));
    utterance.volume = 1.0;

    if (femaleVoice) {
      utterance.voice = femaleVoice;
      utterance.lang = femaleVoice.lang;
    } else {
      utterance.lang = 'en-IN';
    }

    let finished = false;
    const finishSpeech = () => {
      if (finished) return;
      finished = true;
      if (this.speechWatchdogTimer) {
        clearTimeout(this.speechWatchdogTimer);
        this.speechWatchdogTimer = null;
      }
      this.activeUtterance = null;
      this.isSpeaking = false;
      onEnd?.();

      if (this.isListening) {
        // Exactly 1 second delay after assistant speech finishes before mic automatically turns on again to hear next item!
        setTimeout(() => {
          if (this.isListening && !this.isSpeaking) {
            this.resumeListening(0);
          }
        }, 1000);
      } else {
        if (this.onStateChangeCallback) {
          this.onStateChangeCallback('IDLE');
        }
      }
    };

    utterance.onend = finishSpeech;
    utterance.onerror = finishSpeech;

    // Failsafe watchdog timer: guarantees kiosk never freezes if browser speech stalls
    const wordCount = text.split(/\s+/).length;
    const estimatedDurationMs = Math.max(2500, (wordCount / 2.2) * 1000 + 2000);
    this.speechWatchdogTimer = setTimeout(() => {
      if (!finished) {
        finishSpeech();
      }
    }, estimatedDurationMs);

    try {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      window.speechSynthesis.speak(utterance);
    } catch {
      finishSpeech();
    }
  }

  public setLanguage(lang: 'en-IN' | 'hi-IN') {
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  public setPersona(personaId: string) {
    this.activePersonaId = personaId;
  }

  public getCurrentVoiceName(): string {
    const persona = FEMALE_PERSONAS.find(p => p.id === this.activePersonaId);
    return persona?.name || 'Ananya (Warm Female Host)';
  }
}

export const globalAudioManager = new AudioManager();
