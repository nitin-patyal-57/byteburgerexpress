/**
 * Centralized Real-time Diagnostics & Logging System for ByteBurger Express APK
 * Tracks Audio pipeline, Gemini Cloud API calls, NLU intent matches, and system errors.
 */

export type LogLevel = 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';
export type LogCategory = 'GEMINI' | 'MIC' | 'NLU' | 'CART' | 'SYSTEM' | 'ERROR';

export interface ApkLogEntry {
  id: string;
  timestamp: string;
  timeStr: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  details?: any;
}

const MAX_LOGS = 300;
const STORAGE_KEY = 'byteburger_live_apk_logs';

class ApkLoggerService {
  private logs: ApkLogEntry[] = [];
  private listeners: Set<(logs: ApkLogEntry[]) => void> = new Set();

  constructor() {
    this.loadPersistedLogs();
    this.hookGlobalErrors();
    this.info('SYSTEM', 'ByteBurger Express logging initialized');
  }

  private loadPersistedLogs() {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.logs = parsed.slice(-MAX_LOGS);
        }
      }
    } catch {
      this.logs = [];
    }
  }

  private persistLogs() {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs.slice(-60)));
    } catch {}
  }

  private hookGlobalErrors() {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
      this.error('ERROR', `Global Error: ${event.message}`, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.error('ERROR', `Unhandled Promise Rejection: ${event.reason?.message || event.reason}`, {
        reason: event.reason,
      });
    });
  }

  private createTimeStr(): string {
    const d = new Date();
    const pad = (n: number, z = 2) => String(n).padStart(z, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  }

  public log(level: LogLevel, category: LogCategory, message: string, details?: any) {
    const entry: ApkLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      timeStr: this.createTimeStr(),
      level,
      category,
      message,
      details,
    };

    this.logs.push(entry);
    if (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }

    this.persistLogs();
    this.notify();

    // Mirror to standard browser console
    const consolePrefix = `[${entry.timeStr}][${category}]`;
    if (level === 'ERROR') {
      console.error(consolePrefix, message, details || '');
    } else if (level === 'WARN') {
      console.warn(consolePrefix, message, details || '');
    } else if (level === 'SUCCESS') {
      console.log(`%c${consolePrefix} ${message}`, 'color: #10b981; font-weight: bold;', details || '');
    } else {
      console.log(consolePrefix, message, details || '');
    }
  }

  public info(category: LogCategory, message: string, details?: any) {
    this.log('INFO', category, message, details);
  }

  public success(category: LogCategory, message: string, details?: any) {
    this.log('SUCCESS', category, message, details);
  }

  public warn(category: LogCategory, message: string, details?: any) {
    this.log('WARN', category, message, details);
  }

  public error(category: LogCategory, message: string, details?: any) {
    this.log('ERROR', category, message, details);
  }

  public getLogs(): ApkLogEntry[] {
    return [...this.logs];
  }

  public clear() {
    this.logs = [];
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
    this.info('SYSTEM', 'Log history cleared by operator');
    this.notify();
  }

  public subscribe(listener: (logs: ApkLogEntry[]) => void): () => void {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const current = [...this.logs];
    for (const listener of this.listeners) {
      try {
        listener(current);
      } catch (err) {
        console.error('Error in log listener:', err);
      }
    }
  }
}

export const apkLogger = new ApkLoggerService();
