import React, { useEffect, useRef } from 'react';
import { TranscriptEntry } from '../types';
import { Zap, MessageSquare, Sparkles, Volume2, Mic } from 'lucide-react';

interface LiveCaptionsStripProps {
  transcripts: TranscriptEntry[];
  onTriggerBargeIn: () => void;
  onTapToSpeak?: () => void;
  tapToSpeakCountdown?: number | null;
  isSpeaking: boolean;
  interimText?: string;
}

export const LiveCaptionsStrip: React.FC<LiveCaptionsStripProps> = ({
  transcripts,
  onTriggerBargeIn,
  onTapToSpeak,
  tapToSpeakCountdown = null,
  isSpeaking,
  interimText,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const latestEntry = transcripts[transcripts.length - 1];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts, interimText]);

  return (
    <div className="bg-neutral-950/90 border border-neutral-800 rounded-2xl p-2.5 sm:p-3 shadow-lg flex items-center justify-between gap-2 sm:gap-4 select-none min-h-[48px] sm:min-h-[58px]">
      <div className="flex items-center space-x-2.5 sm:space-x-3 overflow-hidden flex-1">
        <div className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400">
          <MessageSquare className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
        </div>

        <div className="flex-1 overflow-hidden" ref={scrollRef}>
          {interimText ? (
            <div className="flex items-center gap-1.5 sm:space-x-2">
              <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-md flex items-center space-x-1 flex-shrink-0 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                <span>Listening...</span>
              </span>
              <p className="text-xs sm:text-sm font-semibold text-emerald-300 truncate">
                &ldquo;{interimText}&rdquo;
              </p>
            </div>
          ) : latestEntry ? (
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:space-x-2">
              <span
                className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-md flex items-center space-x-1 flex-shrink-0 ${
                  latestEntry.speaker === 'USER'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : latestEntry.speaker === 'ASSISTANT'
                    ? 'bg-pink-950/70 text-pink-300 border border-pink-800'
                    : 'bg-neutral-800 text-neutral-300'
                }`}
              >
                <span>{latestEntry.speaker === 'USER' ? 'Customer' : 'Ananya (Host)'}</span>
                {latestEntry.speaker === 'ASSISTANT' && isSpeaking && (
                  <Volume2 className="w-3 h-3 text-pink-400 animate-pulse" />
                )}
              </span>

              <p className="text-xs sm:text-sm font-medium text-white line-clamp-2 sm:truncate max-w-full sm:max-w-[550px]">
                {latestEntry.text}
              </p>

              {latestEntry.toolCalls && latestEntry.toolCalls.length > 0 && (
                <div className="hidden sm:flex items-center space-x-1 flex-shrink-0">
                  {latestEntry.toolCalls.map(tc => (
                    <span
                      key={tc.id}
                      className="text-[10px] bg-purple-950 text-purple-300 border border-purple-800 px-1.5 py-0.5 rounded font-mono"
                    >
                      {tc.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center space-x-2 text-[11px] sm:text-xs text-neutral-400">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin flex-shrink-0" />
              <span className="line-clamp-1 sm:line-clamp-none">
                Say aloud: &quot;Bhai ek spicy paneer burger aur coke add kardo&quot; or tap items below
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        {/* Tap to Speak Button: Directly activates mic 5-second chunk with countdown & clear break */}
        {onTapToSpeak && !isSpeaking && (
          <button
            type="button"
            onClick={onTapToSpeak}
            disabled={tapToSpeakCountdown !== null}
            className={`flex-shrink-0 flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-black text-xs transition active:scale-95 ${
              tapToSpeakCountdown !== null
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/40 border border-rose-400 animate-pulse'
                : 'bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-md shadow-amber-500/25'
            }`}
            title="Tap to speak your food order (5-second chunk with break)"
          >
            <Mic className="w-3.5 h-3.5 fill-current animate-pulse" />
            {tapToSpeakCountdown !== null ? (
              <span>🔴 Recording: {tapToSpeakCountdown}s</span>
            ) : (
              <>
                <span className="hidden sm:inline">Tap to Speak (5s)</span>
                <span className="sm:hidden">Speak 5s</span>
              </>
            )}
          </button>
        )}

        {/* Barge-in Button: Demonstrates official sub-50ms hardware AudioTrack flush */}
        {isSpeaking && (
          <button
            onClick={onTriggerBargeIn}
            className="flex-shrink-0 flex items-center space-x-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-red-600/20 border border-red-500/40 text-red-300 hover:bg-red-600/30 transition text-[11px] sm:text-xs font-bold animate-pulse shadow-sm"
            title="Simulate customer speaking over the assistant (halts playback in < 40ms)"
          >
            <Zap className="w-3.5 h-3.5 text-red-400 fill-current" />
            <span className="hidden sm:inline">⚡ Barge In (&lt;50ms)</span>
            <span className="sm:hidden">Stop</span>
          </button>
        )}
      </div>
    </div>
  );
};
