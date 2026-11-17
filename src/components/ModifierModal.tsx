import React, { useState } from 'react';
import { MenuItem, ModifierOption } from '../types';
import { X, Plus, Minus, Check, Flame } from 'lucide-react';

interface ModifierModalProps {
  item: MenuItem;
  onClose: () => void;
  onAddToCart: (item: MenuItem, quantity: number, modifiers: ModifierOption[]) => void;
}

export const ModifierModal: React.FC<ModifierModalProps> = ({ item, onClose, onAddToCart }) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<ModifierOption[]>([]);

  const toggleModifier = (option: ModifierOption) => {
    if (selectedModifiers.some(m => m.id === option.id)) {
      setSelectedModifiers(selectedModifiers.filter(m => m.id !== option.id));
    } else {
      setSelectedModifiers([...selectedModifiers, option]);
    }
  };

  const modTotalPaise = selectedModifiers.reduce((acc, m) => acc + m.priceDeltaPaise, 0);
  const unitPricePaise = item.basePricePaise + modTotalPaise;
  const totalPricePaise = unitPricePaise * quantity;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl sm:rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="relative h-28 sm:h-36 w-full bg-neutral-950 overflow-hidden shrink-0">
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt={item.nameEn}
              className="w-full h-full object-cover opacity-80"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/40 to-transparent" />

          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/50 text-white hover:bg-black/80 transition"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="absolute bottom-2.5 left-4 right-4">
            <div className="flex items-center space-x-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full border-2 ${
                  item.isVeg ? 'border-emerald-500 bg-emerald-500' : 'border-rose-500 bg-rose-500'
                }`}
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-300">
                {item.isVeg ? 'Pure Veg' : 'Non-Veg'} • {item.calories} kcal
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white mt-0.5">{item.nameEn}</h2>
            <p className="text-[11px] text-neutral-400 font-medium">{item.nameHi}</p>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-3.5 sm:p-5 overflow-y-auto space-y-3.5 sm:space-y-4 flex-1">
          <p className="text-xs text-neutral-300 leading-relaxed">{item.description}</p>

          {/* Modifier Groups */}
          {item.availableModifiers && item.availableModifiers.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Customize Burger
                </h3>
                <span className="text-[11px] text-neutral-400">Select any</span>
              </div>

              <div className="space-y-2">
                {item.availableModifiers[0]?.options.map(opt => {
                  const isSelected = selectedModifiers.some(m => m.id === opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleModifier(opt)}
                      className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition text-left ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500 text-white'
                          : 'bg-neutral-800/60 border-neutral-700/80 text-neutral-300 hover:bg-neutral-800'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-5 h-5 rounded-lg border flex items-center justify-center ${
                            isSelected
                              ? 'bg-amber-500 border-amber-500 text-black'
                              : 'border-neutral-600 bg-neutral-900'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-white">{opt.nameEn}</div>
                          <div className="text-[10px] text-neutral-400">{opt.nameHi}</div>
                        </div>
                      </div>

                      <span className="text-xs font-bold text-amber-400">
                        {opt.priceDeltaPaise > 0 ? `+₹${opt.priceDeltaPaise / 100}` : 'Free'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quantity Selector */}
          <div className="flex items-center justify-between bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
            <div>
              <span className="text-xs font-bold text-white">Quantity</span>
              <p className="text-[10px] text-neutral-400">Max 20 units per item</p>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-9 h-9 rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 flex items-center justify-center transition"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="text-base font-bold text-white w-6 text-center">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(Math.min(20, quantity + 1))}
                className="w-9 h-9 rounded-xl bg-neutral-800 text-white hover:bg-neutral-700 flex items-center justify-center transition"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 sm:p-4 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between shrink-0">
          <div>
            <div className="text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
              Total to add
            </div>
            <div className="text-xl sm:text-2xl font-black text-white">₹{totalPricePaise / 100}</div>
          </div>

          <button
            type="button"
            onClick={() => {
              onAddToCart(item, quantity, selectedModifiers);
              onClose();
            }}
            className="px-6 sm:px-8 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 text-neutral-950 font-extrabold text-xs sm:text-sm hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-orange-600/30 transition active:scale-95"
          >
            Add to Tray • ₹{totalPricePaise / 100}
          </button>
        </div>
      </div>
    </div>
  );
};
