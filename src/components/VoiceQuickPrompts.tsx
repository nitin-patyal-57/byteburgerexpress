import React from 'react';
import { Mic, MicOff, Sparkles } from 'lucide-react';
import { VoiceState } from '../types';

interface VoiceQuickPromptsProps {
  onSendUtterance: (text: string) => void;
  voiceState: VoiceState;
  isMicActive: boolean;
  onToggleMic: () => void;
  volume: number;
}

export const VoiceQuickPrompts: React.FC<VoiceQuickPromptsProps> = ({
  onSendUtterance,
  voiceState,
  isMicActive,
  onToggleMic,
  volume,
}) => {
  const quickPrompts = [
    { label: '🍔 Double Cheese Burger', text: 'Add one double cheese burger' },
    { label: '🍟 Peri Peri Fries', text: 'Add one peri peri fries' },
    { label: '🥤 Thums Up', text: 'Add one Thums Up' },
    { label: '🥤 Chocolate Drink', text: 'Order one chocolate drink' },
    { label: '🍫 Belgian Shake', text: 'Order Belgian Chocolate shake' },
    { label: '🍨 McFlurry Oreo', text: 'Add one Oreo Sundae' },
    { label: '🥗 Pure Veg Options', text: 'Show all veg options' },
    { label: '🍗 Non-Veg Options', text: 'What are the non veg options?' },
    { label: '➕ Add 1 More', text: 'Add 1 more' },
    { label: '💳 Confirm & Pay', text: 'Confirm my order and generate UPI QR code.' },
  ];

  return (
    <div className="bg-neutral-950 border-t border-neutral-800 px-3 sm:px-6 py-2 flex items-center justify-between gap-2 lg:gap-4 select-none">
      {/* Row 1: Quick Prompts Chips Horizontal Scroll */}
      <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar flex-1 py-0.5">
        <div className="flex items-center space-x-1 text-[11px] font-bold text-amber-400 whitespace-nowrap pl-0.5 pr-1 flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Tap to Order:</span>
          <span className="sm:hidden">Try:</span>
        </div>

        {quickPrompts.map(p => (
          <button
            key={p.label}
            type="button"
            onClick={() => onSendUtterance(p.text)}
            className="px-2.5 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white active:bg-neutral-800 hover:bg-neutral-800 hover:border-neutral-700 transition text-[11px] font-medium whitespace-nowrap flex items-center space-x-1 flex-shrink-0"
          >
            <span>{p.label}</span>
          </button>
        ))}
      </div>

      {/* Dedicated Thumb-Zone Mic Controller Button (Zero typing inputs) */}
      <button
        type="button"
        onClick={onToggleMic}
        title={isMicActive ? 'Mic Active - Tap to Mute' : 'Start Voice Ordering'}
        className={`min-h-[42px] px-3.5 rounded-xl font-bold text-xs flex items-center space-x-2 transition flex-shrink-0 ${
          isMicActive
            ? 'bg-emerald-500 text-neutral-950 shadow-lg shadow-emerald-500/20'
            : 'bg-neutral-900 text-neutral-300 border border-neutral-800 hover:border-neutral-700 hover:text-white'
        }`}
      >
        {isMicActive ? (
          <>
            <Mic className="w-4 h-4 animate-pulse text-neutral-950" />
            <div className="flex items-center space-x-0.5">
              {[20, 50, 75, 40].map((h, i) => (
                <div
                  key={i}
                  className="w-0.5 bg-neutral-950 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, Math.min(14, (volume / 100) * h))}px`,
                  }}
                />
              ))}
            </div>
            <span className="font-bold text-xs">
              {voiceState === 'SPEAKING'
                ? 'Answering...'
                : voiceState === 'THINKING'
                ? 'Adding...'
                : 'Listening... (Speak order)'}
            </span>
          </>
        ) : (
          <>
            <MicOff className="w-4 h-4 text-neutral-400" />
            <span className="font-semibold text-xs">Tap to Speak</span>
          </>
        )}
      </button>
    </div>
  );
};
