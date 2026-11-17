import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  ShieldCheck,
  Terminal,
  BookOpen,
  Clock,
  AlertTriangle,
  Play,
  Sparkles,
  Sliders,
  Activity,
  ChevronDown,
} from 'lucide-react';
import { VoiceState } from '../types';
import { globalAudioManager, FEMALE_PERSONAS } from '../audio/audioManager';

interface KioskHeaderProps {
  voiceState: VoiceState;
  isMicActive: boolean;
  onToggleMic: () => void;
  inactivitySecondsRemaining: number;
  onOpenAdmin: () => void;
  onOpenArchitecture: () => void;
  onOpenTestRunner: () => void;
  onOpenVoiceRCA: () => void;
  onOpenMicSettings: () => void;
  detectedLanguage?: string;
  hasAllergyAlert?: boolean;
}

export const KioskHeader: React.FC<KioskHeaderProps> = ({
  voiceState,
  isMicActive,
  onToggleMic,
  inactivitySecondsRemaining,
  onOpenAdmin,
  onOpenArchitecture,
  onOpenTestRunner,
  onOpenVoiceRCA,
  onOpenMicSettings,
  detectedLanguage = 'Hinglish / English',
  hasAllergyAlert = false,
}) => {
  const [showVoicePopover, setShowVoicePopover] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState(globalAudioManager.activePersonaId);
  const [isPlayingTest, setIsPlayingTest] = useState(false);

  const getOrbDetails = () => {
    switch (voiceState) {
      case 'LISTENING':
        return {
          color: 'bg-emerald-500 shadow-emerald-500/50',
          label: 'Listening...',
          pulse: 'animate-pulse scale-110',
          textColor: 'text-emerald-400',
        };
      case 'THINKING':
        return {
          color: 'bg-amber-500 shadow-amber-500/50',
          label: 'Processing...',
          pulse: 'animate-bounce',
          textColor: 'text-amber-400',
        };
      case 'SPEAKING':
        return {
          color: 'bg-sky-500 shadow-sky-500/50',
          label: 'Speaking...',
          pulse: 'animate-ping',
          textColor: 'text-sky-400',
        };
      case 'ERROR':
        return {
          color: 'bg-rose-500 shadow-rose-500/50',
          label: 'Voice Offline',
          pulse: '',
          textColor: 'text-rose-400',
        };
      case 'IDLE':
      default:
        return {
          color: 'bg-neutral-500 shadow-neutral-500/30',
          label: 'Idle',
          pulse: '',
          textColor: 'text-neutral-400',
        };
    }
  };

  const orb = getOrbDetails();

  const handleTestFemaleVoice = (customText?: string) => {
    setIsPlayingTest(true);
    const textToSpeak = customText || (
      selectedPersonaId === 'priya'
        ? 'Namaste! Welcome to ByteBurger Express. Aaj aapke liye kya fresh burger aur peri peri fries ready karein?'
        : 'Welcome to ByteBurger Express! I am Ananya, your friendly voice assistant. What delicious burger or meal combo would you like today?'
    );

    globalAudioManager.speak(textToSpeak, () => {
      setIsPlayingTest(false);
    });
  };

  const handleSelectPersona = (id: string) => {
    setSelectedPersonaId(id);
    globalAudioManager.setPersona(id);
  };

  const currentPersona = FEMALE_PERSONAS.find(p => p.id === selectedPersonaId) || FEMALE_PERSONAS[0];

  return (
    <header className="bg-neutral-900 border-b border-neutral-800 px-2.5 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between gap-2 select-none shadow-md relative z-30 overflow-x-auto no-scrollbar">
      {/* Brand & Kiosk identity */}
      <div className="flex items-center space-x-2 sm:space-x-2.5 shrink-0">
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-orange-600 to-red-600 flex items-center justify-center shadow-lg shadow-orange-600/20 text-white font-black text-base sm:text-xl tracking-tighter shrink-0">
          BB
        </div>
        <div>
          <div className="flex items-center space-x-1.5">
            <h1 className="text-sm sm:text-lg font-extrabold tracking-tight text-white whitespace-nowrap">
              ByteBurger Express
            </h1>
            <span className="hidden md:inline-block text-[9px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded-full border border-orange-500/30 whitespace-nowrap">
              Live Voice Kiosk
            </span>
          </div>
          <p className="hidden xl:block text-[11px] text-neutral-400">
            Natural speech ordering • Gemini Live API • 16kHz PCM AEC/NS Pipeline
          </p>
        </div>
      </div>

      {/* Middle: Live Mic Orb, Voice Status, and Female Voice Persona Selector */}
      <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
        {/* Mic toggle and status */}
        <div className="flex items-center space-x-2 sm:space-x-3 bg-neutral-950/80 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl border border-neutral-800 shadow-inner">
          <button
            onClick={onToggleMic}
            title={isMicActive ? 'Mute Microphone' : 'Enable Microphone'}
            className={`relative min-w-[40px] min-h-[40px] p-2 sm:p-2.5 rounded-xl transition-all duration-200 flex items-center justify-center ${
              isMicActive
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 hover:bg-emerald-500'
                : 'bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700'
            }`}
          >
            {isMicActive ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={onOpenVoiceRCA}
            className="flex items-center space-x-2 text-left hover:opacity-80 transition cursor-pointer"
            title="Click to view Voice RCA & Audio Diagnostics"
          >
            <div className="relative flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6">
              <div className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full ${orb.color} shadow-lg transition-all duration-300 ${orb.pulse}`} />
              {voiceState === 'LISTENING' && (
                <span className="absolute w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-emerald-500/20 animate-ping" />
              )}
            </div>
            <div className="flex flex-col">
              <span className={`text-xs font-bold leading-none whitespace-nowrap ${orb.textColor}`}>{orb.label}</span>
              <span className="text-[10px] text-neutral-400 mt-0.5 whitespace-nowrap">{detectedLanguage}</span>
            </div>
          </button>

          {hasAllergyAlert && (
            <div className="flex items-center space-x-1.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-1 rounded-lg text-xs font-semibold animate-pulse whitespace-nowrap">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden sm:inline">Staff Dispatched</span>
            </div>
          )}
        </div>

        {/* Human Female Voice Persona Chip & Audio Preview */}
        <div className="relative">
          <div className="flex items-center bg-neutral-950/80 border border-neutral-800 rounded-2xl p-1 shadow-inner">
            <button
              type="button"
              onClick={() => setShowVoicePopover(!showVoicePopover)}
              className="flex items-center space-x-1.5 sm:space-x-2 px-2 sm:px-3 py-1.5 rounded-xl hover:bg-neutral-850 text-neutral-200 hover:text-white transition group"
              title="Change Voice Persona and Sound Settings"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-pink-500 to-rose-400 flex items-center justify-center text-[11px] shadow-sm font-bold text-white shrink-0">
                ♀
              </div>
              <div className="text-left hidden sm:block">
                <div className="flex items-center space-x-1">
                  <span className="text-xs font-bold text-white whitespace-nowrap">{currentPersona.name}</span>
                  <ChevronDown className="w-3 h-3 text-neutral-400 group-hover:text-white transition" />
                </div>
                <span className="text-[9px] text-pink-400 font-semibold block leading-tight">Human Female Voice</span>
              </div>
            </button>

            {/* Direct Play/Test Button */}
            <button
              type="button"
              onClick={() => handleTestFemaleVoice()}
              disabled={isPlayingTest}
              className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm whitespace-nowrap ${
                isPlayingTest
                  ? 'bg-pink-600 text-white animate-pulse'
                  : 'bg-neutral-800 text-pink-300 hover:bg-pink-600/20 hover:text-pink-200 border border-pink-500/30'
              }`}
              title="Click to test warm female voice greeting"
            >
              <Volume2 className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xs:inline sm:inline">{isPlayingTest ? 'Playing...' : 'Test Sound'}</span>
            </button>
          </div>

          {/* Voice Persona Selector Popover */}
          {showVoicePopover && (
            <div className="absolute top-full mt-2 right-0 sm:left-0 w-[min(320px,calc(100vw-24px))] bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl p-4 text-xs z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
                <div className="flex items-center space-x-1.5 text-pink-400 font-bold">
                  <Sparkles className="w-4 h-4" />
                  <span>Select Female Voice Sound</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVoicePopover(false)}
                  className="text-neutral-400 hover:text-white text-xs px-1"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2 py-3">
                {FEMALE_PERSONAS.map(p => {
                  const isSelected = p.id === selectedPersonaId;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelectPersona(p.id)}
                      className={`p-2.5 rounded-xl border cursor-pointer transition flex items-start justify-between ${
                        isSelected
                          ? 'bg-pink-950/40 border-pink-500/60 text-white'
                          : 'bg-neutral-950/60 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-white text-xs">{p.name}</span>
                          <span className="text-[9px] font-semibold bg-neutral-800 px-1.5 py-0.5 rounded text-pink-300 border border-neutral-700">
                            {p.accent}
                          </span>
                        </div>
                        <p className="text-[10px] text-neutral-400 leading-relaxed">{p.description}</p>
                      </div>

                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleSelectPersona(p.id);
                          handleTestFemaleVoice();
                        }}
                        className="ml-2 p-1.5 rounded-lg bg-neutral-800 hover:bg-pink-600 hover:text-white text-pink-300 transition"
                        title="Preview this voice"
                      >
                        <Play className="w-3 h-3 fill-current" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Pitch Warmth Fine-tuning */}
              <div className="pt-2 border-t border-neutral-800 space-y-2">
                <div className="flex justify-between items-center text-[10px] text-neutral-400">
                  <span className="font-semibold text-neutral-300">Natural Pitch & Warmth:</span>
                  <span className="text-pink-400 font-bold">Female Harmonic Register</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      globalAudioManager.userPitchMultiplier = 1.0;
                      handleTestFemaleVoice('Here is the natural balanced female tone.');
                    }}
                    className="flex-1 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[10px] font-semibold text-neutral-200 border border-neutral-700 text-center"
                  >
                    Warm Natural
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      globalAudioManager.userPitchMultiplier = 1.08;
                      handleTestFemaleVoice('Here is the bright and energetic tone.');
                    }}
                    className="flex-1 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[10px] font-semibold text-neutral-200 border border-neutral-700 text-center"
                  >
                    Bright & Friendly
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      globalAudioManager.userPitchMultiplier = 0.94;
                      handleTestFemaleVoice('Here is the calm and soothing tone.');
                    }}
                    className="flex-1 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[10px] font-semibold text-neutral-200 border border-neutral-700 text-center"
                  >
                    Soft & Calm
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right controls: Inactivity timer, Test runner, Architecture & Admin */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
        {/* Inactivity Watchdog Badge */}
        <div
          className={`flex items-center space-x-1 px-2 py-1 rounded-xl border text-[11px] sm:text-xs font-medium whitespace-nowrap shrink-0 ${
            inactivitySecondsRemaining <= 15
              ? 'bg-red-500/20 border-red-500/40 text-red-300 animate-pulse'
              : 'bg-neutral-800/70 border-neutral-700 text-neutral-300'
          }`}
          title="Watchdog auto-resets kiosk after 45s of silence"
        >
          <Clock className="w-3 h-3 text-neutral-400 shrink-0" />
          <span className="tabular-nums">{inactivitySecondsRemaining}s</span>
        </div>

        {/* Microphone Acoustic & Frequency Tuning Button */}
        <button
          onClick={onOpenMicSettings}
          className="flex items-center space-x-1 px-2 py-1 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30 transition text-[11px] sm:text-xs font-semibold shadow-sm whitespace-nowrap shrink-0"
          title="Tune microphone frequency bandpass, sensitivity, and response speed"
        >
          <Sliders className="w-3 h-3 text-emerald-400 shrink-0" />
          <span>Mic Tuning</span>
        </button>

        {/* Voice RCA Diagnostics Button */}
        <button
          onClick={onOpenVoiceRCA}
          className="flex items-center space-x-1 px-2 py-1 rounded-xl bg-orange-600/20 border border-orange-500/40 text-orange-300 hover:bg-orange-600/30 transition text-[11px] sm:text-xs font-semibold shadow-sm whitespace-nowrap shrink-0"
          title="Open Voice RCA & Live Audio Diagnostics"
        >
          <Activity className="w-3 h-3 text-orange-400 shrink-0" />
          <span>RCA</span>
        </button>

        {/* 30-Scenario Test Runner Button */}
        <button
          onClick={onOpenTestRunner}
          className="hidden sm:flex items-center space-x-1 px-2 py-1 rounded-xl bg-purple-600/20 border border-purple-500/40 text-purple-300 hover:bg-purple-600/30 transition text-[11px] sm:text-xs font-semibold shadow-sm whitespace-nowrap shrink-0"
          title="Run official 30 scripted dialogue test scenarios"
        >
          <Terminal className="w-3 h-3 text-purple-400 shrink-0" />
          <span>Tests</span>
        </button>

        {/* Architecture Spec Button */}
        <button
          onClick={onOpenArchitecture}
          className="hidden md:flex items-center space-x-1 px-2 py-1 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 transition text-[11px] sm:text-xs font-medium whitespace-nowrap shrink-0"
          title="View Gemini Live API Verification & Architecture Spec"
        >
          <BookOpen className="w-3 h-3 text-neutral-400 shrink-0" />
          <span>Specs</span>
        </button>

        {/* Admin PIN dialog */}
        <button
          onClick={onOpenAdmin}
          className="p-1.5 sm:p-2 rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-white hover:bg-neutral-700 transition shrink-0"
          title="Kiosk Admin Lock (PIN)"
        >
          <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    </header>
  );
};
