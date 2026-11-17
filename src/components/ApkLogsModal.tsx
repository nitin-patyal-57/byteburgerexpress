import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Terminal,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  Sparkles,
  Mic,
  ShoppingCart,
  Filter,
  ArrowDown,
  Info,
} from 'lucide-react';
import { apkLogger, ApkLogEntry, LogCategory } from '../utils/apkLogger';
import { getGeminiApiKey } from '../config';

interface ApkLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ApkLogsModal: React.FC<ApkLogsModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<ApkLogEntry[]>([]);
  const [activeCategory, setActiveCategory] = useState<LogCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = apkLogger.subscribe(updatedLogs => {
      setLogs([...updatedLogs]);
    });
    return () => unsubscribe();
  }, [isOpen]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  if (!isOpen) return null;

  const currentKey = getGeminiApiKey();
  const maskedKey = currentKey ? `${currentKey.slice(0, 8)}...${currentKey.slice(-6)}` : 'None Configured';

  const filteredLogs = logs.filter(log => {
    const matchesCategory = activeCategory === 'ALL' || log.category === activeCategory;
    const matchesSearch =
      !searchQuery ||
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleCopyLogs = () => {
    const formatted = logs
      .map(l => `[${l.timeStr}][${l.level}][${l.category}] ${l.message} ${l.details ? JSON.stringify(l.details) : ''}`)
      .join('\n');
    navigator.clipboard?.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCategoryBadge = (cat: LogCategory) => {
    switch (cat) {
      case 'GEMINI':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      case 'MIC':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'NLU':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'CART':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'ERROR':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse';
      default:
        return 'bg-neutral-800 text-neutral-300 border-neutral-700';
    }
  };

  const getLevelBorder = (level: string) => {
    switch (level) {
      case 'ERROR':
        return 'border-l-4 border-l-rose-500 bg-rose-950/20';
      case 'WARN':
        return 'border-l-4 border-l-amber-500 bg-amber-950/15';
      case 'SUCCESS':
        return 'border-l-4 border-l-emerald-500 bg-emerald-950/15';
      default:
        return 'border-l-4 border-l-neutral-700 bg-neutral-900/40';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md select-none animate-in fade-in duration-150">
      <div className="bg-neutral-900 border border-neutral-700 rounded-3xl max-w-4xl w-full h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header Bar */}
        <div className="px-4 sm:px-6 py-3 border-b border-neutral-800 bg-neutral-950 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm sm:text-base font-extrabold text-white">APK Live Diagnostics & Error Logs</h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-700">
                  {logs.length} Events
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 flex items-center space-x-2">
                <span>Active Key: <code className="text-amber-400 font-mono">{maskedKey}</code></span>
                <span>•</span>
                <span>Model: <code className="text-cyan-400">gemini-flash-latest</code></span>
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyLogs}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold transition border border-neutral-700"
              title="Copy entire log history to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Logs'}</span>
            </button>
            <button
              onClick={() => apkLogger.clear()}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-neutral-800 hover:bg-rose-950 text-neutral-400 hover:text-rose-300 text-xs font-semibold transition border border-neutral-700"
              title="Clear all logs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-neutral-800 bg-neutral-950/60 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
            {(['ALL', 'ERROR', 'GEMINI', 'MIC', 'NLU', 'CART'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition whitespace-nowrap border ${
                  activeCategory === cat
                    ? 'bg-cyan-500 text-neutral-950 border-cyan-400 shadow-sm'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800 hover:text-white'
                }`}
              >
                {cat === 'ALL' && 'All Logs'}
                {cat === 'ERROR' && '⚠️ Errors'}
                {cat === 'GEMINI' && '🤖 Gemini AI'}
                {cat === 'MIC' && '🎙️ Mic & VAD'}
                {cat === 'NLU' && '🧠 NLU Match'}
                {cat === 'CART' && '🛒 Cart Action'}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search in logs..."
              className="bg-neutral-900 border border-neutral-700 rounded-xl px-2.5 py-1 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-cyan-400 w-36 sm:w-48"
            />
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1.5 rounded-xl border transition ${
                autoScroll
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                  : 'bg-neutral-800 text-neutral-500 border-neutral-700'
              }`}
              title={autoScroll ? 'Auto-scroll is ON' : 'Auto-scroll is OFF'}
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Logs Viewer Stream */}
        <div className="flex-1 p-3 sm:p-5 overflow-y-auto font-mono text-xs space-y-1.5 bg-neutral-950/40">
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-500 space-y-2">
              <Terminal className="w-10 h-10 text-neutral-700" />
              <p className="font-semibold text-neutral-400">No logs found matching your filter</p>
              <p className="text-[11px] max-w-sm">
                Speak into the microphone, tap "Tap to Speak (5s)", or perform actions to see live real-time diagnostics here.
              </p>
            </div>
          ) : (
            filteredLogs.map(log => (
              <div
                key={log.id}
                className={`p-2.5 rounded-xl border border-neutral-800/80 space-y-1 transition hover:border-neutral-700 ${getLevelBorder(
                  log.level
                )}`}
              >
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center space-x-2">
                    <span className="text-neutral-500">{log.timeStr}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-black border uppercase tracking-wider ${getCategoryBadge(
                        log.category
                      )}`}
                    >
                      {log.category}
                    </span>
                    <span
                      className={`text-[10px] font-bold ${
                        log.level === 'ERROR'
                          ? 'text-rose-400'
                          : log.level === 'WARN'
                          ? 'text-amber-400'
                          : log.level === 'SUCCESS'
                          ? 'text-emerald-400'
                          : 'text-neutral-400'
                      }`}
                    >
                      {log.level}
                    </span>
                  </div>
                </div>

                <div className="text-neutral-200 leading-relaxed font-sans text-xs break-words">
                  {log.message}
                </div>

                {log.details && (
                  <pre className="mt-1 p-2 rounded-lg bg-black/60 text-[10px] text-neutral-400 overflow-x-auto whitespace-pre-wrap font-mono border border-neutral-800">
                    {typeof log.details === 'string'
                      ? log.details
                      : JSON.stringify(log.details, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Footer Quick Status */}
        <div className="px-4 py-2 bg-neutral-950 border-t border-neutral-800 text-[11px] text-neutral-400 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Telemetry Active • Storing up to 300 events in memory</span>
          </div>
          <span className="text-neutral-500 text-[10px]">Tap "Copy Logs" if you need to share diagnostics</span>
        </div>
      </div>
    </div>
  );
};
