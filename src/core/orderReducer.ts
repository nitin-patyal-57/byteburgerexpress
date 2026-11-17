import { OrderEvent, OrderLineItem, OrderState } from '../types';

export function computeLineUnitPrice(item: OrderLineItem): number {
  const modTotal = item.selectedModifiers.reduce((acc, m) => acc + m.priceDeltaPaise, 0);
  const comboAddon = item.isComboMeal ? 7900 : 0; // Rs 79 combo upgrade
  return item.menuItem.basePricePaise + modTotal + comboAddon;
}

export function recalculateOrderTotals(state: OrderState): OrderState {
  const items = state.items.map(it => {
    const unitPricePaise = computeLineUnitPrice(it);
    const subtotalPaise = unitPricePaise * it.quantity;
    return { ...it, unitPricePaise, subtotalPaise };
  });

  const subtotalPaise = items.reduce((acc, it) => acc + it.subtotalPaise, 0);
  const gstTaxPaise = Math.round(subtotalPaise * (state.gstRatePercent / 100.0));
  const totalAmountPaise = subtotalPaise + gstTaxPaise;
  const itemCount = items.reduce((acc, it) => acc + it.quantity, 0);

  return {
    ...state,
    items,
    subtotalPaise,
    gstTaxPaise,
    totalAmountPaise,
    itemCount
  };
}

export function createInitialOrderState(): OrderState {
  const state: OrderState = {
    orderId: `ORD-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    items: [],
    orderType: 'UNSET',
    status: 'BUILDING',
    gstRatePercent: 5.0,
    highlightedLineId: null,
    lastActionMessage: 'Welcome! Order hands-free by voice or tap items.',
    subtotalPaise: 0,
    gstTaxPaise: 0,
    totalAmountPaise: 0,
    itemCount: 0
  };
  return state;
}

export class DeterministicOrderStore {
  private state: OrderState;
  private history: OrderState[] = [];
  private listeners = new Set<(state: OrderState) => void>();

  constructor(initialState?: OrderState) {
    this.state = initialState || createInitialOrderState();
  }

  public getState(): OrderState {
    return this.state;
  }

  public subscribe(listener: (state: OrderState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.state));
  }

  public dispatch(event: OrderEvent): OrderState {
    // Save history snapshot (up to 50)
    this.history.push(JSON.parse(JSON.stringify(this.state)));
    if (this.history.length > 50) this.history.shift();

    const current = this.state;
    let next: OrderState = { ...current };

    switch (event.type) {
      case 'ADD_ITEM': {
        const qty = event.quantity;
        if (qty < 1 || qty > 20) {
          // Reject out of range
          return current;
        }

        const modifiers = event.modifiers || [];
        const updatedItems = [...current.items];

        // Find existing match without combo
        const existingIdx = updatedItems.findIndex(it => 
          it.menuItem.id === event.item.id &&
          !it.isComboMeal &&
          JSON.stringify(it.selectedModifiers.map(m => m.id).sort()) ===
          JSON.stringify(modifiers.map(m => m.id).sort())
        );

        let activeLineId = '';
        if (existingIdx >= 0) {
          const existing = updatedItems[existingIdx];
          const newQty = Math.min(20, existing.quantity + qty);
          const updatedLine: OrderLineItem = {
            ...existing,
            quantity: newQty
          };
          updatedItems[existingIdx] = updatedLine;
          activeLineId = existing.lineId;
        } else {
          const lineId = `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const newLine: OrderLineItem = {
            lineId,
            menuItem: event.item,
            quantity: qty,
            selectedModifiers: modifiers,
            isComboMeal: false,
            comboDrinkItem: null,
            unitPricePaise: 0,
            subtotalPaise: 0
          };
          updatedItems.push(newLine);
          activeLineId = lineId;
        }

        next = recalculateOrderTotals({
          ...current,
          items: updatedItems,
          highlightedLineId: activeLineId,
          lastActionMessage: `Added ${qty}x ${event.item.nameEn}`
        });
        break;
      }

      case 'REMOVE_ITEM': {
        const removed = current.items.find(it => it.lineId === event.lineId);
        const filtered = current.items.filter(it => it.lineId !== event.lineId);
        next = recalculateOrderTotals({
          ...current,
          items: filtered,
          highlightedLineId: null,
          lastActionMessage: removed ? `Removed ${removed.menuItem.nameEn}` : 'Item removed'
        });
        break;
      }

      case 'UPDATE_QUANTITY': {
        if (event.newQuantity <= 0) {
          const filtered = current.items.filter(it => it.lineId !== event.lineId);
          next = recalculateOrderTotals({
            ...current,
            items: filtered,
            highlightedLineId: null,
            lastActionMessage: 'Item removed'
          });
        } else {
          const clamped = Math.min(20, event.newQuantity);
          const updated = current.items.map(it => {
            if (it.lineId === event.lineId) {
              return { ...it, quantity: clamped };
            }
            return it;
          });
          next = recalculateOrderTotals({
            ...current,
            items: updated,
            highlightedLineId: event.lineId,
            lastActionMessage: `Updated quantity to ${clamped}`
          });
        }
        break;
      }

      case 'APPLY_COMBO': {
        const updated = current.items.map(it => {
          if (it.lineId === event.lineId) {
            return {
              ...it,
              isComboMeal: true,
              comboDrinkItem: event.drink
            };
          }
          return it;
        });
        next = recalculateOrderTotals({
          ...current,
          items: updated,
          highlightedLineId: event.lineId,
          lastActionMessage: `Upgraded to Combo Meal with ${event.drink.nameEn}`
        });
        break;
      }

      case 'SET_ORDER_TYPE': {
        next = {
          ...current,
          orderType: event.orderType,
          lastActionMessage: `Order set for ${event.orderType === 'DINE_IN' ? 'Dine-In' : 'Takeaway'}`
        };
        break;
      }

      case 'CONFIRM_ORDER': {
        if (current.items.length === 0) return current;
        next = {
          ...current,
          status: 'CONFIRMED',
          lastActionMessage: 'Order confirmed! Proceeding to payment.'
        };
        break;
      }

      case 'SET_PAYMENT_PENDING': {
        next = {
          ...current,
          status: 'PAYMENT_PENDING',
          paymentMethod: event.method,
          lastActionMessage: `Payment requested via ${event.method}`
        };
        break;
      }

      case 'MARK_PAID': {
        next = {
          ...current,
          status: 'PAID',
          kitchenOrderNumber: event.kitchenOrderNumber,
          lastActionMessage: `Paid! Kitchen Token #${event.kitchenOrderNumber}`
        };
        break;
      }

      case 'RESET_ORDER': {
        next = createInitialOrderState();
        break;
      }

      case 'CLEAR_HIGHLIGHT': {
        next = {
          ...current,
          highlightedLineId: null
        };
        break;
      }
    }

    this.state = next;
    this.notify();
    return this.state;
  }

  public undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.state = prev;
    this.notify();
    return true;
  }
}

export const globalOrderStore = new DeterministicOrderStore();
