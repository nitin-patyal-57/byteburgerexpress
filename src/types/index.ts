export interface ModifierOption {
  id: string;
  nameEn: string;
  nameHi: string;
  priceDeltaPaise: number;
}

export interface ModifierGroup {
  groupId: string;
  name: string;
  minSelection: number;
  maxSelection: number;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  nameEn: string;
  nameHi: string;
  category: 'Burgers' | 'Sides' | 'Beverages' | 'Desserts';
  basePricePaise: number; // e.g. 19900 = Rs 199.00
  description: string;
  isVeg: boolean;
  inStock: boolean;
  calories: number;
  imageUrl?: string;
  availableModifiers: ModifierGroup[];
  synonyms: string[];
}

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'UNSET';
export type OrderStatus = 'BUILDING' | 'CONFIRMED' | 'PAYMENT_PENDING' | 'PAID' | 'CANCELLED';

export interface OrderLineItem {
  lineId: string;
  menuItem: MenuItem;
  quantity: number;
  selectedModifiers: ModifierOption[];
  isComboMeal: boolean;
  comboDrinkItem?: MenuItem | null;
  unitPricePaise: number;
  subtotalPaise: number;
}

export interface OrderState {
  orderId: string;
  items: OrderLineItem[];
  orderType: OrderType;
  status: OrderStatus;
  gstRatePercent: number; // default 5.0%
  highlightedLineId: string | null;
  lastActionMessage: string;
  subtotalPaise: number;
  gstTaxPaise: number;
  totalAmountPaise: number;
  itemCount: number;
  paymentMethod?: string;
  kitchenOrderNumber?: number;
}

export type OrderEvent =
  | { type: 'ADD_ITEM'; item: MenuItem; quantity: number; modifiers?: ModifierOption[] }
  | { type: 'REMOVE_ITEM'; lineId: string }
  | { type: 'UPDATE_QUANTITY'; lineId: string; newQuantity: number }
  | { type: 'APPLY_COMBO'; lineId: string; drink: MenuItem }
  | { type: 'SET_ORDER_TYPE'; orderType: OrderType }
  | { type: 'CONFIRM_ORDER' }
  | { type: 'SET_PAYMENT_PENDING'; method: string }
  | { type: 'MARK_PAID'; kitchenOrderNumber: number }
  | { type: 'RESET_ORDER' }
  | { type: 'CLEAR_HIGHLIGHT' };

export type VoiceState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

export type Speaker = 'USER' | 'ASSISTANT' | 'SYSTEM';

export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: Record<string, any>;
}

export interface TranscriptEntry {
  id: string;
  speaker: Speaker;
  text: string;
  timestampMs: number;
  detectedLanguage?: 'English' | 'Hindi' | 'Hinglish' | 'Punjabi';
  toolCalls?: ToolCallRecord[];
  isInterrupted?: boolean;
}

export interface ScenarioTestDefinition {
  id: number;
  title: string;
  category: 'A: Core & Indian Accents' | 'B: Ambiguity & Corrections' | 'C: Out-of-Stock & Recovery' | 'D: Allergen & Nutrition' | 'E: Prompt Injection & Security' | 'F: Complex & Payments' | 'G: Resilience & Concurrency';
  userUtterance: string;
  description: string;
  expectedToolCalls: string[];
  assertions: (state: OrderState, toolResults: Record<string, any>[]) => { passed: boolean; message: string };
}

export interface ScenarioTestResult {
  id: number;
  title: string;
  category: string;
  passed: boolean;
  message: string;
  durationMs: number;
  executedTools: string[];
  transcript?: string;
}
