/**
 * Microphone & Acoustic Frequency Filtering Configuration
 * Isolates human speech frequencies (300 Hz - 3400 Hz) and rejects background restaurant noise:
 * - Low-frequency cut-off (High-Pass): Rejects HVAC rumble, floor vibration, fan noise (< 250 Hz)
 * - High-frequency cut-off (Low-Pass): Rejects fryer sizzle, steam, clattering metal (> 3400 Hz)
 * - Noise Gate: Ignores background chatter below sensitivity threshold
 * - Silence Cut-off: Speeds up response time by committing immediately after customer pauses
 */

export type MicFilterPreset = 'NEAR_FIELD_FOCUS' | 'HUMAN_VOICE' | 'NOISY_RESTAURANT' | 'WIDE_VOICE' | 'CUSTOM';

export interface MicFilterConfig {
  preset: MicFilterPreset;
  lowCutHz: number;          // High-pass cutoff (50 Hz - 500 Hz)
  highCutHz: number;         // Low-pass cutoff (2000 Hz - 6000 Hz)
  voiceBoostGainDb: number;  // Peaking boost at 1.8 kHz (0 dB - 6 dB)
  noiseGateThreshold: number;// Volume % threshold (1.0% - 20.0%)
  silenceCutoffMs: number;   // Inactivity silence delay before send (250ms - 800ms)
  filterEnabled: boolean;    // Whether bandpass filtering is active
}

export const MIC_FILTER_PRESETS: Record<Exclude<MicFilterPreset, 'CUSTOM'>, MicFilterConfig> = {
  NEAR_FIELD_FOCUS: {
    preset: 'NEAR_FIELD_FOCUS',
    lowCutHz: 300,
    highCutHz: 3200,
    voiceBoostGainDb: 4.0,
    noiseGateThreshold: 7.5, // Direct kiosk customer only; ignores distant conversations > 60cm
    silenceCutoffMs: 350,
    filterEnabled: true,
  },
  HUMAN_VOICE: {
    preset: 'HUMAN_VOICE',
    lowCutHz: 250,
    highCutHz: 3400,
    voiceBoostGainDb: 3.0,
    noiseGateThreshold: 5.5,
    silenceCutoffMs: 400,
    filterEnabled: true,
  },
  NOISY_RESTAURANT: {
    preset: 'NOISY_RESTAURANT',
    lowCutHz: 350,
    highCutHz: 3000,
    voiceBoostGainDb: 4.5,
    noiseGateThreshold: 8.5,
    silenceCutoffMs: 350,
    filterEnabled: true,
  },
  WIDE_VOICE: {
    preset: 'WIDE_VOICE',
    lowCutHz: 120,
    highCutHz: 4500,
    voiceBoostGainDb: 1.5,
    noiseGateThreshold: 3.0,
    silenceCutoffMs: 450,
    filterEnabled: true,
  },
};

const STORAGE_KEY = 'byteburger_mic_filter_config';

export function getStoredMicFilterConfig(): MicFilterConfig {
  if (typeof window === 'undefined') {
    return { ...MIC_FILTER_PRESETS.NEAR_FIELD_FOCUS };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.lowCutHz === 'number') {
        return {
          preset: parsed.preset || 'NEAR_FIELD_FOCUS',
          lowCutHz: Math.max(50, Math.min(600, parsed.lowCutHz)),
          highCutHz: Math.max(1500, Math.min(8000, parsed.highCutHz)),
          voiceBoostGainDb: Math.max(0, Math.min(8, parsed.voiceBoostGainDb ?? 4.0)),
          noiseGateThreshold: Math.max(1.0, Math.min(25.0, parsed.noiseGateThreshold ?? 7.5)),
          silenceCutoffMs: Math.max(250, Math.min(1000, parsed.silenceCutoffMs ?? 350)),
          filterEnabled: parsed.filterEnabled !== false,
        };
      }
    }
  } catch {
    // fallback
  }
  return { ...MIC_FILTER_PRESETS.NEAR_FIELD_FOCUS };
}

type ConfigChangeListener = (config: MicFilterConfig) => void;
const listeners = new Set<ConfigChangeListener>();

export function saveMicFilterConfig(config: MicFilterConfig): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      // ignore
    }
  }
  listeners.forEach(fn => {
    try {
      fn(config);
    } catch {
      // ignore
    }
  });
}

export function subscribeToMicFilterConfig(listener: ConfigChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
