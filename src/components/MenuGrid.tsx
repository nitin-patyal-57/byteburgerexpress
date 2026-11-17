import React, { useState, useMemo } from 'react';
import { MenuItem, ModifierOption } from '../types';
import { Plus, SlidersHorizontal, Flame, Sparkles, AlertCircle } from 'lucide-react';
import { ModifierModal } from './ModifierModal';

interface MenuGridProps {
  items: MenuItem[];
  onQuickAdd: (item: MenuItem, quantity: number, modifiers?: ModifierOption[]) => void;
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
  vegFilter?: 'ALL' | 'VEG' | 'NON_VEG';
  onSelectVegFilter?: (filter: 'ALL' | 'VEG' | 'NON_VEG') => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  activeFilterNotice?: string | null;
  onClearFilters?: () => void;
}

export const MenuGrid: React.FC<MenuGridProps> = ({
  items,
  onQuickAdd,
  selectedCategory: propCategory,
  onSelectCategory: propOnSelectCategory,
  vegFilter: propVegFilter,
  onSelectVegFilter: propOnSelectVegFilter,
  searchQuery: propSearchQuery,
  onSearchChange: propOnSearchChange,
  activeFilterNotice,
  onClearFilters,
}) => {
  const [localCategory, setLocalCategory] = useState<string>('All');
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [localVegFilter, setLocalVegFilter] = useState<'ALL' | 'VEG' | 'NON_VEG'>('ALL');
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);

  const selectedCategory = propCategory !== undefined ? propCategory : localCategory;
  const setSelectedCategory = propOnSelectCategory || setLocalCategory;

  const vegFilter = propVegFilter !== undefined ? propVegFilter : localVegFilter;
  const setVegFilter = propOnSelectVegFilter || setLocalVegFilter;

  const searchQuery = propSearchQuery !== undefined ? propSearchQuery : localSearchQuery;
  const setSearchQuery = propOnSearchChange || setLocalSearchQuery;

  const categories = ['All', 'Burgers', 'Sides', 'Beverages', 'Desserts'];

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Category match
      if (selectedCategory !== 'All' && item.category !== selectedCategory) {
        return false;
      }
      // Veg filter match
      if (vegFilter === 'VEG' && !item.isVeg) return false;
      if (vegFilter === 'NON_VEG' && item.isVeg) return false;

      // Smart search match: understands dietary queries & cleans stop words
      if (searchQuery && searchQuery.trim()) {
        const rawQ = searchQuery.toLowerCase().trim();

        // 1. Dietary queries in search string
        if (rawQ === 'veg' || rawQ === 'vegetarian' || rawQ.includes('veg option') || rawQ.includes('all veg') || rawQ.includes('shakahari')) {
          return item.isVeg;
        }
        if (rawQ === 'non-veg' || rawQ === 'non veg' || rawQ === 'nonveg' || rawQ.includes('non veg option') || rawQ.includes('chicken option')) {
          return !item.isVeg;
        }

        // 2. Category synonyms in search query
        if (
          rawQ === 'drinks' ||
          rawQ === 'drink' ||
          rawQ === 'beverages' ||
          rawQ === 'beverage' ||
          rawQ === 'cold drinks' ||
          rawQ === 'cold drink' ||
          rawQ === 'shakes' ||
          rawQ === 'shake' ||
          rawQ === 'soft drinks' ||
          rawQ === 'soda'
        ) {
          return item.category === 'Beverages';
        }
        if (rawQ === 'burgers' || rawQ === 'burger') {
          return item.category === 'Burgers';
        }
        if (
          rawQ === 'sides' ||
          rawQ === 'side' ||
          rawQ === 'fries' ||
          rawQ === 'french fries' ||
          rawQ === 'tides' ||
          rawQ === 'tide' ||
          rawQ === 'tight' ||
          rawQ === 'tights' ||
          rawQ === 'sites' ||
          rawQ === 'slides'
        ) {
          return item.category === 'Sides';
        }
        if (
          rawQ === 'desserts' ||
          rawQ === 'dessert' ||
          rawQ === 'deserts' ||
          rawQ === 'desert' ||
          rawQ === 'dezert' ||
          rawQ === 'dezerts' ||
          rawQ === 'sweets' ||
          rawQ === 'sweet' ||
          rawQ === 'meetha'
        ) {
          return item.category === 'Desserts';
        }

        // 3. Clean conversational filler words
        const cleanedQ = rawQ
          .replace(/\b(show|all|me|the|what|are|options|option|items|item|menu|dikhao|batao|kya|hai|please|search|for|find|clear|filter|filters)\b/gi, '')
          .trim();

        const q = cleanedQ || rawQ;
        if (q) {
          const matchesEn = item.nameEn.toLowerCase().includes(q);
          const matchesHi = item.nameHi.includes(q);
          const matchesCat = item.category.toLowerCase().includes(q);
          const matchesSyn = item.synonyms.some(s => s.toLowerCase().includes(q));
          if (!matchesEn && !matchesHi && !matchesCat && !matchesSyn) {
            return false;
          }
        }
      }

      return true;
    });
  }, [items, selectedCategory, vegFilter, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none">
      {/* Category Tabs & Filter Toolbar */}
      <div className="space-y-3 pb-3">
        {/* Category Pill Buttons */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 no-scrollbar">
          {categories.map(cat => {
            const isSelected = selectedCategory === cat;
            const count =
              cat === 'All' ? items.length : items.filter(i => i.category === cat).length;

            return (
              <button
                key={cat}
                onClick={() => {
                  setSelectedCategory(cat);
                  // Clear search query on category switch so old searches don't hide items
                  setSearchQuery('');
                }}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 flex-shrink-0 ${
                  isSelected
                    ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20'
                    : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-700/80'
                }`}
              >
                <span>{cat}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isSelected ? 'bg-neutral-950/20 text-neutral-950' : 'bg-neutral-700 text-neutral-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Veg/Non-Veg Segmented Filter & Kiosk Mode Hint (Zero typing inputs) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-1.5 sm:gap-2">
          {/* Veg/Non-Veg Segmented Filter */}
          <div className="flex items-center justify-between sm:justify-start bg-neutral-900 border border-neutral-800 rounded-xl p-1 space-x-1">
            <button
              onClick={() => {
                setVegFilter('ALL');
                setSearchQuery('');
              }}
              className={`flex-1 sm:flex-initial px-3 py-1.5 sm:py-1 rounded-lg text-xs font-bold transition text-center ${
                vegFilter === 'ALL'
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => {
                setVegFilter('VEG');
                setSearchQuery('');
              }}
              className={`flex-1 sm:flex-initial px-3 py-1.5 sm:py-1 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                vegFilter === 'VEG'
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'text-neutral-400 hover:text-emerald-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Pure Veg</span>
            </button>
            <button
              onClick={() => {
                setVegFilter('NON_VEG');
                setSearchQuery('');
              }}
              className={`flex-1 sm:flex-initial px-3 py-1.5 sm:py-1 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                vegFilter === 'NON_VEG'
                  ? 'bg-rose-950 text-rose-400 border border-rose-800'
                  : 'text-neutral-400 hover:text-rose-400'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Non-Veg</span>
            </button>
          </div>

          <div className="hidden sm:flex items-center space-x-1.5 text-[11px] text-neutral-400 font-medium px-2 py-1 bg-neutral-900/60 rounded-xl border border-neutral-800/80">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span>Tap any item to add or speak your order</span>
          </div>
        </div>
      </div>

      {/* Active Filter Banner (Voice or Touch triggered) */}
      {(activeFilterNotice || vegFilter !== 'ALL' || selectedCategory !== 'All' || searchQuery) && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center space-x-2 min-w-0">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="font-bold text-amber-300 truncate">
              {activeFilterNotice || (
                vegFilter === 'VEG'
                  ? 'Showing Vegetarian Options'
                  : vegFilter === 'NON_VEG'
                  ? 'Showing Non-Vegetarian Options'
                  : selectedCategory !== 'All'
                  ? `Category: ${selectedCategory}`
                  : `Search: "${searchQuery}"`
              )}
            </span>
            <span className="text-[11px] text-neutral-400 flex-shrink-0">
              ({filteredItems.length})
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onClearFilters) {
                onClearFilters();
              } else {
                setSelectedCategory('All');
                setVegFilter('ALL');
                setSearchQuery('');
              }
            }}
            className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-[11px] font-semibold transition flex-shrink-0"
          >
            Show All ✕
          </button>
        </div>
      )}

      {/* 3-Column Item Cards Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filteredItems.length === 0 ? (
          <div className="space-y-4 pb-6">
            {/* AI Assistant Voice Host Prompt Banner */}
            <div className="p-4 bg-neutral-900/90 rounded-2xl border border-amber-500/40 shadow-xl space-y-3">
              <div className="flex items-start space-x-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">AI Voice Host</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium">0 items for current filter</span>
                  </div>
                  <h4 className="text-sm font-bold text-white">
                    "I couldn't find any items matching that. Would you like to check out our Burgers, Sides, Drinks, or Desserts instead?"
                  </h4>
                  <p className="text-xs text-neutral-400">
                    Say <span className="text-amber-400 font-semibold">"Drinks"</span>, <span className="text-amber-400 font-semibold">"Burgers"</span>, <span className="text-amber-400 font-semibold">"Sides"</span>, or tap any category below:
                  </p>
                </div>
              </div>

              {/* 4 Category Quick Jump Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('Burgers');
                    setVegFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-left transition flex items-center space-x-2"
                >
                  <span className="text-base">🍔</span>
                  <div>
                    <div className="text-xs font-bold text-white">Burgers</div>
                    <div className="text-[10px] text-neutral-400">10 gourmet burgers</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('Sides');
                    setVegFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-left transition flex items-center space-x-2"
                >
                  <span className="text-base">🍟</span>
                  <div>
                    <div className="text-xs font-bold text-white">Sides & Fries</div>
                    <div className="text-[10px] text-neutral-400">8 crispy snacks</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('Beverages');
                    setVegFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-left transition flex items-center space-x-2"
                >
                  <span className="text-base">🥤</span>
                  <div>
                    <div className="text-xs font-bold text-amber-300">Drinks & Shakes</div>
                    <div className="text-[10px] text-amber-200/70">7 beverages</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('Desserts');
                    setVegFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-left transition flex items-center space-x-2"
                >
                  <span className="text-base">🍨</span>
                  <div>
                    <div className="text-xs font-bold text-white">Desserts</div>
                    <div className="text-[10px] text-neutral-400">5 sweet treats</div>
                  </div>
                </button>
              </div>

              {/* Reset to All 30 Items */}
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('All');
                    setVegFilter('ALL');
                    setSearchQuery('');
                    onClearFilters?.();
                  }}
                  className="px-4 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-xs font-semibold transition"
                >
                  View Complete Menu Catalog (All 30 Items) ✕
                </button>
              </div>
            </div>

            {/* Popular Menu Picks Section - Screen is never empty! */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-300 flex items-center space-x-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <span>Popular Customer Favorites:</span>
                </span>
                <span className="text-[11px] text-neutral-400">Tap to add or speak your choice</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {items
                  .filter(it => it.id === 'b_makhani_paneer' || it.id === 's_peri_fries' || it.id === 'bev_coke')
                  .map(recItem => (
                    <div
                      key={recItem.id}
                      className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 flex flex-col justify-between hover:border-neutral-700 transition"
                    >
                      <div className="flex items-start space-x-3">
                        <img
                          src={recItem.imageUrl}
                          alt={recItem.nameEn}
                          className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <span className={`w-2 h-2 rounded-full ${recItem.isVeg ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <h5 className="text-xs font-bold text-white truncate">{recItem.nameEn}</h5>
                          </div>
                          <p className="text-[11px] text-neutral-400 line-clamp-1 mt-0.5">{recItem.description}</p>
                          <div className="text-xs font-bold text-amber-400 mt-1">₹{(recItem.basePricePaise / 100).toFixed(0)}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onQuickAdd(recItem, 1)}
                        className="mt-2.5 w-full py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs transition flex items-center justify-center space-x-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Quick Add</span>
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-2.5 sm:gap-3 pb-6">
            {filteredItems.map(item => {
              const hasModifiers = item.availableModifiers && item.availableModifiers.length > 0;

              return (
                <div
                  key={item.id}
                  className={`group relative bg-neutral-900 border rounded-2xl overflow-hidden flex flex-col transition-all duration-200 shadow-md ${
                    item.inStock
                      ? 'border-neutral-800/90 hover:border-neutral-700 hover:shadow-xl hover:shadow-black/50'
                      : 'border-neutral-800 opacity-60 bg-neutral-900/60'
                  }`}
                >
                  {/* Card Image */}
                  <div className="relative h-24 sm:h-28 w-full bg-neutral-950 overflow-hidden">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.nameEn}
                        className={`w-full h-full object-cover transition duration-300 ${
                          item.inStock ? 'group-hover:scale-105' : 'grayscale'
                        }`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-neutral-500 text-xs font-bold">
                        ByteBurger
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/20 to-transparent" />

                    {/* Veg/Non-Veg Dot Badge */}
                    <div className="absolute top-2 left-2">
                      <div
                        className={`w-4 h-4 sm:w-5 sm:h-5 rounded-md border flex items-center justify-center bg-neutral-950/80 backdrop-blur-sm ${
                          item.isVeg ? 'border-emerald-500' : 'border-rose-500'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            item.isVeg ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Calories / Stock Badge */}
                    <div className="absolute top-2 right-2">
                      {item.inStock ? (
                        <div className="bg-neutral-950/80 backdrop-blur-sm border border-neutral-800 px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-semibold text-neutral-300 flex items-center space-x-1">
                          <Flame className="w-2.5 h-2.5 text-orange-400" />
                          <span>{item.calories} kcal</span>
                        </div>
                      ) : (
                        <div className="bg-rose-600 text-white font-extrabold text-[9px] sm:text-[10px] uppercase px-1.5 py-0.5 rounded-full shadow-md tracking-wider">
                          Out of Stock
                        </div>
                      )}
                    </div>

                    {/* Price Tag Overlay */}
                    <div className="absolute bottom-1.5 left-2.5">
                      <span className="text-base sm:text-lg font-black text-white tracking-tight drop-shadow">
                        ₹{item.basePricePaise / 100}
                      </span>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-2 sm:p-2.5 flex-1 flex flex-col justify-between space-y-1.5">
                    <div>
                      <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-amber-400 transition">
                        {item.nameEn}
                      </h3>
                      <p className="text-[10px] text-neutral-400 font-medium line-clamp-1">
                        {item.nameHi}
                      </p>
                      <p className="text-[10px] sm:text-[11px] text-neutral-400 line-clamp-1 mt-0.5 leading-snug">
                        {item.description}
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-1 flex items-center space-x-1.5">
                      {item.inStock ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onQuickAdd(item, 1)}
                            className="flex-1 py-1.5 px-2 rounded-xl bg-amber-500 text-neutral-950 font-extrabold text-xs hover:bg-amber-400 active:scale-95 transition flex items-center justify-center space-x-1 shadow-sm"
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[3]" />
                            <span>Add</span>
                          </button>

                          {hasModifiers && (
                            <button
                              type="button"
                              onClick={() => setCustomizingItem(item)}
                              title="Customize ingredients & extra cheese"
                              className="py-1.5 px-2 rounded-xl bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition flex items-center justify-center text-xs font-semibold"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="w-full py-2 px-3 rounded-xl bg-neutral-800/80 text-neutral-400 text-center text-xs font-semibold">
                          Unavailable
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modifier Customization Modal */}
      {customizingItem && (
        <ModifierModal
          item={customizingItem}
          onClose={() => setCustomizingItem(null)}
          onAddToCart={(item, qty, mods) => {
            onQuickAdd(item, qty, mods);
          }}
        />
      )}
    </div>
  );
};
