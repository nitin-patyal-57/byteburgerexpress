import React from 'react';
import { AlertTriangle, UserCheck, PhoneCall, ShieldAlert, X } from 'lucide-react';

interface StaffSummonsModalProps {
  reason: string;
  onDismiss: () => void;
}

export const StaffSummonsModal: React.FC<StaffSummonsModalProps> = ({ reason, onDismiss }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 select-none">
      <div className="bg-neutral-900 border border-neutral-700 rounded-2xl sm:rounded-3xl max-w-md w-full max-h-[92vh] overflow-y-auto shadow-2xl p-4 sm:p-6 space-y-4 sm:space-y-6 animate-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <button
            onClick={onDismiss}
            className="p-2 rounded-full bg-neutral-800 text-neutral-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
            Safety & Assistance Protocol
          </span>
          <h3 className="text-xl font-black text-white">Restaurant Staff Summoned</h3>
          <p className="text-xs text-neutral-300 leading-relaxed">
            Per QSR safety protocol (Rule 4), our AI does not provide medical claims regarding severe allergens. A floor manager is approaching Kiosk #1 immediately to assist you.
          </p>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 space-y-2 text-xs">
          <div className="flex justify-between text-neutral-400">
            <span>Summons Reason</span>
            <span className="font-semibold text-rose-300">{reason}</span>
          </div>
          <div className="flex justify-between text-neutral-400">
            <span>Staff Priority</span>
            <span className="font-semibold text-amber-400">Urgent (Manager On-Duty)</span>
          </div>
          <div className="flex justify-between text-neutral-400">
            <span>Kiosk Location</span>
            <span className="text-white font-mono">Terminal 01 (Front Entrance)</span>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="w-full py-3.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs transition"
        >
          Staff Has Arrived / Dismiss Notice
        </button>
      </div>
    </div>
  );
};
