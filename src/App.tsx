/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { globalOrderStore } from './core/orderReducer';
import { ToolExecutionEngine } from './core/toolExecutionEngine';
import { globalAudioManager } from './audio/audioManager';
import { getBackendBaseUrl } from './config';
import { parseDeterministicIntent, countMenuMatches } from './core/nluFallback';
import { normalizeQSRSpokenUtterance } from './core/acousticNormalizer';
import { SEED_MENU_ITEMS } from './data/seedMenu';
import {
  MenuItem,
  ModifierOption,
  OrderState,
  OrderType,
  Speaker,
  TranscriptEntry,
  VoiceState,
} from './types';
import { KioskHeader } from './components/KioskHeader';
import { LiveCaptionsStrip } from './components/LiveCaptionsStrip';
import { MenuGrid } from './components/MenuGrid';
import { CartSidebar } from './components/CartSidebar';
import { PaymentModal } from './components/PaymentModal';
import { StaffSummonsModal } from './components/StaffSummonsModal';
import { ScenarioTestRunnerModal } from './components/ScenarioTestRunnerModal';
import { ArchitectureSpecDrawer } from './components/ArchitectureSpecDrawer';
import { AdminPinDialog } from './components/AdminPinDialog';
import { VoiceQuickPrompts } from './components/VoiceQuickPrompts';
import { VoiceRCAModal } from './components/VoiceRCAModal';
import { MicSettingsModal } from './components/MicSettingsModal';
import { ApkLogsModal } from './components/ApkLogsModal';
import { apkLogger } from './utils/apkLogger';
import { ShoppingBag, CheckCircle2, ChevronUp, ShieldAlert } from 'lucide-react';

export default function App() {
  const [orderState, setOrderState] = useState<OrderState>(globalOrderStore.getState());
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0);
  const [inactivityLimit, setInactivityLimit] = useState<number>(45);
  const [inactivitySeconds, setInactivitySeconds] = useState<number>(45);
  const [aecEnabled, setAecEnabled] = useState<boolean>(true);

  // Modals state
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [staffSummonsReason, setStaffSummonsReason] = useState<string | null>(null);
  const [showTestRunner, setShowTestRunner] = useState<boolean>(false);
  const [showArchitecture, setShowArchitecture] = useState<boolean>(false);
  const [showAdmin, setShowAdmin] = useState<boolean>(false);
  const [showVoiceRCA, setShowVoiceRCA] = useState<boolean>(false);
  const [showMicSettings, setShowMicSettings] = useState<boolean>(false);
  const [showApkLogs, setShowApkLogs] = useState<boolean>(false);
  const [showMobileCart, setShowMobileCart] = useState<boolean>(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [tapToSpeakSeconds, setTapToSpeakSeconds] = useState<number | null>(null);

  // Listen for Gemini API Key error notifications
  useEffect(() => {
    const handler = (e: any) => {
      setApiKeyError(e.detail ? String(e.detail) : null);
    };
    window.addEventListener('gemini_api_key_error', handler);
    return () => window.removeEventListener('gemini_api_key_error', handler);
  }, []);

  // Menu visual filter state (driven by voice commands or touch)
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [vegFilter, setVegFilter] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeFilterNotice, setActiveFilterNotice] = useState<string | null>(null);

  const toolEngineRef = useRef<ToolExecutionEngine>(new ToolExecutionEngine(globalOrderStore));
  const inactivityTimerRef = useRef<any>(null);
  const isMicActiveRef = useRef<boolean>(false);
  const processCustomerUtteranceRef = useRef<(text: string) => Promise<void>>(async () => {});

  useEffect(() => {
    isMicActiveRef.current = isMicActive;
  }, [isMicActive]);

  // Subscribe to deterministic Order Reducer
  useEffect(() => {
    const unsubscribe = globalOrderStore.subscribe(newState => {
      setOrderState(newState);
    });
    return () => unsubscribe();
  }, []);

  // Inactivity watchdog reset handler
  const resetInactivityTimer = useCallback(() => {
    setInactivitySeconds(inactivityLimit);
  }, [inactivityLimit]);

  // Inactivity countdown timer
  useEffect(() => {
    inactivityTimerRef.current = setInterval(() => {
      setInactivitySeconds(prev => {
        if (prev <= 1) {
          // Timeout reached: reset kiosk to attract state
          globalOrderStore.dispatch({ type: 'RESET_ORDER' });
          setShowPaymentModal(false);
          setStaffSummonsReason(null);
          return inactivityLimit;
        }

        // Warning prompt at 10s remaining (after 35s silence)
        if (prev === 10 && globalOrderStore.getState().items.length > 0) {
          globalAudioManager.speak('Do you need more time to complete your order?');
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(inactivityTimerRef.current);
  }, [inactivityLimit]);

  // Track real-time audio volume
  useEffect(() => {
    if (!isMicActive) return;
    const interval = setInterval(() => {
      const data = globalAudioManager.getVisualizerData();
      setVolume(data.volume);
    }, 80);
    return () => clearInterval(interval);
  }, [isMicActive]);

  // Core Voice Turn Execution Pipeline
  const processCustomerUtterance = async (customerText: string) => {
    const rawClean = (customerText || '').trim();
    if (!rawClean) return;

    // Apply phonetic STT acoustic normalizer (e.g. 'filter all Vijay items' -> 'filter all veg items')
    const normalizedText = normalizeQSRSpokenUtterance(rawClean);

    resetInactivityTimer();

    // 1. Log customer transcript
    const userEntry: TranscriptEntry = {
      id: `usr_${Date.now()}`,
      speaker: 'USER',
      text: normalizedText !== rawClean ? `${normalizedText} (understood from "${rawClean}")` : rawClean,
      timestampMs: Date.now(),
    };
    setTranscripts(prev => [...prev.slice(-15), userEntry]);
    setVoiceState('THINKING');

    try {
      // 2. High-speed intent analysis:
      // In standalone APK or local mode, execute local deterministic intent engine instantly in < 1ms!
      // If a dedicated remote backend URL is explicitly configured, call it with a strict 1.2s timeout.
      const currentOrder = globalOrderStore.getState();
      let data: any = null;
      const baseUrl = getBackendBaseUrl();

      if (baseUrl && baseUrl.startsWith('http')) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1200);
          const res = await fetch(`${baseUrl}/api/v1/voice/turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: normalizedText,
              orderState: currentOrder,
              history: transcripts.slice(-4),
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            data = await res.json();
          } else {
            data = parseDeterministicIntent(normalizedText, currentOrder);
          }
        } catch {
          data = parseDeterministicIntent(normalizedText, currentOrder);
        }
      } else {
        // Direct local ultra-fast NLU (< 1ms execution time)
        data = parseDeterministicIntent(normalizedText, currentOrder);
      }

      const toolCalls = data?.toolCalls || [];
      let finalReply = data?.reply || '';

      // 2a. Guardrail: If non-food background chatter was detected and filtered out:
      if (!finalReply && toolCalls.length === 0) {
        // Discard side chatter from transcripts to keep the screen pristine
        setTranscripts(prev => prev.filter(t => t.id !== userEntry.id));
        setVoiceState(isMicActiveRef.current ? 'LISTENING' : 'IDLE');
        setActiveFilterNotice('💬 Side conversation ignored — Ready for your food order');
        setTimeout(() => setActiveFilterNotice(null), 2500);
        globalAudioManager.resumeListening(0);
        return;
      }

      // 3. Execute deterministic tool calls locally on Reducer
      for (const tc of toolCalls) {
        const result = await toolEngineRef.current.execute(tc.name, tc.args);
        tc.result = result;
        apkLogger.success('CART', `Action executed: ${tc.name}`, tc.args);

        if (tc.name === 'call_staff') {
          setStaffSummonsReason(tc.args.reason || 'Customer allergen inquiry');
        } else if (tc.name === 'request_payment' || tc.name === 'confirm_order') {
          setShowPaymentModal(true);
        } else if (tc.name === 'filter_menu') {
          // Explicitly clear old search query so it never conflicts with new dietary filter
          setSearchQuery(tc.args.search_query || '');

          if (tc.args.veg_filter) {
            setVegFilter(tc.args.veg_filter);
          } else {
            setVegFilter('ALL');
          }

          if (tc.args.category) {
            setSelectedCategory(tc.args.category);
          } else {
            setSelectedCategory('All');
          }

          const noticeParts: string[] = [];
          if (tc.args.veg_filter === 'VEG') noticeParts.push('Pure Vegetarian Options');
          else if (tc.args.veg_filter === 'NON_VEG') noticeParts.push('Non-Vegetarian Options');
          if (tc.args.category && tc.args.category !== 'All') noticeParts.push(tc.args.category);
          if (tc.args.search_query) noticeParts.push(`Search: "${tc.args.search_query}"`);
          setActiveFilterNotice(noticeParts.length > 0 ? noticeParts.join(' • ') : null);
        } else if (tc.name === 'search_menu') {
          const rawQuery = String(tc.args.query || '').trim();
          const lower = rawQuery.toLowerCase();

          if (lower.includes('veg') && !lower.includes('non')) {
            setVegFilter('VEG');
            setSelectedCategory('All');
            setSearchQuery('');
            setActiveFilterNotice('Pure Vegetarian Options');
          } else if (lower.includes('non-veg') || lower.includes('non veg') || lower.includes('chicken')) {
            setVegFilter('NON_VEG');
            setSelectedCategory('All');
            setSearchQuery('');
            setActiveFilterNotice('Non-Vegetarian Options');
          } else if (
            lower.includes('drink') ||
            lower.includes('beverage') ||
            lower.includes('shake') ||
            lower.includes('coke') ||
            lower.includes('thums up') ||
            lower.includes('soda')
          ) {
            setVegFilter('ALL');
            setSelectedCategory('Beverages');
            setSearchQuery('');
            setActiveFilterNotice('Beverages');
          } else if (lower.includes('burger')) {
            setVegFilter('ALL');
            setSelectedCategory('Burgers');
            setSearchQuery('');
            setActiveFilterNotice('Burgers');
          } else if (lower.includes('fries') || lower.includes('side') || lower.includes('tide') || lower.includes('snack')) {
            setVegFilter('ALL');
            setSelectedCategory('Sides');
            setSearchQuery('');
            setActiveFilterNotice('Sides');
          } else if (lower.includes('dessert') || lower.includes('desert') || lower.includes('sweet') || lower.includes('brownie')) {
            setVegFilter('ALL');
            setSelectedCategory('Desserts');
            setSearchQuery('');
            setActiveFilterNotice('Desserts');
          } else {
            const cleanQuery = rawQuery
              .replace(/\b(search for|search|find|show me|show|options|option|items|item|menu|batao|dikhao|kya hai|please)\b/gi, '')
              .trim();
            const qToSearch = cleanQuery || rawQuery;
            const matches = countMenuMatches(qToSearch);

            if (matches === 0) {
              // 0 items matched: Do NOT show a blank screen! Ask for more!
              setSearchQuery('');
              setSelectedCategory('All');
              setVegFilter('ALL');
              setActiveFilterNotice(`No items matched "${qToSearch}" — Ask for Burgers, Sides, Drinks, or Desserts!`);
              finalReply = `I couldn't find any items matching "${qToSearch}". Would you like to check out our Burgers, Sides, Drinks, or Desserts instead?`;
            } else {
              setSearchQuery(qToSearch);
              setVegFilter('ALL');
              setSelectedCategory('All');
              setActiveFilterNotice(`Search: "${qToSearch}"`);
            }
          }
        }
      }

      // 4. Log assistant transcript
      const assistantEntry: TranscriptEntry = {
        id: `asst_${Date.now()}`,
        speaker: 'ASSISTANT',
        text: finalReply || (toolCalls.length > 0 ? 'Item added to your order.' : "I'm listening!"),
        timestampMs: Date.now(),
        toolCalls,
      };
      setTranscripts(prev => [...prev.slice(-15), assistantEntry]);

      // 5. Speak assistant response with TTS
      if (finalReply) {
        setVoiceState('SPEAKING');
        globalAudioManager.speak(finalReply, () => {
          // Assistant speech completed; audioManager will auto-resume listening in 1 second
          if (!isMicActiveRef.current && !globalAudioManager.getIsListening()) {
            setVoiceState('IDLE');
          }
        });
      } else {
        const keepListening = isMicActiveRef.current || globalAudioManager.getIsListening();
        if (keepListening) {
          setTimeout(() => {
            if (isMicActiveRef.current || globalAudioManager.getIsListening()) {
              globalAudioManager.resumeListening(0);
            }
          }, 200);
        } else {
          setVoiceState('IDLE');
        }
      }
    } catch (err) {
      console.warn('Recovered from voice processing error:', err);
      // Graceful fallback response
      const fallbackEntry: TranscriptEntry = {
        id: `asst_${Date.now()}`,
        speaker: 'ASSISTANT',
        text: 'I hear you! What would you like to add to your order?',
        timestampMs: Date.now(),
      };
      setTranscripts(prev => [...prev.slice(-15), fallbackEntry]);
      setVoiceState('SPEAKING');
      globalAudioManager.speak('I hear you! What would you like to add to your order?');
    }
  };

  processCustomerUtteranceRef.current = processCustomerUtterance;

  // Start microphone helper
  const startMic = async () => {
    isMicActiveRef.current = true;
    setIsMicActive(true);
    await globalAudioManager.startMicrophone(
      (text, isFinal) => {
        if (isFinal) {
          setInterimTranscript('');
          processCustomerUtteranceRef.current(text);
        } else {
          setInterimTranscript(text);
        }
      },
      () => {
        // Sub-40ms Customer Barge-in Interruption triggered!
        apkLogger.info('MIC', '⚡ Customer interrupted device: Assistant speech silenced instantly. Listening to customer...');
        setInterimTranscript('⚡ Interrupted — Listening to you...');
        setVoiceState('LISTENING');
      },
      newState => {
        setVoiceState(newState);
      }
    );
    setVoiceState('LISTENING');
    resetInactivityTimer();
  };

  // Toggle microphone
  const handleToggleMic = async () => {
    if (isMicActive) {
      isMicActiveRef.current = false;
      globalAudioManager.stopMicrophone();
      setIsMicActive(false);
      setInterimTranscript('');
      setVoiceState('IDLE');
    } else {
      await startMic();
    }
  };

  // Trigger manual barge-in test
  const handleTriggerBargeIn = () => {
    globalAudioManager.flushImmediate();
    setVoiceState(isMicActive ? 'LISTENING' : 'IDLE');
  };

  // Touch handlers: Add manually or ask by voice
  const handleQuickAdd = (item: MenuItem, qty: number, modifiers?: ModifierOption[]) => {
    resetInactivityTimer();
    globalOrderStore.dispatch({
      type: 'ADD_ITEM',
      item,
      quantity: qty,
      modifiers: modifiers || [],
    });

    // Per user requirement: after item added in cart, in 1s mic is turned on to hear order to add more items
    setTimeout(() => {
      if (!isMicActiveRef.current) {
        startMic();
      } else {
        setVoiceState('LISTENING');
        globalAudioManager.resumeListening(100);
      }
    }, 1000);
  };

  const handleUpdateQuantity = (lineId: string, newQty: number) => {
    resetInactivityTimer();
    globalOrderStore.dispatch({
      type: 'UPDATE_QUANTITY',
      lineId,
      newQuantity: newQty,
    });
  };

  const handleRemoveLine = (lineId: string) => {
    resetInactivityTimer();
    globalOrderStore.dispatch({
      type: 'REMOVE_ITEM',
      lineId,
    });
  };

  const handleSetOrderType = (type: OrderType) => {
    resetInactivityTimer();
    globalOrderStore.dispatch({
      type: 'SET_ORDER_TYPE',
      orderType: type,
    });
  };

  const handleConfirmOrder = () => {
    resetInactivityTimer();
    globalOrderStore.dispatch({ type: 'CONFIRM_ORDER' });
    setShowPaymentModal(true);
  };

  const handleCancelOrder = () => {
    resetInactivityTimer();
    globalOrderStore.dispatch({ type: 'RESET_ORDER' });
    setShowPaymentModal(false);
  };

  const handleUndo = () => {
    resetInactivityTimer();
    globalOrderStore.undo();
  };

  const handlePaymentSuccess = async (tokenNumber: number, paymentMethod: string) => {
    resetInactivityTimer();
    globalOrderStore.dispatch({
      type: 'MARK_PAID',
      kitchenOrderNumber: tokenNumber,
    });

    // Submit order to kitchen display system endpoint
    try {
      const baseUrl = getBackendBaseUrl();
      await fetch(`${baseUrl}/api/v1/orders/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: `idemp_${orderState.orderId}`,
          orderId: orderState.orderId,
          orderType: orderState.orderType,
          items: orderState.items,
          totalMinorUnits: orderState.totalAmountPaise,
          paymentMethod,
        }),
      });
    } catch {
      // ignore
    }
  };

  /**
   * Complete payment cycle and automatically clear previous customer's cart for the next customer
   */
  const handleOrderCompleteAndClear = () => {
    setShowPaymentModal(false);
    // 1. Reset order store completely to a blank tray
    globalOrderStore.dispatch({ type: 'RESET_ORDER' });
    apkLogger.info('CART', 'Order payment completed. Tray automatically cleared for next customer.');
    // 2. Clear transcripts and interim text
    setTranscripts([]);
    setInterimTranscript('');
    // 3. Reset visual category and dietary filters
    setSelectedCategory('All');
    setVegFilter('ALL');
    setSearchQuery('');
    setActiveFilterNotice(null);
    setStaffSummonsReason(null);
    setShowMobileCart(false);
    resetInactivityTimer();

    // 4. Voice greeting welcoming next customer & auto-resume microphone
    globalAudioManager.speak('Thank you! Welcome, what would you like to order today?', () => {
      if (isMicActiveRef.current) {
        globalAudioManager.resumeListening(0);
      }
    });
  };

  /**
   * Direct Tap-to-Speak trigger (Push-to-Talk for loud dining halls with 5-second chunk & break)
   */
  const handleTapToSpeak = async () => {
    resetInactivityTimer();
    if (!isMicActive) {
      await startMic();
    }
    globalAudioManager.tapToSpeak(5000, seconds => {
      setTapToSpeakSeconds(seconds);
    });
  };

  return (
    <div
      className="flex flex-col h-[100dvh] w-screen bg-neutral-950 text-neutral-100 overflow-hidden font-['Plus_Jakarta_Sans',sans-serif]"
      onPointerDown={resetInactivityTimer}
    >
      {/* Kiosk Header Bar */}
      <KioskHeader
        voiceState={voiceState}
        isMicActive={isMicActive}
        onToggleMic={handleToggleMic}
        inactivitySecondsRemaining={inactivitySeconds}
        onOpenAdmin={() => setShowAdmin(true)}
        onOpenArchitecture={() => setShowArchitecture(true)}
        onOpenTestRunner={() => setShowTestRunner(true)}
        onOpenVoiceRCA={() => setShowVoiceRCA(true)}
        onOpenMicSettings={() => setShowMicSettings(true)}
        onOpenApkLogs={() => setShowApkLogs(true)}
        hasAllergyAlert={!!staffSummonsReason}
      />

      {/* API Key Alert Banner */}
      {apiKeyError && (
        <div
          onClick={() => setShowMicSettings(true)}
          className="bg-rose-950/95 border-b border-rose-500/80 px-3 py-2 text-center text-xs font-bold text-white flex items-center justify-center space-x-2 cursor-pointer shadow-lg animate-pulse"
        >
          <ShieldAlert className="w-4 h-4 text-amber-300" />
          <span>{apiKeyError}</span>
          <span className="underline ml-2 bg-black/40 px-2 py-0.5 rounded text-[11px]">Tap to Fix in Mic Tuning</span>
        </div>
      )}

      {/* Main Kiosk Viewport: Side-by-side on all tablets/kiosks (md >= 768px), drawer on mobile */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative min-h-0">
        {/* Left Column: Menu Grid & Captions Strip */}
        <section className="w-full md:flex-1 flex flex-col h-full p-2 sm:p-3 md:p-3.5 overflow-hidden space-y-2 sm:space-y-2.5 min-w-0">
          {/* Live Captions Strip with Barge-in & Tap to Speak */}
          <LiveCaptionsStrip
            transcripts={transcripts}
            interimText={interimTranscript}
            onTriggerBargeIn={handleTriggerBargeIn}
            onTapToSpeak={handleTapToSpeak}
            tapToSpeakCountdown={tapToSpeakSeconds}
            isSpeaking={voiceState === 'SPEAKING'}
          />

          {/* Interactive 30-Item Menu Catalog */}
          <MenuGrid
            items={SEED_MENU_ITEMS}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            vegFilter={vegFilter}
            onSelectVegFilter={setVegFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeFilterNotice={activeFilterNotice}
            onClearFilters={() => {
              setSelectedCategory('All');
              setVegFilter('ALL');
              setSearchQuery('');
              setActiveFilterNotice(null);
            }}
            onQuickAdd={handleQuickAdd}
          />
        </section>

        {/* Right Column: Authoritative Cart & Payment Panel (Permanently visible on 10-inch tablets & desktop) */}
        <section className="hidden md:flex md:w-[310px] lg:w-[340px] xl:w-[380px] flex-shrink-0 h-full overflow-hidden border-l border-neutral-800">
          <CartSidebar
            orderState={orderState}
            onUpdateQuantity={handleUpdateQuantity}
            onRemoveItem={handleRemoveLine}
            onSetOrderType={handleSetOrderType}
            onConfirmOrder={handleConfirmOrder}
            onCancelOrder={handleCancelOrder}
            onUndo={handleUndo}
          />
        </section>
      </div>

      {/* Android Mobile Sticky Tray Bar (Only visible on small phones < 768px) */}
      <div className="md:hidden bg-neutral-900 border-t border-neutral-800 px-3 py-2 flex items-center justify-between gap-2 select-none flex-shrink-0">
        <button
          type="button"
          onClick={() => setShowMobileCart(true)}
          className="flex-1 flex items-center justify-between bg-neutral-950 border border-neutral-800 hover:border-amber-500/40 rounded-xl px-3 py-2 transition"
        >
          <div className="flex items-center space-x-2.5">
            <div className="relative w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShoppingBag className="w-4 h-4" />
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-neutral-950 font-black text-[10px] flex items-center justify-center">
                {orderState.itemCount}
              </span>
            </div>
            <div className="text-left">
              <div className="text-xs font-extrabold text-white flex items-center space-x-1">
                <span>View Tray ({orderState.itemCount} {orderState.itemCount === 1 ? 'item' : 'items'})</span>
                <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <div className="text-[11px] text-neutral-400">
                {orderState.items.length > 0
                  ? `${orderState.items.map(i => `${i.quantity}× ${i.menuItem.nameEn}`).join(', ').slice(0, 34)}...`
                  : 'Tap to inspect or edit quantities'}
              </div>
            </div>
          </div>

          <div className="text-right pl-2">
            <div className="text-sm font-black text-amber-400">
              ₹{orderState.totalAmountPaise / 100}
            </div>
            <div className="text-[9px] text-neutral-400 uppercase">Incl. GST</div>
          </div>
        </button>

        {orderState.items.length > 0 && (
          <button
            type="button"
            onClick={handleConfirmOrder}
            className="px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-xs flex items-center space-x-1.5 shadow-lg shadow-emerald-600/20 flex-shrink-0 transition"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Pay Now</span>
          </button>
        )}
      </div>

      {/* Slide-Up Mobile Cart Drawer (Android & Mobile Handsets) */}
      {showMobileCart && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-150">
          <div
            className="flex-1"
            onClick={() => setShowMobileCart(false)}
          />
          <div className="h-[82dvh] w-full bg-neutral-900 rounded-t-3xl overflow-hidden border-t border-neutral-700 shadow-2xl flex flex-col">
            <CartSidebar
              orderState={orderState}
              onUpdateQuantity={handleUpdateQuantity}
              onRemoveItem={handleRemoveLine}
              onSetOrderType={handleSetOrderType}
              onConfirmOrder={handleConfirmOrder}
              onCancelOrder={handleCancelOrder}
              onUndo={handleUndo}
              onCloseMobile={() => setShowMobileCart(false)}
            />
          </div>
        </div>
      )}

      {/* Bottom Voice Quick Prompts & Speech Waveform Bar */}
      <VoiceQuickPrompts
        onSendUtterance={processCustomerUtterance}
        voiceState={voiceState}
        isMicActive={isMicActive}
        onToggleMic={handleToggleMic}
        volume={volume}
      />

      {/* Payment Gateway Modal */}
      {showPaymentModal && (
        <PaymentModal
          orderState={orderState}
          onPaymentSuccess={handlePaymentSuccess}
          onOrderComplete={handleOrderCompleteAndClear}
          onClose={() => setShowPaymentModal(false)}
        />
      )}

      {/* Staff Summons Alert Modal (Allergen Rule 4) */}
      {staffSummonsReason && (
        <StaffSummonsModal
          reason={staffSummonsReason}
          onDismiss={() => setStaffSummonsReason(null)}
        />
      )}

      {/* 30 Scripted Dialogue Scenarios Test Suite Modal */}
      {showTestRunner && (
        <ScenarioTestRunnerModal
          onClose={() => setShowTestRunner(false)}
          onApplyStateToKiosk={state => {
            // Apply test result state to main kiosk for visual inspection
            setOrderState(state);
            setShowTestRunner(false);
          }}
        />
      )}

      {/* Architecture & Verification Specs Drawer */}
      {showArchitecture && (
        <ArchitectureSpecDrawer onClose={() => setShowArchitecture(false)} />
      )}

      {/* Kiosk Device Admin PIN Dialog */}
      {showAdmin && (
        <AdminPinDialog
          onClose={() => setShowAdmin(false)}
          onResetKiosk={() => {
            globalOrderStore.dispatch({ type: 'RESET_ORDER' });
            setShowPaymentModal(false);
            setStaffSummonsReason(null);
          }}
          aecEnabled={aecEnabled}
          onToggleAec={enabled => {
            setAecEnabled(enabled);
            globalAudioManager.aecEnabled = enabled;
          }}
          inactivityLimit={inactivityLimit}
          onChangeInactivityLimit={limit => {
            setInactivityLimit(limit);
            setInactivitySeconds(limit);
          }}
          onOpenMicSettings={() => setShowMicSettings(true)}
        />
      )}

      {/* Microphone Acoustic & Frequency Tuning Modal */}
      <MicSettingsModal
        isOpen={showMicSettings}
        onClose={() => setShowMicSettings(false)}
      />

      {/* APK Live Diagnostics & Error Logs Modal */}
      <ApkLogsModal
        isOpen={showApkLogs}
        onClose={() => setShowApkLogs(false)}
      />

      {/* Voice RCA & Health Diagnostics Modal */}
      <VoiceRCAModal
        isOpen={showVoiceRCA}
        onClose={() => setShowVoiceRCA(false)}
        onForceRestart={() => {
          globalAudioManager.scheduleRecognitionRestart('user_rca_modal_reset', 50);
        }}
      />
    </div>
  );
}
