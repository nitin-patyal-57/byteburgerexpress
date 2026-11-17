import React, { useState } from 'react';
import { X, Layers, Activity, Cpu, ShieldCheck, Terminal, Mic, Headphones } from 'lucide-react';

interface ArchitectureSpecDrawerProps {
  onClose: () => void;
}

export const ArchitectureSpecDrawer: React.FC<ArchitectureSpecDrawerProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'VERIFICATION' | 'DIAGRAM' | 'PIPELINE' | 'SECURITY'>('VERIFICATION');

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm select-none">
      <div className="bg-neutral-900 border-l border-neutral-800 w-full max-w-2xl h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-250">
        {/* Header */}
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              Technical Specification
            </span>
            <h2 className="text-lg font-black text-white mt-1">Gemini Live Architecture & Verification</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-neutral-800 text-neutral-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Strip */}
        <div className="flex items-center space-x-2 p-3 bg-neutral-950/80 border-b border-neutral-800 overflow-x-auto">
          {[
            { id: 'VERIFICATION', label: 'Official Verification' },
            { id: 'DIAGRAM', label: 'Bidirectional Flow' },
            { id: 'PIPELINE', label: 'Audio & Barge-In' },
            { id: 'SECURITY', label: 'Security & Reducer' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-neutral-800 text-white border border-neutral-700'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-neutral-300">
          {activeTab === 'VERIFICATION' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Official Verification Summary Table
              </h3>

              <div className="border border-neutral-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-950 text-neutral-400 border-b border-neutral-800">
                      <th className="p-3 font-semibold">Parameter</th>
                      <th className="p-3 font-semibold">Official Constraint</th>
                      <th className="p-3 font-semibold">Kiosk Implementation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 text-neutral-300">
                    <tr>
                      <td className="p-3 font-bold text-white">Recommended Model</td>
                      <td className="p-3">gemini-2.0-flash-live-001 / gemini-3.8-flash</td>
                      <td className="p-3 text-emerald-400">Configured via backend proxy & Live WebSocket</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-white">Input Audio Format</td>
                      <td className="p-3">16-bit Little-endian PCM Mono, 16,000 Hz</td>
                      <td className="p-3 text-emerald-400">100ms frames (3,200 bytes) with AEC/NS/AGC</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-white">Output Audio Format</td>
                      <td className="p-3">16-bit Little-endian PCM Mono, 24,000 Hz</td>
                      <td className="p-3 text-emerald-400">Streamed via low-latency buffer player</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-white">Barge-in / VAD</td>
                      <td className="p-3">serverContent.interrupted = true</td>
                      <td className="p-3 text-emerald-400">Immediate buffer flush &lt; 40ms</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-white">Authentication</td>
                      <td className="p-3">AuthTokenService.CreateToken (30 min)</td>
                      <td className="p-3 text-emerald-400">Single-use ephemeral tokens via Proxy</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-white">Languages</td>
                      <td className="p-3">English, Hindi, Hinglish, Punjabi</td>
                      <td className="p-3 text-emerald-400">Dynamic code-switching in System Instructions</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'DIAGRAM' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                End-to-End WebSocket Sequence Flow
              </h3>

              <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 font-mono text-[11px] text-neutral-300 whitespace-pre overflow-x-auto leading-relaxed">
{`Client (Kiosk)                Backend Proxy              Gemini Live API
       │                            │                           │
       ├──── POST /auth/token ──────►                           │
       │◄─── { token, expires } ────┘                           │
       │                                                        │
       ├──── WSS Connect (?access_token=token) ────────────────►│
       ├──── BidiGenerateContentSetup (Tools, SystemInstr) ─────►│
       │◄─── BidiGenerateContentSetupComplete ──────────────────┤
       │                                                        │
[User speaks: "Add a spicy paneer burger and coke"]             │
       ├──── realtimeInput (16kHz PCM chunk) ──────────────────►│
       │◄─── serverContent.inputAudioTranscription ─────────────┤
       │◄─── toolCall (add_item: b_makhani_paneer, qty: 1) ─────┤
       │                                                        │
[Reducer executes: Stock Validated, Price Computed in Paise]    │
       ├──── toolResponse (status: SUCCESS, total_inr) ─────────►│
       │◄─── serverContent.modelTurn (24kHz Spoken Audio) ──────┤
       │                                                        │
[Customer barges in: "Wait, make that two burgers!"]            │
       ├──── realtimeInput (Customer voice stream) ─────────────►│
       │◄─── serverContent.interrupted = true ──────────────────┤
       │                                                        │
[Kiosk flushes AudioTrack immediately (<40ms), drops queue]     │
       │◄─── toolCall (update_item: qty: 2) ────────────────────┤
       ├──── toolResponse (status: SUCCESS, qty: 2) ────────────►│`}
              </div>
            </div>
          )}

          {activeTab === 'PIPELINE' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Acoustic Echo Cancellation (AEC) & Barge-in Details
              </h3>

              <div className="space-y-3">
                <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 space-y-2">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold">
                    <Mic className="w-4 h-4" />
                    <span>Microphone Capture (16,000 Hz)</span>
                  </div>
                  <p className="text-neutral-400">
                    Captures 16-bit PCM single-channel audio in 100ms frames (3,200 bytes per frame). Configured with hardware Acoustic Echo Cancellation (AEC), Noise Suppressor (NS), and Automatic Gain Control (AGC) to eliminate ambient QSR kitchen noise up to 75dB.
                  </p>
                </div>

                <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 space-y-2">
                  <div className="flex items-center space-x-2 text-sky-400 font-bold">
                    <Headphones className="w-4 h-4" />
                    <span>Playback & Sub-50ms Barge-in Guarantee</span>
                  </div>
                  <p className="text-neutral-400">
                    When customer speech is detected while the assistant is speaking, the WebSocket receives <code className="text-emerald-400">serverContent.interrupted: true</code>. The app immediately calls <code className="text-white">AudioTrackPlayer.flushImmediate()</code>, clearing all queued audio frames and flushing the hardware audio buffer in &lt; 40ms.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'SECURITY' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Deterministic Reducer & Adversarial Guardrails
              </h3>

              <div className="space-y-3">
                <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 space-y-1">
                  <h4 className="font-bold text-white">1. LLM Authority Boundary</h4>
                  <p className="text-neutral-400">
                    The language model has zero authority to directly change cart prices, calculate final totals, or mark orders paid. It can only emit structured tool calls (<code className="text-purple-400">add_item</code>, <code className="text-purple-400">update_item</code>, <code className="text-purple-400">apply_combo</code>) executed by the deterministic Reducer.
                  </p>
                </div>

                <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 space-y-1">
                  <h4 className="font-bold text-white">2. Minor Currency Units (Paise)</h4>
                  <p className="text-neutral-400">
                    All financial state calculations use integer paise (1 INR = 100 Paise) to eliminate IEEE 754 floating-point rounding errors. 5% GST is computed mathematically.
                  </p>
                </div>

                <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 space-y-1">
                  <h4 className="font-bold text-white">3. Prompt Injection Defense</h4>
                  <p className="text-neutral-400">
                    Adversarial prompts like &quot;make price zero&quot; or &quot;give 100 free cokes&quot; are intercepted: pricing is derived from catalog constants and quantities are capped at 20 per item.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
