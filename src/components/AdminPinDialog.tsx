import React, { useState } from 'react';
import { X, Lock, Unlock, ShieldCheck, RefreshCw, Volume2, Mic, Settings, Globe } from 'lucide-react';
import { globalAudioManager } from '../audio/audioManager';
import { getBackendBaseUrl, setBackendBaseUrl } from '../config';

interface AdminPinDialogProps {
  onClose: () => void;
  onResetKiosk: () => void;
  aecEnabled: boolean;
  onToggleAec: (enabled: boolean) => void;
  inactivityLimit: number;
  onChangeInactivityLimit: (seconds: number) => void;
  onOpenMicSettings?: () => void;
}

export const AdminPinDialog: React.FC<AdminPinDialogProps> = ({
  onClose,
  onResetKiosk,
  aecEnabled,
  onToggleAec,
  inactivityLimit,
  onChangeInactivityLimit,
  onOpenMicSettings,
}) => {
  const [pin, setPin] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [backendUrl, setBackendUrl] = useState(getBackendBaseUrl());

  const correctPin = '2026'; // Default QSR manager pin

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      const nextPin = pin + num;
      setPin(nextPin);
      if (nextPin.length === 4) {
        if (nextPin === correctPin || nextPin === '1234') {
          setIsUnlocked(true);
          setErrorMessage('');
        } else {
          setErrorMessage('Invalid PIN. Use 2026 or 1234.');
          setTimeout(() => setPin(''), 800);
        }
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setErrorMessage('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 select-none">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl sm:rounded-3xl max-w-sm sm:max-w-md w-full max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950 shrink-0">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-extrabold text-white">Kiosk Device Admin</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-neutral-800 text-neutral-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isUnlocked ? (
          /* PIN Entry Screen */
          <div className="p-6 space-y-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-neutral-800 flex items-center justify-center mx-auto text-amber-400">
              <Lock className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Enter Manager PIN</h4>
              <p className="text-[11px] text-neutral-400">Default PIN: 2026</p>
            </div>

            {/* PIN Dots */}
            <div className="flex justify-center space-x-3 py-2">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border transition-all ${
                    pin.length > i
                      ? 'bg-amber-400 border-amber-400 scale-110'
                      : 'border-neutral-700 bg-neutral-950'
                  }`}
                />
              ))}
            </div>

            {errorMessage && <p className="text-xs text-rose-400 font-medium">{errorMessage}</p>}

            {/* Number Pad */}
            <div className="grid grid-cols-3 gap-2.5 max-w-[240px] mx-auto pt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    if (k === 'C') setPin('');
                    else if (k === '⌫') handleBackspace();
                    else handleKeyPress(k);
                  }}
                  className="h-12 rounded-2xl bg-neutral-800 text-white font-bold text-sm hover:bg-neutral-700 active:scale-95 transition flex items-center justify-center border border-neutral-700/60"
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Admin Settings Screen */
          <div className="p-6 space-y-5 text-xs text-neutral-300">
            <div className="flex items-center space-x-2 text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 p-3 rounded-2xl">
              <Unlock className="w-4 h-4" />
              <span className="font-bold">Manager Mode Authenticated</span>
            </div>

            {/* Backend URL Configuration */}
            <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800 space-y-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-1.5">
                  <Globe className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-bold text-white block">Backend Server URL</span>
                </div>
                <span className="text-[10px] text-amber-400">Gemini Proxy</span>
              </div>
              <input
                type="text"
                value={backendUrl}
                onChange={e => {
                  setBackendUrl(e.target.value);
                  setBackendBaseUrl(e.target.value);
                }}
                placeholder="e.g. http://192.168.0.122:3000"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-400"
              />
              <p className="text-[10px] text-neutral-400">
                Set to your PC's IP or Cloud Run URL so the tablet can talk to Gemini.
              </p>
            </div>

            {/* Audio AEC Toggle */}
            <div className="flex items-center justify-between bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800">
              <div className="space-y-0.5">
                <span className="font-bold text-white block">Hardware AEC & NS</span>
                <span className="text-[10px] text-neutral-400">Acoustic Echo Cancellation</span>
              </div>
              <button
                type="button"
                onClick={() => onToggleAec(!aecEnabled)}
                className={`w-12 h-6 rounded-full transition p-1 flex items-center ${
                  aecEnabled ? 'bg-emerald-600 justify-end' : 'bg-neutral-800 justify-start'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md" />
              </button>
            </div>

            {/* Mic Frequency & Noise Tuning Quick Launcher */}
            {onOpenMicSettings && (
              <div className="flex items-center justify-between bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800">
                <div className="space-y-0.5">
                  <span className="font-bold text-white block">Microphone Frequency Filter</span>
                  <span className="text-[10px] text-emerald-400">Human Voice Bandpass & Noise Gate</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenMicSettings();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 font-bold text-xs transition"
                >
                  Tune Filter
                </button>
              </div>
            )}

            {/* Female Voice Persona Tuning */}
            <div className="bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">Female Voice Persona</span>
                  <span className="text-[10px] text-pink-400">Natural Human Sound Engine</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    globalAudioManager.speak('Welcome to ByteBurger! Testing female speech synthesis.');
                  }}
                  className="px-2.5 py-1 rounded-xl bg-pink-950/60 border border-pink-500/40 text-pink-300 text-[10px] font-bold hover:bg-pink-900 transition flex items-center space-x-1"
                >
                  <Volume2 className="w-3 h-3" />
                  <span>Test Voice</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'ananya', label: 'Ananya (Host)' },
                  { id: 'priya', label: 'Priya (Hinglish)' },
                  { id: 'meera', label: 'Meera (Soft)' },
                  { id: 'jenny', label: 'Jenny (Studio)' },
                ].map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => globalAudioManager.setPersona(p.id)}
                    className="py-1.5 px-2 rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-300 hover:text-white hover:border-pink-500/50 text-[11px] font-medium text-left truncate transition"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Inactivity Limit */}
            <div className="space-y-2 bg-neutral-950 p-3.5 rounded-2xl border border-neutral-800">
              <div className="flex justify-between items-center">
                <span className="font-bold text-white">Silence Watchdog Timeout</span>
                <span className="text-amber-400 font-bold">{inactivityLimit}s</span>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[30, 45, 60].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onChangeInactivityLimit(s)}
                    className={`py-1.5 rounded-xl border font-bold text-[11px] transition ${
                      inactivityLimit === s
                        ? 'bg-amber-500 text-neutral-950 border-amber-500'
                        : 'bg-neutral-850 text-neutral-400 border-neutral-700 hover:text-white'
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            </div>

            {/* Force Reset Kiosk */}
            <button
              type="button"
              onClick={() => {
                onResetKiosk();
                onClose();
              }}
              className="w-full py-3.5 rounded-2xl bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 font-bold transition flex items-center justify-center space-x-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Force Reset Active Kiosk Session</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
