import { SEED_MENU_ITEMS } from '../data/seedMenu';
import { DeterministicOrderStore } from './orderReducer';
import { MenuItem, ModifierOption } from '../types';

export interface ToolResult {
  status: 'SUCCESS' | 'ERROR' | 'OUT_OF_STOCK' | 'CONFIRMED' | 'PAYMENT_INITIATED' | 'CANCELLED' | 'STAFF_DISPATCHED';
  message?: string;
  error_message?: string;
  [key: string]: any;
}

export class ToolExecutionEngine {
  private catalog: MenuItem[];
  private orderStore: DeterministicOrderStore;

  constructor(orderStore: DeterministicOrderStore, catalog: MenuItem[] = SEED_MENU_ITEMS) {
    this.orderStore = orderStore;
    this.catalog = catalog;
  }

  public getItemById(id: string): MenuItem | undefined {
    return this.catalog.find(it => it.id === id);
  }

  public searchMenu(query: string): MenuItem[] {
    const q = (query || '').toLowerCase().trim();
    if (!q) return this.catalog;

    return this.catalog.filter(it => 
      it.nameEn.toLowerCase().includes(q) ||
      it.nameHi.includes(q) ||
      it.category.toLowerCase().includes(q) ||
      it.synonyms.some(s => s.toLowerCase().includes(q))
    );
  }

  public getInStockAlternatives(category: string): MenuItem[] {
    return this.catalog.filter(it => it.category.toLowerCase() === category.toLowerCase() && it.inStock);
  }

  public async execute(name: string, args: Record<string, any>): Promise<ToolResult> {
    try {
      switch (name) {
        case 'search_menu': {
          const query = String(args.query || '');
          const matches = this.searchMenu(query);
          return {
            status: 'SUCCESS',
            results: matches.slice(0, 6).map(it => ({
              id: it.id,
              name: it.nameEn,
              name_hi: it.nameHi,
              category: it.category,
              price_inr: it.basePricePaise / 100,
              is_veg: it.isVeg,
              in_stock: it.inStock,
              calories: it.calories
            }))
          };
        }

        case 'filter_menu': {
          const vegFilter = args.veg_filter;
          const category = args.category;
          const searchQuery = args.search_query;
          let filtered = this.catalog;

          if (vegFilter === 'VEG') filtered = filtered.filter(i => i.isVeg);
          else if (vegFilter === 'NON_VEG') filtered = filtered.filter(i => !i.isVeg);

          if (category && category !== 'All') {
            filtered = filtered.filter(i => i.category.toLowerCase() === String(category).toLowerCase());
          }

          if (searchQuery) {
            const sq = String(searchQuery).toLowerCase().trim();
            filtered = filtered.filter(i =>
              i.nameEn.toLowerCase().includes(sq) ||
              i.nameHi.includes(sq) ||
              i.synonyms.some(s => s.toLowerCase().includes(sq))
            );
          }

          return {
            status: 'SUCCESS',
            veg_filter: vegFilter,
            category: category,
            search_query: searchQuery,
            match_count: filtered.length,
            top_matches: filtered.slice(0, 4).map(i => i.nameEn)
          };
        }

        case 'add_item': {
          const itemId = args.item_id;
          if (!itemId) {
            return { status: 'ERROR', error_message: 'item_id is required' };
          }
          const qty = Number(args.quantity) || 1;
          if (qty < 1 || qty > 20) {
            return { status: 'ERROR', error_message: `Quantity must be between 1 and 20. Provided: ${qty}` };
          }

          const item = this.getItemById(itemId);
          if (!item) {
            return { status: 'ERROR', error_message: `Item '${itemId}' does not exist in catalog` };
          }

          if (!item.inStock) {
            const alternatives = this.getInStockAlternatives(item.category);
            return {
              status: 'OUT_OF_STOCK',
              message: `${item.nameEn} is currently out of stock.`,
              suggested_alternatives: alternatives.slice(0, 3).map(a => a.nameEn)
            };
          }

          const modIds: string[] = Array.isArray(args.modifier_ids) ? args.modifier_ids : [];
          const resolvedMods: ModifierOption[] = [];
          for (const mId of modIds) {
            for (const grp of item.availableModifiers) {
              const opt = grp.options.find(o => o.id === mId);
              if (opt) resolvedMods.push(opt);
            }
          }

          this.orderStore.dispatch({
            type: 'ADD_ITEM',
            item,
            quantity: qty,
            modifiers: resolvedMods
          });

          const state = this.orderStore.getState();
          return {
            status: 'SUCCESS',
            message: `Added ${qty}x ${item.nameEn} to the order.`,
            cart_total_inr: state.totalAmountPaise / 100,
            item_count: state.itemCount
          };
        }

        case 'remove_item': {
          const lineId = args.line_id;
          if (!lineId) return { status: 'ERROR', error_message: 'line_id is required' };
          this.orderStore.dispatch({ type: 'REMOVE_ITEM', lineId });
          const state = this.orderStore.getState();
          return {
            status: 'SUCCESS',
            message: 'Item removed successfully.',
            cart_total_inr: state.totalAmountPaise / 100
          };
        }

        case 'update_item': {
          const lineId = args.line_id;
          if (!lineId) return { status: 'ERROR', error_message: 'line_id is required' };
          if (args.quantity !== undefined) {
            const qty = Number(args.quantity);
            this.orderStore.dispatch({ type: 'UPDATE_QUANTITY', lineId, newQuantity: qty });
          }
          const state = this.orderStore.getState();
          return {
            status: 'SUCCESS',
            message: 'Item updated successfully.',
            cart_total_inr: state.totalAmountPaise / 100
          };
        }

        case 'set_order_type': {
          const typeStr = String(args.order_type || 'DINE_IN').toUpperCase();
          const orderType = typeStr === 'TAKEAWAY' ? 'TAKEAWAY' : 'DINE_IN';
          this.orderStore.dispatch({ type: 'SET_ORDER_TYPE', orderType });
          return {
            status: 'SUCCESS',
            order_type: orderType
          };
        }

        case 'apply_combo': {
          const lineId = args.line_id;
          const drinkId = args.drink_item_id;
          if (!lineId) return { status: 'ERROR', error_message: 'line_id is required' };
          if (!drinkId) return { status: 'ERROR', error_message: 'drink_item_id is required' };

          const drink = this.getItemById(drinkId);
          if (!drink) return { status: 'ERROR', error_message: `Drink '${drinkId}' not found` };

          this.orderStore.dispatch({ type: 'APPLY_COMBO', lineId, drink });
          const state = this.orderStore.getState();
          return {
            status: 'SUCCESS',
            message: `Upgraded to meal with ${drink.nameEn} (+₹79).`,
            cart_total_inr: state.totalAmountPaise / 100
          };
        }

        case 'get_order_summary': {
          const state = this.orderStore.getState();
          return {
            status: 'SUCCESS',
            order_id: state.orderId,
            order_type: state.orderType,
            total_items: state.itemCount,
            subtotal_inr: state.subtotalPaise / 100,
            gst_tax_inr: state.gstTaxPaise / 100,
            total_inr: state.totalAmountPaise / 100,
            lines: state.items.map(it => ({
              line_id: it.lineId,
              name: it.menuItem.nameEn,
              qty: it.quantity,
              is_combo: it.isComboMeal,
              modifiers: it.selectedModifiers.map(m => m.nameEn),
              subtotal_inr: it.subtotalPaise / 100
            }))
          };
        }

        case 'confirm_order': {
          const state = this.orderStore.getState();
          if (state.items.length === 0) {
            return { status: 'ERROR', error_message: 'Cart is empty; cannot confirm.' };
          }
          this.orderStore.dispatch({ type: 'CONFIRM_ORDER' });
          return {
            status: 'CONFIRMED',
            message: 'Order confirmed. Proceeding to payment options.'
          };
        }

        case 'request_payment': {
          const method = String(args.payment_method || 'UPI_QR').toUpperCase();
          this.orderStore.dispatch({ type: 'SET_PAYMENT_PENDING', method });
          const state = this.orderStore.getState();
          return {
            status: 'PAYMENT_INITIATED',
            method,
            authoritative_total_inr: state.totalAmountPaise / 100
          };
        }

        case 'cancel_order': {
          this.orderStore.dispatch({ type: 'RESET_ORDER' });
          return {
            status: 'CANCELLED',
            message: 'Order has been cancelled and cart reset.'
          };
        }

        case 'call_staff': {
          const reason = String(args.reason || 'Customer requested assistance');
          return {
            status: 'STAFF_DISPATCHED',
            message: `Floor staff notified: ${reason}`
          };
        }

        default:
          return { status: 'ERROR', error_message: `Unknown function tool: ${name}` };
      }
    } catch (err: any) {
      return { status: 'ERROR', error_message: `Tool execution failed: ${err.message}` };
    }
  }
}
