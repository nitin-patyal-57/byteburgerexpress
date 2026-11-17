import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  HelpCircle,
  Mic,
  RefreshCw,
  Terminal,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { globalAudioManager, VoiceRCAStatus, VoiceRCALogEntry } from '../audio/audioManager';

interface VoiceRCAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onForceRestart: () => void;
}

export const VoiceRCAModal: React.FC<VoiceRCAModalProps> = ({
  isOpen,
  onClose,
  onForceRestart,
}) => {
  const [status, setStatus] = useState<VoiceRCAStatus>(globalAudioManager.getRCAStatus());
  const [logs, setLogs] = useState<VoiceRCALogEntry[]>([...globalAudioManager.rcaLogs]);
  const [activeTab, setActiveTab] = useState<'LIVE' | 'RCA_GUIDE' | 'CONSOLE'>('LIVE');
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Poll status every 800ms when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setStatus(globalAudioManager.getRCAStatus());
      setLogs([...globalAudioManager.rcaLogs]);
    }, 800);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyConsoleCmd = () => {
    navigator.clipboard?.writeText('window.__VOICE_RCA__.diagnose()');
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const getRecognitionBadge = () => {
    switch (status.recognitionState) {
      case 'ACTIVE':
        return {
          label: 'Active & Listening',
          bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
          dot: 'bg-emerald-500 animate-pulse',
        };
      case 'STARTING':
        return {
          label: 'Self-Healing Restarting...',
          bg: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
          dot: 'bg-amber-500 animate-ping',
        };
      case 'ERROR':
        return {
          label: 'Error / Attention Needed',
          bg: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
          dot: 'bg-rose-500',
        };
      case 'UNSUPPORTED':
        return {
          label: 'Not Supported in Browser',
          bg: 'bg-red-500/20 text-red-400 border-red-500/30',
          dot: 'bg-red-500',
        };
      case 'STOPPED':
      default:
        return {
          label: 'Stopped / Muted',
          bg: 'bg-neutral-800 text-neutral-400 border-neutral-700',
          dot: 'bg-neutral-500',
        };
    }
  };

  const badge = getRecognitionBadge();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-neutral-900 border border-neutral-700 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950/70">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">Voice RCA & Engine Diagnostics</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                  Telemetry Live
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Root Cause Analysis, browser silence recovery & real-time audio pipeline health
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                onForceRestart();
                setStatus(globalAudioManager.getRCAStatus());
                setLogs([...globalAudioManager.rcaLogs]);
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-orange-600/20 border border-orange-500/40 text-orange-300 hover:bg-orange-600/30 text-xs font-semibold transition"
              title="Force full reset of microphone capture and speech recognition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Self-Healing Reset</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 px-6 bg-neutral-950/40">
          <button
            onClick={() => setActiveTab('LIVE')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'LIVE'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Live Health & Events</span>
          </button>
          <button
            onClick={() => setActiveTab('RCA_GUIDE')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'RCA_GUIDE'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>5 Root Causes (RCA)</span>
          </button>
          <button
            onClick={() => setActiveTab('CONSOLE')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'CONSOLE'
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>DevTools Console Commands</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-neutral-200">
          {activeTab === 'LIVE' && (
            <div className="space-y-5">
              {/* Top 4 Live Metrics Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Recognition Engine */}
                <div className="bg-neutral-950/60 border border-neutral-800 rounded-2xl p-3.5 space-y-2">
                  <div className="text-[11px] font-semibold text-neutral-400 flex items-center justify-between">
                    <span>STT Engine</span>
                    <span className="text-neutral-500">WebSpeech</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                    <span className="text-xs font-bold text-white leading-tight">
                      {badge.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    Restarts: <strong className="text-amber-400">{status.restartsCount}</strong>
                  </div>
                </div>

                {/* Mic Hardware Stream */}
                <div className="bg-neutral-950/60 border border-neutral-800 rounded-2xl p-3.5 space-y-2">
                  <div className="text-[11px] font-semibold text-neutral-400 flex items-center justify-between">
                    <span>Mic Stream</span>
                    <Mic className="w-3.5 h-3.5 text-neutral-400" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        status.micTrackState?.readyState === 'live'
                          ? 'bg-emerald-500'
                          : 'bg-neutral-600'
                      }`}
                    />
                    <span className="text-xs font-bold text-white">
                      {status.micTrackState?.readyState === 'live' ? 'Live Track' : 'Uninitialized'}
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    Muted: <strong>{status.micTrackState?.muted ? 'YES ⚠️' : 'NO ✅'}</strong>
                  </div>
                </div>

                {/* AudioContext State */}
                <div className="bg-neutral-950/60 border border-neutral-800 rounded-2xl p-3.5 space-y-2">
                  <div className="text-[11px] font-semibold text-neutral-400 flex items-center justify-between">
                    <span>AudioContext</span>
                    <Volume2 className="w-3.5 h-3.5 text-neutral-400" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        status.audioContextState === 'running'
                          ? 'bg-emerald-500'
                          : 'bg-amber-500 animate-pulse'
                      }`}
                    />
                    <span className="text-xs font-bold text-white capitalize">
                      {status.audioContextState}
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    16kHz PCM • AEC / NS
                  </div>
                </div>

                {/* Dialogue State */}
                <div className="bg-neutral-950/60 border border-neutral-800 rounded-2xl p-3.5 space-y-2">
                  <div className="text-[11px] font-semibold text-neutral-400 flex items-center justify-between">
                    <span>Listening Loop</span>
                    <Zap className="w-3.5 h-3.5 text-neutral-400" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        status.isListening ? 'bg-emerald-500' : 'bg-neutral-500'
                      }`}
                    />
                    <span className="text-xs font-bold text-white">
                      {status.isListening ? 'Loop Active' : 'User Muted'}
                    </span>
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    Barge-in: <strong>Enabled (&lt;40ms)</strong>
                  </div>
                </div>
              </div>

              {/* Error Callout Banner (if any error encountered) */}
              {status.lastError && (
                <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-4 flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-300">
                        Last Recognition Notice ({status.lastErrorCode || 'Notice'})
                      </span>
                      <span className="text-[10px] text-neutral-400">{status.lastErrorTime}</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed">
                      {status.lastError}
                    </p>
                  </div>
                </div>
              )}

              {/* Last Captured Spoken Utterance */}
              <div className="bg-neutral-950/50 border border-neutral-800 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
                    Last Successfully Recognized Utterance
                  </span>
                  <span className="text-xs font-semibold text-white">
                    {status.lastTranscript ? `"${status.lastTranscript}"` : 'No utterance recorded yet'}
                  </span>
                </div>
                {status.lastTranscriptTime && (
                  <span className="text-[10px] text-neutral-400">{status.lastTranscriptTime}</span>
                )}
              </div>

              {/* Real-time Event Audit Stream */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-300 flex items-center space-x-1.5">
                    <Clock className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Real-time Voice Lifecycle Audit Log ({logs.length} events)</span>
                  </span>
                  <span className="text-[10px] text-neutral-500">Auto-updates every 800ms</span>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3 max-h-56 overflow-y-auto space-y-2 text-xs font-mono">
                  {logs.length === 0 ? (
                    <div className="text-center py-4 text-neutral-500 text-xs">
                      No lifecycle events recorded yet. Enable the microphone to view real-time traces.
                    </div>
                  ) : (
                    logs.map((log, idx) => (
                      <div
                        key={idx}
                        className="flex items-start justify-between py-1 border-b border-neutral-900/80 last:border-0"
                      >
                        <div className="flex items-start space-x-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              log.type.includes('ERROR')
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : log.type.includes('RESTART') || log.type.includes('REVIVAL')
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : log.type.includes('RESULT')
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-neutral-800 text-neutral-300'
                            }`}
                          >
                            {log.type}
                          </span>
                          <span className="text-neutral-300 text-xs font-sans">{log.message}</span>
                        </div>
                        <span className="text-neutral-500 text-[10px] whitespace-nowrap ml-3">
                          {log.timestamp}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'RCA_GUIDE' && (
            <div className="space-y-4">
              <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4">
                <h3 className="text-sm font-bold text-white mb-1">
                  Why Web Speech Voice Apps Stop Listening & How ByteBurger Recovers
                </h3>
                <p className="text-xs text-neutral-400">
                  Root Cause Analysis (RCA) breakdown of browser audio lifecycle constraints:
                </p>
              </div>

              <div className="space-y-3">
                {/* RCA 1 */}
                <div className="p-4 rounded-2xl bg-neutral-950/50 border border-neutral-800 space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold flex items-center justify-center">
                      1
                    </span>
                    <h4 className="text-xs font-bold text-white">
                      Browser Silence Timeout (Error: <code className="text-amber-400">no-speech</code>)
                    </h4>
                  </div>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    <strong>Cause:</strong> In Chromium (Chrome/Edge/Brave), the Web Speech API automatically closes the connection after 10–15 seconds of customer silence. Without a watchdog, listening permanently halts.
                  </p>
                  <p className="text-xs text-emerald-400 leading-relaxed">
                    <strong>ByteBurger Recovery:</strong> The engine catches <code className="text-emerald-300">onend</code> and <code className="text-emerald-300">onerror(no-speech)</code>, immediately scheduling a debounced (150ms) self-healing reconnect loop.
                  </p>
                </div>

                {/* RCA 2 */}
                <div className="p-4 rounded-2xl bg-neutral-950/50 border border-neutral-800 space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold flex items-center justify-center">
                      2
                    </span>
                    <h4 className="text-xs font-bold text-white">
                      Native Engine State Collision (<code className="text-amber-400">InvalidStateError</code>)
                    </h4>
                  </div>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    <strong>Cause:</strong> Calling <code className="text-neutral-300">recognition.start()</code> synchronously inside <code className="text-neutral-300">onend</code> throws an exception because Chrome’s underlying audio pipeline is still in its transition phase.
                  </p>
                  <p className="text-xs text-emerald-400 leading-relaxed">
                    <strong>ByteBurger Recovery:</strong> Restarts are decoupled into asynchronous timers with a 450ms exponential retry backoff so the browser engine completely releases before restarting.
                  </p>
                </div>

                {/* RCA 3 */}
                <div className="p-4 rounded-2xl bg-neutral-950/50 border border-neutral-800 space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold flex items-center justify-center">
                      3
                    </span>
                    <h4 className="text-xs font-bold text-white">
                      Soft Speech or Noisy Environments (Interim Speech Not Finalizing)
                    </h4>
                  </div>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    <strong>Cause:</strong> Speech recognition emits interim transcripts, but fails to mark <code className="text-neutral-300">isFinal: true</code> if the customer speaks softly or ambient restaurant noise masks the end-of-phrase boundary.
                  </p>
                  <p className="text-xs text-emerald-400 leading-relaxed">
                    <strong>ByteBurger Recovery:</strong> A 1.6-second silence watchdog automatically flushes and commits the interim transcript so customer commands are never lost.
                  </p>
                </div>

                {/* RCA 4 */}
                <div className="p-4 rounded-2xl bg-neutral-950/50 border border-neutral-800 space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold flex items-center justify-center">
                      4
                    </span>
                    <h4 className="text-xs font-bold text-white">
                      AudioContext Suspended by Browser Tab Throttling
                    </h4>
                  </div>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    <strong>Cause:</strong> When switching tabs or when the browser power saver engages, <code className="text-neutral-300">AudioContext.state</code> changes to <code className="text-neutral-300">'suspended'</code>.
                  </p>
                  <p className="text-xs text-emerald-400 leading-relaxed">
                    <strong>ByteBurger Recovery:</strong> A background 2.5-second health watchdog detects suspended contexts and immediately triggers <code className="text-emerald-300">audioCtx.resume()</code>.
                  </p>
                </div>

                {/* RCA 5 */}
                <div className="p-4 rounded-2xl bg-neutral-950/50 border border-neutral-800 space-y-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold flex items-center justify-center">
                      5
                    </span>
                    <h4 className="text-xs font-bold text-white">
                      Microphone Permission Revocation or Hardware Mute
                    </h4>
                  </div>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    <strong>Cause:</strong> If another application takes exclusive lock on the microphone, or the hardware switch is toggled, track state shifts to <code className="text-neutral-300">muted</code> or <code className="text-neutral-300">ended</code>.
                  </p>
                  <p className="text-xs text-emerald-400 leading-relaxed">
                    <strong>ByteBurger Recovery:</strong> Real-time track listener exposes track status on the dashboard and allows an instant one-click recovery reset.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'CONSOLE' && (
            <div className="space-y-4">
              <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 space-y-2">
                <h3 className="text-sm font-bold text-white">
                  Inspect Real-Time RCA in Chrome DevTools
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Open your browser console (<kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">F12</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">Ctrl+Shift+I</kbd>) and run these commands directly:
                </p>
              </div>

              <div className="space-y-3">
                <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3.5 space-y-2 font-mono text-xs">
                  <div className="flex items-center justify-between text-neutral-400">
                    <span className="text-[11px] font-sans font-bold text-amber-400">
                      1. Pretty Diagnostic Table:
                    </span>
                    <button
                      onClick={handleCopyConsoleCmd}
                      className="text-[10px] text-orange-400 hover:text-orange-300 underline font-sans"
                    >
                      {copyFeedback ? 'Copied!' : 'Copy Command'}
                    </button>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black border border-neutral-800 text-emerald-400 select-all">
                    window.__VOICE_RCA__.diagnose()
                  </div>
                  <p className="text-[11px] text-neutral-400 font-sans">
                    Prints a clean console table showing live microphone track state, auto-restart count, and recent audio events.
                  </p>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3.5 space-y-2 font-mono text-xs">
                  <span className="text-[11px] font-sans font-bold text-amber-400 block">
                    2. Get Structured JSON Telemetry:
                  </span>
                  <div className="p-2.5 rounded-xl bg-black border border-neutral-800 text-emerald-400 select-all">
                    window.__VOICE_RCA__.getStatus()
                  </div>
                </div>

                <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3.5 space-y-2 font-mono text-xs">
                  <span className="text-[11px] font-sans font-bold text-amber-400 block">
                    3. Force Manual Speech Recognition Restart:
                  </span>
                  <div className="p-2.5 rounded-xl bg-black border border-neutral-800 text-emerald-400 select-all">
                    window.__VOICE_RCA__.forceRestart()
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-800 bg-neutral-950/80 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-neutral-400">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Active Watchdog: Auto-heals in 150ms on silence disconnect</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                onForceRestart();
                setStatus(globalAudioManager.getRCAStatus());
                setLogs([...globalAudioManager.rcaLogs]);
              }}
              className="px-4 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 transition font-medium"
            >
              Reset Audio Engine
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold transition shadow-md"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
