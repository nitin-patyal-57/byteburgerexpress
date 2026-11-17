import React from 'react';
import { OrderState, OrderType } from '../types';
import {
  Trash2,
  Plus,
  Minus,
  UtensilsCrossed,
  ShoppingBag,
  RotateCcw,
  CheckCircle2,
  Receipt,
  Sparkles,
  X,
} from 'lucide-react';

interface CartSidebarProps {
  orderState: OrderState;
  onUpdateQuantity: (lineId: string, qty: number) => void;
  onRemoveItem: (lineId: string) => void;
  onSetOrderType: (type: OrderType) => void;
  onConfirmOrder: () => void;
  onCancelOrder: () => void;
  onUndo: () => void;
  onCloseMobile?: () => void;
}

export const CartSidebar: React.FC<CartSidebarProps> = ({
  orderState,
  onUpdateQuantity,
  onRemoveItem,
  onSetOrderType,
  onConfirmOrder,
  onCancelOrder,
  onUndo,
  onCloseMobile,
}) => {
  const isCartEmpty = orderState.items.length === 0;

  return (
    <aside className="w-full h-full bg-neutral-900 border-l border-neutral-800 flex flex-col justify-between shadow-2xl select-none">
      {/* Sidebar Header: Order ID & Dine-in/Takeaway toggle */}
      <div className="p-3 sm:p-4 border-b border-neutral-800 space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-1.5">
              <Receipt className="w-3.5 h-3.5 text-amber-400" />
              <h2 className="text-sm sm:text-base font-extrabold text-white">Your Tray</h2>
            </div>
            <span className="text-[10px] font-mono text-neutral-400">{orderState.orderId}</span>
          </div>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={onUndo}
              title="Undo last action"
              className="px-2 py-1.5 rounded-xl bg-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-700 transition flex items-center space-x-1 text-[11px]"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Undo</span>
            </button>

            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close tray drawer"
                className="p-1.5 rounded-xl bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Dine-In vs Takeaway Toggle */}
        <div className="grid grid-cols-2 gap-1.5 bg-neutral-950 p-1 rounded-xl border border-neutral-800">
          <button
            type="button"
            onClick={() => onSetOrderType('DINE_IN')}
            className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1 ${
              orderState.orderType === 'DINE_IN'
                ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <UtensilsCrossed className="w-3 h-3" />
            <span>Dine-In</span>
          </button>

          <button
            type="button"
            onClick={() => onSetOrderType('TAKEAWAY')}
            className={`py-1.5 px-2.5 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1 ${
              orderState.orderType === 'TAKEAWAY'
                ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-3 h-3" />
            <span>Takeaway</span>
          </button>
        </div>
      </div>

      {/* Cart Items List */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-3.5 space-y-2">
        {isCartEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-500 space-y-3">
            <div className="w-16 h-16 rounded-3xl bg-neutral-950 border border-neutral-800 flex items-center justify-center">
              <ShoppingBag className="w-8 h-8 text-neutral-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-neutral-400">Your tray is empty</p>
              <p className="text-xs text-neutral-500 mt-1 max-w-[200px]">
                Speak to order or tap any burger or drink to get started.
              </p>
            </div>
          </div>
        ) : (
          orderState.items.map(line => {
            const isHighlighted = line.lineId === orderState.highlightedLineId;

            return (
              <div
                key={line.lineId}
                className={`p-3.5 rounded-2xl border transition-all duration-300 ${
                  isHighlighted
                    ? 'bg-amber-500/10 border-amber-500/80 shadow-lg shadow-amber-500/10'
                    : 'bg-neutral-950/80 border-neutral-800/90'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center space-x-1.5">
                      <span
                        className={`w-2.5 h-2.5 rounded-sm border ${
                          line.menuItem.isVeg
                            ? 'border-emerald-500 bg-emerald-500'
                            : 'border-rose-500 bg-rose-500'
                        }`}
                      />
                      <h4 className="text-xs font-bold text-white line-clamp-1">
                        {line.menuItem.nameEn}
                      </h4>
                    </div>

                    {/* Modifiers Pill List */}
                    {line.selectedModifiers && line.selectedModifiers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {line.selectedModifiers.map(mod => (
                          <span
                            key={mod.id}
                            className="text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded-md border border-neutral-700"
                          >
                            +{mod.nameEn}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Combo Upgrade Pill */}
                    {line.isComboMeal && (
                      <div className="mt-1 flex items-center space-x-1 text-[10px] font-bold text-orange-400 bg-orange-950/60 border border-orange-800/80 px-2 py-0.5 rounded-md inline-flex">
                        <Sparkles className="w-3 h-3 text-orange-400" />
                        <span>Combo (+₹79): Fries + {line.comboDrinkItem?.nameEn || 'Coke'}</span>
                      </div>
                    )}

                    <div className="text-[11px] text-neutral-400 mt-1">
                      ₹{line.unitPricePaise / 100} × {line.quantity}
                    </div>
                  </div>

                  {/* Line Total & Delete */}
                  <div className="flex flex-col items-end space-y-1">
                    <span className="text-sm font-extrabold text-white">
                      ₹{line.subtotalPaise / 100}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(line.lineId)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-neutral-900 transition"
                      title="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Quantity Stepper */}
                <div className="mt-2.5 pt-2 border-t border-neutral-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-neutral-400 font-medium">Quantity</span>
                  <div className="flex items-center space-x-2 bg-neutral-900 border border-neutral-800 rounded-xl px-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(line.lineId, line.quantity - 1)}
                      className="w-7 h-7 rounded-lg bg-neutral-800 text-neutral-200 hover:text-white active:scale-95 flex items-center justify-center transition"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-bold text-white w-6 text-center">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(line.lineId, line.quantity + 1)}
                      className="w-7 h-7 rounded-lg bg-neutral-800 text-neutral-200 hover:text-white active:scale-95 flex items-center justify-center transition"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bill & Authoritative Totals */}
      <div className="p-3 sm:p-4 border-t border-neutral-800 bg-neutral-950 space-y-2.5">
        {/* Authoritative pricing */}
        <div className="space-y-1 text-xs">
          <div className="flex justify-between text-neutral-400">
            <span>Subtotal ({orderState.itemCount} items)</span>
            <span>₹{orderState.subtotalPaise / 100}</span>
          </div>
          <div className="flex justify-between text-neutral-400">
            <span>GST (5% QSR Service Tax)</span>
            <span>₹{orderState.gstTaxPaise / 100}</span>
          </div>
          <div className="pt-1.5 border-t border-neutral-800 flex justify-between items-baseline">
            <span className="text-xs sm:text-sm font-bold text-white">Total to Pay</span>
            <span className="text-xl sm:text-2xl font-black text-amber-400">
              ₹{orderState.totalAmountPaise / 100}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => {
              if (onCloseMobile) onCloseMobile();
              onConfirmOrder();
            }}
            disabled={isCartEmpty}
            className={`w-full py-2.5 sm:py-3 px-3 sm:px-4 rounded-xl sm:rounded-2xl font-extrabold text-xs sm:text-sm transition flex items-center justify-center space-x-2 shadow-lg ${
              isCartEmpty
                ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 active:scale-98'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
            <span>Confirm & Pay (Voice or Tap)</span>
          </button>

          <button
            type="button"
            onClick={onCancelOrder}
            className="w-full py-1.5 sm:py-2 px-3 rounded-lg sm:rounded-xl border border-neutral-800 text-neutral-400 hover:text-red-400 hover:border-red-500/30 transition text-[11px] sm:text-xs font-semibold"
          >
            Cancel / Clear Tray
          </button>
        </div>
      </div>
    </aside>
  );
};
