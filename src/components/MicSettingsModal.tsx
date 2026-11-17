import React, { useState, useEffect } from 'react';
import {
  X,
  Sliders,
  Mic,
  Activity,
  Volume2,
  ShieldAlert,
  Zap,
  RotateCcw,
  Check,
  Sparkles,
  Key,
} from 'lucide-react';
import {
  MicFilterConfig,
  MicFilterPreset,
  MIC_FILTER_PRESETS,
  getStoredMicFilterConfig,
  saveMicFilterConfig,
} from '../audio/micFilterConfig';
import { globalAudioManager } from '../audio/audioManager';
import { getGeminiApiKey, setGeminiApiKey } from '../config';
import { testGeminiApiKey } from '../audio/geminiAudioSTT';

interface MicSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MicSettingsModal: React.FC<MicSettingsModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<MicFilterConfig>(getStoredMicFilterConfig());
  const [liveVolume, setLiveVolume] = useState<number>(0);
  const [frequencyData, setFrequencyData] = useState<number[]>([]);
  const [savedNotice, setSavedNotice] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>(getGeminiApiKey());
  const [keyTestStatus, setKeyTestStatus] = useState<{ testing: boolean; message: string; ok?: boolean } | null>(null);

  // Poll live microphone visualizer data every 80ms while open
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      const data = globalAudioManager.getVisualizerData();
      setLiveVolume(data.volume);
      setFrequencyData(data.frequencyData || []);
    }, 80);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestKey = async () => {
    setKeyTestStatus({ testing: true, message: 'Verifying Gemini API key with Google servers...' });
    const res = await testGeminiApiKey(apiKeyInput);
    setKeyTestStatus({ testing: false, message: res.message, ok: res.ok });
    if (res.ok) {
      setGeminiApiKey(apiKeyInput);
      triggerSavedFeedback();
    }
  };

  const handleApplyPreset = (preset: Exclude<MicFilterPreset, 'CUSTOM'>) => {
    const updated = { ...MIC_FILTER_PRESETS[preset] };
    setConfig(updated);
    saveMicFilterConfig(updated);
    triggerSavedFeedback();
  };

  const handleUpdate = (partial: Partial<MicFilterConfig>) => {
    const updated: MicFilterConfig = {
      ...config,
      ...partial,
      preset: 'CUSTOM',
    };
    setConfig(updated);
    saveMicFilterConfig(updated);
    triggerSavedFeedback();
  };

  const triggerSavedFeedback = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1500);
  };

  const handleResetDefaults = () => {
    const def = { ...MIC_FILTER_PRESETS.NEAR_FIELD_FOCUS };
    setConfig(def);
    saveMicFilterConfig(def);
    triggerSavedFeedback();
  };

  const isSpeech = liveVolume >= config.noiseGateThreshold;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md select-none animate-in fade-in duration-150">
      <div className="bg-neutral-900 border border-neutral-700/90 rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/80 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm sm:text-base font-extrabold text-white">
                  Microphone & Acoustic Noise Tuning
                </h3>
                {savedNotice && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center space-x-1 animate-pulse">
                    <Check className="w-3 h-3" />
                    <span>Saved</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-400">
                Isolate human voice frequencies & reject background hall noise
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-neutral-800 text-neutral-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto text-xs text-neutral-300">
          {/* Section 0: Google Gemini API Key Setup & Live Verification */}
          <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs flex items-center space-x-1.5">
                <Key className="w-4 h-4 text-amber-400" />
                <span>Voice AI API Key (Groq Whisper / Gemini)</span>
              </span>
              <div className="flex items-center space-x-2 text-[10px]">
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 underline hover:text-cyan-300 font-semibold"
                >
                  Groq Key (Fastest)
                </a>
                <span className="text-neutral-600">•</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-400 underline hover:text-amber-300"
                >
                  Google Key
                </a>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder="gsk_... (Groq Whisper) or AIzaSy... (Gemini)"
                className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400 font-mono"
              />
              <button
                type="button"
                onClick={handleTestKey}
                disabled={keyTestStatus?.testing}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition disabled:opacity-50 whitespace-nowrap shadow-md shadow-amber-500/20"
              >
                {keyTestStatus?.testing ? 'Testing...' : 'Test & Save'}
              </button>
            </div>

            {keyTestStatus && (
              <div
                className={`text-[11px] p-2.5 rounded-xl border leading-relaxed ${
                  keyTestStatus.ok
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                }`}
              >
                {keyTestStatus.message}
              </div>
            )}
            <p className="text-[10px] text-neutral-400">
              API key is stored locally on this device. Groq Whisper (gsk_...) delivers ultra-fast 200ms speech recognition.
            </p>
          </div>

          {/* Section 1: Live Voice & Gate Monitor */}
          <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-xs flex items-center space-x-1.5">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Live Hall Noise & Speech Monitor (RMS)</span>
              </span>
              <span
                className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border transition-all ${
                  isSpeech
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse'
                    : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                }`}
              >
                {isSpeech ? '🟢 Customer Speaking at Screen' : '⚪ Hall Noise Ignored (Below Gate)'}
              </span>
            </div>

            {/* Live Volume Meter with Gate Indicator */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] text-neutral-400">
                <span>Microphone Level: {liveVolume}%</span>
                <span>Gate Threshold: {config.noiseGateThreshold.toFixed(1)}%</span>
              </div>
              <div className="relative w-full h-3 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-75 rounded-full ${
                    isSpeech ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-neutral-600'
                  }`}
                  style={{ width: `${Math.min(100, liveVolume)}%` }}
                />
                {/* Gate marker */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10"
                  style={{ left: `${Math.min(100, config.noiseGateThreshold * 5)}%` }}
                  title="Noise Gate Threshold"
                />
              </div>
            </div>

            {/* Visual Frequency Bandpass Representation */}
            <div className="pt-2 border-t border-neutral-800/80 space-y-1.5">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-neutral-400">Acoustic Bandpass Filter:</span>
                <span className="text-emerald-400 font-bold">
                  {config.filterEnabled
                    ? `${config.lowCutHz} Hz — ${config.highCutHz} Hz (Human Voice)`
                    : 'Filter Disabled (Raw Audio)'}
                </span>
              </div>

              {/* Bandpass Spectrum Visualizer */}
              <div className="h-6 w-full bg-neutral-900 rounded-xl overflow-hidden border border-neutral-800 flex text-[9px] font-bold text-center items-center">
                <div
                  className="h-full bg-rose-950/40 border-r border-rose-500/30 text-rose-400/80 flex items-center justify-center transition-all truncate px-1"
                  style={{ width: '20%' }}
                >
                  &lt;{config.lowCutHz}Hz Cut
                </div>

                <div
                  className="h-full bg-emerald-950/60 text-emerald-300 border-r border-emerald-500/40 flex items-center justify-center transition-all flex-1 px-1 font-extrabold"
                >
                  🗣️ Human Voice ({config.lowCutHz}Hz - {config.highCutHz}Hz)
                </div>

                <div
                  className="h-full bg-rose-950/40 text-rose-400/80 flex items-center justify-center transition-all truncate px-1"
                  style={{ width: '22%' }}
                >
                  &gt;{config.highCutHz}Hz Cut
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Quick Presets */}
          <div className="space-y-2">
            <span className="font-bold text-white text-xs block">Frequency & Noise Presets:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleApplyPreset('NEAR_FIELD_FOCUS')}
                className={`p-3 rounded-2xl border text-left transition ${
                  config.preset === 'NEAR_FIELD_FOCUS'
                    ? 'bg-emerald-950/70 border-emerald-500 text-white shadow-lg shadow-emerald-950 ring-1 ring-emerald-500/50'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center space-x-1.5 font-bold text-xs text-emerald-400 mb-1">
                  <span>🎯 Near-Field Focus (Recommended)</span>
                </div>
                <p className="text-[10px] text-neutral-400 leading-tight">
                  High 7.5% noise gate. Only hears customer standing directly at screen; ignores people talking 1m away.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset('HUMAN_VOICE')}
                className={`p-3 rounded-2xl border text-left transition ${
                  config.preset === 'HUMAN_VOICE'
                    ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-lg shadow-emerald-950 ring-1 ring-emerald-500/50'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center space-x-1.5 font-bold text-xs text-sky-400 mb-1">
                  <span>🗣️ Standard Human Voice</span>
                </div>
                <p className="text-[10px] text-neutral-400 leading-tight">
                  250Hz - 3400Hz (5.5% gate). Cuts HVAC hum & kitchen sizzle. Ideal for moderate restaurant noise.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset('NOISY_RESTAURANT')}
                className={`p-3 rounded-2xl border text-left transition ${
                  config.preset === 'NOISY_RESTAURANT'
                    ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-lg shadow-emerald-950 ring-1 ring-emerald-500/50'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center space-x-1.5 font-bold text-xs text-amber-400 mb-1">
                  <span>🍔 Ultra-Noisy Food Court</span>
                </div>
                <p className="text-[10px] text-neutral-400 leading-tight">
                  350Hz - 3000Hz (8.5% gate). Extra-high noise rejection for packed crowd chatter & loud kitchens.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleApplyPreset('WIDE_VOICE')}
                className={`p-3 rounded-2xl border text-left transition ${
                  config.preset === 'WIDE_VOICE'
                    ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-lg shadow-emerald-950 ring-1 ring-emerald-500/50'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center space-x-1.5 font-bold text-xs text-purple-400 mb-1">
                  <span>🎙️ Wide Acoustic</span>
                </div>
                <p className="text-[10px] text-neutral-400 leading-tight">
                  120Hz - 4500Hz (3.0% gate). Full acoustic spectrum for testing in quiet rooms.
                </p>
              </button>
            </div>
          </div>

          {/* Section 3: Fine-Tuning Sliders */}
          <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 space-y-4">
            <span className="font-bold text-white text-xs block">Manual Acoustic Sliders:</span>

            {/* Slider 1: Low Cutoff (High-Pass) */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-neutral-300">
                  Low Frequency Cut-off (HVAC / Hum Filter):
                </span>
                <span className="font-extrabold text-amber-400">{config.lowCutHz} Hz</span>
              </div>
              <input
                type="range"
                min="50"
                max="500"
                step="10"
                value={config.lowCutHz}
                onChange={e => handleUpdate({ lowCutHz: parseInt(e.target.value, 10) })}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <p className="text-[10px] text-neutral-400">
                Cuts deep motor rumble, HVAC airflow, and table vibrations below this frequency.
              </p>
            </div>

            {/* Slider 2: High Cutoff (Low-Pass) */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-neutral-300">
                  High Frequency Cut-off (Sizzle / Steam Filter):
                </span>
                <span className="font-extrabold text-amber-400">{config.highCutHz} Hz</span>
              </div>
              <input
                type="range"
                min="2000"
                max="6000"
                step="100"
                value={config.highCutHz}
                onChange={e => handleUpdate({ highCutHz: parseInt(e.target.value, 10) })}
                className="w-full accent-amber-400 cursor-pointer"
              />
              <p className="text-[10px] text-neutral-400">
                Cuts fryer sizzle, espresso steam, soda dispenser hiss, and clattering cutlery above this frequency.
              </p>
            </div>

            {/* Slider 3: Noise Gate Sensitivity */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-neutral-300">
                  Noise Gate (Ignore Side Chatter & Distance):
                </span>
                <span className="font-extrabold text-emerald-400">
                  {config.noiseGateThreshold.toFixed(1)}% Volume
                </span>
              </div>
              <input
                type="range"
                min="1.0"
                max="20.0"
                step="0.5"
                value={config.noiseGateThreshold}
                onChange={e => handleUpdate({ noiseGateThreshold: parseFloat(e.target.value) })}
                className="w-full accent-emerald-400 cursor-pointer"
              />
              <p className="text-[10px] text-neutral-400">
                {config.noiseGateThreshold >= 7.0
                  ? '🎯 Near-Field Active: Only someone speaking directly into the kiosk screen is heard. Two people talking 1m away are completely ignored.'
                  : '⚠️ Low Threshold: May pick up background talk. Increase to 7.0% - 8.5% to reject people talking nearby.'}
              </p>
            </div>

            {/* Slider 4: Fast Response Time (Silence Delay) */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-neutral-300">
                  Response Speed (Silence Delay Before Add):
                </span>
                <span className="font-extrabold text-sky-400">{config.silenceCutoffMs} ms</span>
              </div>
              <input
                type="range"
                min="250"
                max="750"
                step="25"
                value={config.silenceCutoffMs}
                onChange={e => handleUpdate({ silenceCutoffMs: parseInt(e.target.value, 10) })}
                className="w-full accent-sky-400 cursor-pointer"
              />
              <p className="text-[10px] text-neutral-400">
                Lower value = faster response time (350ms - 400ms is lightning fast).
              </p>
            </div>

            {/* Filter Enable Toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
              <div>
                <span className="font-bold text-white block">Active Bandpass Filter</span>
                <span className="text-[10px] text-neutral-400">
                  Toggle filter on/off to compare acoustic isolation
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleUpdate({ filterEnabled: !config.filterEnabled })}
                className={`w-12 h-6 rounded-full transition p-1 flex items-center ${
                  config.filterEnabled ? 'bg-emerald-600 justify-end' : 'bg-neutral-800 justify-start'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md" />
              </button>
            </div>
          </div>

          {/* Reset button */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-xs flex items-center space-x-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Optimal Defaults</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20"
            >
              Done & Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
