import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import { OrderState } from '../types';
import {
  QrCode,
  CreditCard,
  Banknote,
  CheckCircle2,
  Clock,
  ArrowRight,
  X,
  ShieldCheck,
  Receipt,
  Sparkles,
} from 'lucide-react';

interface PaymentModalProps {
  orderState: OrderState;
  onPaymentSuccess: (kitchenToken: number, paymentMethod: string) => void;
  onOrderComplete: () => void;
  onClose: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  orderState,
  onPaymentSuccess,
  onOrderComplete,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'UPI_QR' | 'CARD_TERMINAL' | 'CASH_COUNTER'>(
    (orderState.paymentMethod as any) || 'UPI_QR'
  );
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(180);
  const [paidToken, setPaidToken] = useState<number | null>(null);
  const [autoClearSeconds, setAutoClearSeconds] = useState<number>(6);

  // Snapshot receipt details so they display cleanly during completion
  const receiptSnapshot = useRef({
    orderId: orderState.orderId,
    orderType: orderState.orderType,
    itemCount: orderState.itemCount,
    subtotalPaise: orderState.subtotalPaise,
    gstTaxPaise: orderState.gstTaxPaise,
    totalAmountPaise: orderState.totalAmountPaise,
  });

  const totalInr = (orderState.totalAmountPaise / 100).toFixed(2);
  const upiIntentUri = `upi://pay?pa=byteburger.kiosk@icici&pn=ByteBurgerQSR&am=${totalInr}&cu=INR&tr=${orderState.orderId}`;

  // Generate real QR code canvas
  useEffect(() => {
    QRCode.toDataURL(upiIntentUri, {
      width: 260,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then(url => setQrCodeDataUrl(url))
      .catch(err => console.error('Error generating QR:', err));
  }, [upiIntentUri]);

  // Countdown timer for payment timeout
  useEffect(() => {
    if (paidToken) return;
    const interval = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [paidToken]);

  // Automatic post-payment auto-clear timer (wipes previous order for next customer)
  useEffect(() => {
    if (!paidToken) return;
    const timer = setInterval(() => {
      setAutoClearSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onOrderComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [paidToken, onOrderComplete]);

  const handleSimulatePayment = (method: string) => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      const tokenNumber = Math.floor(Math.random() * 899) + 100;
      setPaidToken(tokenNumber);

      // Fire celebratory confetti!
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // ignore
      }

      onPaymentSuccess(tokenNumber, method);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 select-none">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl sm:rounded-3xl max-w-lg sm:max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950 shrink-0">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              Payment Gateway
            </span>
            <h2 className="text-base sm:text-xl font-black text-white mt-0.5 sm:mt-1">
              {paidToken ? 'Order Confirmed & Placed' : 'Select Payment Method'}
            </h2>
          </div>
          <button
            onClick={paidToken ? onOrderComplete : onClose}
            className="p-1.5 sm:p-2 rounded-full bg-neutral-800 text-neutral-400 hover:text-white transition"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {paidToken ? (
          /* Payment Success & Kitchen Token View */
          <div className="p-5 sm:p-8 text-center space-y-4 sm:space-y-6">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center mx-auto text-emerald-400 shadow-xl shadow-emerald-500/20 animate-bounce">
              <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10" />
            </div>

            <div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                Payment Authorized & Verified
              </span>
              <h3 className="text-2xl sm:text-4xl font-black text-white tracking-tight mt-1">
                Kitchen Token #{paidToken}
              </h3>
              <p className="text-xs text-neutral-400 mt-1 sm:mt-2">
                Order #{receiptSnapshot.current.orderId} • {receiptSnapshot.current.orderType === 'TAKEAWAY' ? 'Takeaway' : 'Dine-In'}
              </p>
            </div>

            {/* Receipt Summary Card */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3 sm:p-4 text-left space-y-1.5 sm:space-y-2 text-xs">
              <div className="flex justify-between text-neutral-400">
                <span>Items ({receiptSnapshot.current.itemCount} units)</span>
                <span className="text-white font-medium">₹{receiptSnapshot.current.subtotalPaise / 100}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>GST (5%)</span>
                <span className="text-white font-medium">₹{receiptSnapshot.current.gstTaxPaise / 100}</span>
              </div>
              <div className="pt-2 border-t border-neutral-800 flex justify-between font-bold text-white text-xs sm:text-sm">
                <span>Total Paid</span>
                <span className="text-amber-400">₹{receiptSnapshot.current.totalAmountPaise / 100}</span>
              </div>
            </div>

            <p className="text-[11px] sm:text-xs text-neutral-400">
              Please watch the overhead order display screen. Your food is being prepared!
            </p>

            <button
              onClick={onOrderComplete}
              className="w-full py-3 sm:py-4 rounded-xl sm:rounded-2xl bg-amber-500 text-neutral-950 font-extrabold text-xs sm:text-sm hover:bg-amber-400 transition shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-2"
            >
              <span>Start Next Customer Order</span>
              <span className="text-[11px] bg-neutral-950/20 px-2.5 py-0.5 rounded-full font-bold">
                Auto-clearing in {autoClearSeconds}s
              </span>
            </button>
          </div>
        ) : (
          /* Payment Methods Selection */
          <div className="p-3.5 sm:p-6 space-y-3.5 sm:space-y-5">
            {/* Total Amount Banner */}
            <div className="bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950 p-3 sm:p-4 rounded-2xl border border-neutral-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] sm:text-[11px] text-neutral-400 uppercase font-semibold">
                  Authoritative Amount
                </span>
                <div className="text-2xl sm:text-3xl font-black text-white">₹{totalInr}</div>
              </div>
              <div className="flex items-center space-x-1.5 text-[11px] sm:text-xs text-neutral-400 bg-neutral-800/80 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  Expires in {Math.floor(secondsRemaining / 60)}:
                  {String(secondsRemaining % 60).padStart(2, '0')}
                </span>
              </div>
            </div>

            {/* Method Tabs */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 bg-neutral-950 p-1 sm:p-1.5 rounded-2xl border border-neutral-800">
              <button
                type="button"
                onClick={() => setActiveTab('UPI_QR')}
                className={`py-2 sm:py-2.5 px-2 sm:px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 sm:space-x-2 ${
                  activeTab === 'UPI_QR'
                    ? 'bg-amber-500 text-neutral-950 shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>UPI QR</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('CARD_TERMINAL')}
                className={`py-2 sm:py-2.5 px-2 sm:px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 sm:space-x-2 ${
                  activeTab === 'CARD_TERMINAL'
                    ? 'bg-amber-500 text-neutral-950 shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">Terminal</span>
                <span className="xs:hidden">Card</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('CASH_COUNTER')}
                className={`py-2 sm:py-2.5 px-2 sm:px-3 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 sm:space-x-2 ${
                  activeTab === 'CASH_COUNTER'
                    ? 'bg-amber-500 text-neutral-950 shadow-md'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                <Banknote className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Cash Desk</span>
              </button>
            </div>

            {/* Tab Contents */}
            {activeTab === 'UPI_QR' && (
              <div className="flex flex-col items-center text-center space-y-3 sm:space-y-4">
                <div className="bg-white p-2.5 sm:p-3 rounded-2xl shadow-xl border border-neutral-200">
                  {qrCodeDataUrl ? (
                    <img src={qrCodeDataUrl} alt="NPCI UPI QR Code" className="w-40 h-40 sm:w-48 sm:h-48 object-contain" />
                  ) : (
                    <div className="w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center text-neutral-400 text-xs">
                      Generating QR...
                    </div>
                  )}
                </div>

                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-white">
                    Scan with any UPI App (GPay, PhonePe, Paytm, CRED)
                  </p>
                  <p className="text-[10px] sm:text-[11px] text-neutral-400 font-mono">
                    VPA: byteburger.kiosk@icici
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleSimulatePayment('UPI_QR')}
                  disabled={isProcessing}
                  className="w-full py-3 rounded-xl sm:rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/30"
                >
                  {isProcessing ? (
                    <span>Verifying with NPCI Gateway...</span>
                  ) : (
                    <>
                      <span>Simulate Customer Phone Scan & Pay</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}

            {activeTab === 'CARD_TERMINAL' && (
              <div className="flex flex-col items-center text-center space-y-5 py-4">
                <div className="w-32 h-44 rounded-2xl bg-neutral-950 border-2 border-neutral-700 flex flex-col justify-between p-3 shadow-inner relative">
                  <div className="w-full h-8 bg-neutral-800 rounded-md flex items-center justify-center text-[10px] font-mono text-emerald-400 border border-neutral-700">
                    INSERT / TAP CARD
                  </div>
                  <div className="w-8 h-6 bg-amber-400/80 rounded mx-auto border border-amber-600" />
                  <div className="grid grid-cols-3 gap-1">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0, '#'].map(k => (
                      <div
                        key={k}
                        className="h-3 rounded bg-neutral-800 text-[8px] flex items-center justify-center text-neutral-400 font-bold"
                      >
                        {k}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-bold text-white">Attached Verifone / Pax POS Terminal</p>
                  <p className="text-[11px] text-neutral-400">
                    Please tap or insert your Credit/Debit Card into the reader below the screen.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleSimulatePayment('CARD_TERMINAL')}
                  disabled={isProcessing}
                  className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/30"
                >
                  {isProcessing ? (
                    <span>Contacting Banking Terminal...</span>
                  ) : (
                    <>
                      <span>Simulate Card Tap & Auth Approval</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            )}

            {activeTab === 'CASH_COUNTER' && (
              <div className="flex flex-col items-center text-center space-y-5 py-4">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Receipt className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-bold text-white">Pay Cash at Counter #1</p>
                  <p className="text-[11px] text-neutral-400 max-w-sm">
                    A cash payment voucher will be printed. Present it to the cashier counter to complete your order.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleSimulatePayment('CASH_COUNTER')}
                  disabled={isProcessing}
                  className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-extrabold text-xs transition flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20"
                >
                  {isProcessing ? <span>Printing Slip...</span> : <span>Print Cash Slip & Notify Counter</span>}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
