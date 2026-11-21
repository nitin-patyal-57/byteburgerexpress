import { SEED_MENU_ITEMS } from '../data/seedMenu.ts';
import { normalizeQSRSpokenUtterance, transliterateDevanagariForNLU } from './acousticNormalizer.ts';

export interface NLUParsedResult {
  reply: string;
  toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, any>;
  }>;
}

export function countMenuMatches(
  query: string,
  category: string = 'All',
  vegFilter: 'ALL' | 'VEG' | 'NON_VEG' = 'ALL'
): number {
  const q = (query || '').toLowerCase().trim();
  if (q.length < 2) return 0;
  return SEED_MENU_ITEMS.filter(item => {
    if (category !== 'All' && item.category !== category) return false;
    if (vegFilter === 'VEG' && !item.isVeg) return false;
    if (vegFilter === 'NON_VEG' && item.isVeg) return false;
    if (q) {
      if (
        q === 'drinks' ||
        q === 'drink' ||
        q === 'beverages' ||
        q === 'beverage' ||
        q === 'cold drinks' ||
        q === 'cold drink' ||
        q === 'soft drinks' ||
        q === 'soda' ||
        q === 'shakes'
      ) {
        return item.category === 'Beverages';
      }
      if (q === 'burgers' || q === 'burger') return item.category === 'Burgers';
      if (q === 'sides' || q === 'side' || q === 'fries' || q === 'french fries' || q === 'tides' || q === 'tide' || q === 'tights' || q === 'tight' || q === 'sites' || q === 'slides') return item.category === 'Sides';
      if (q === 'desserts' || q === 'dessert' || q === 'deserts' || q === 'desert' || q === 'dezert' || q === 'dezerts' || q === 'sweets' || q === 'sweet' || q === 'meetha') return item.category === 'Desserts';

      const mEn = item.nameEn.toLowerCase().includes(q);
      const mHi = item.nameHi.includes(q);
      const mCat = item.category.toLowerCase().includes(q);
      const mSyn = item.synonyms.some(s => s.toLowerCase().includes(q));
      if (!mEn && !mHi && !mCat && !mSyn) return false;
    }
    return true;
  }).length;
}

// Calculate match score between query tokens and a MenuItem with 50% nearest product threshold
export function scoreMenuItemMatch(
  query: string,
  item: any
): { score: number; matchedWords: string[]; matchedTokens: number; totalTokens: number } {
  // Clean query of conversational words, order intent, and numbers
  const cleanQ = query
    .toLowerCase()
    .replace(
      /\b(order|ordered|ordering|one|two|three|four|five|1|2|3|4|5|ek|do|teen|char|chaar|paanch|a|an|the|this|that|some|add|want|give|get|buy|please|bhai|kardo|kar do|chahiye|daal do|can i have|i'll have|ill have|kripya|mujhe|glass|cup|plate|pack|tray|cart|item|items)\b/gi,
      ' '
    )
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();

  const qTokens = cleanQ.split(/\s+/).filter(t => t.length > 1);
  if (qTokens.length === 0) return { score: 0, matchedWords: [], matchedTokens: 0, totalTokens: 0 };

  const itemWords = new Set<string>();
  // 1. Add words from nameEn
  item.nameEn
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .forEach((w: string) => w && itemWords.add(w));
  // 2. Add words from synonyms
  item.synonyms.forEach((s: string) => {
    s.toLowerCase()
      .split(/[^a-z0-9]+/)
      .forEach((w: string) => w && itemWords.add(w));
  });
  // 3. Add category & category synonyms
  const cat = item.category.toLowerCase();
  itemWords.add(cat);
  if (cat === 'beverages') {
    ['drink', 'drinks', 'beverage', 'beverages', 'shake', 'shakes', 'cold', 'soda', 'sip', 'peene'].forEach(
      (w: string) => itemWords.add(w)
    );
  } else if (cat === 'burgers') {
    ['burger', 'burgers', 'bun', 'buns', 'patty', 'sandwich'].forEach((w: string) => itemWords.add(w));
  } else if (cat === 'sides') {
    ['side', 'sides', 'fries', 'snack', 'snacks', 'finger', 'food'].forEach((w: string) => itemWords.add(w));
  } else if (cat === 'desserts') {
    ['dessert', 'desserts', 'sweet', 'sweets', 'meetha', 'ice', 'cream', 'treat'].forEach(
      (w: string) => itemWords.add(w)
    );
  }

  let matchedTokens = 0;
  const matchedWords: string[] = [];
  for (const qt of qTokens) {
    if (itemWords.has(qt)) {
      matchedTokens++;
      matchedWords.push(qt);
    } else {
      // Partial prefix/stem/substring match (e.g. 'choc' <-> 'chocolate', 'beligian' <-> 'belgian', 'fry' <-> 'fries')
      let partial = false;
      for (const iw of itemWords) {
        if (
          iw.startsWith(qt) ||
          qt.startsWith(iw) ||
          (qt.length >= 4 && iw.includes(qt)) ||
          (iw.length >= 4 && qt.includes(iw))
        ) {
          partial = true;
          break;
        }
      }
      if (partial) {
        matchedTokens += 0.85;
        matchedWords.push(qt);
      }
    }
  }

  const score = matchedTokens / qTokens.length;
  return { score, matchedWords, matchedTokens, totalTokens: qTokens.length };
}

// Find targeted line item in customer cart by utterance
/**
 * Word-boundary-aware phrase containment. Prevents short synonyms from
 * matching inside unrelated words (e.g. synonym "tea" inside "instead",
 * which used to add an iced tea when the customer only switched order type).
 * Non-ASCII (Devanagari) phrases fall back to plain containment because
 * JavaScript \b boundaries are ASCII-only.
 */
function includesPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  if (!/^[\x00-\x7F]+$/.test(phrase)) return haystack.includes(phrase);
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
}

export function findCartItemByUtterance(text: string, cartItems: any[]): any | null {
  if (!cartItems || cartItems.length === 0) return null;

  // 1. Exact match on item name or synonyms
  for (const it of cartItems) {
    const en = (it.menuItem?.nameEn || '').toLowerCase();
    const hi = (it.menuItem?.nameHi || '').toLowerCase();
    if (en && includesPhrase(text, en)) return it;
    if (hi && includesPhrase(text, hi)) return it;
    for (const syn of it.menuItem?.synonyms || []) {
      const s = syn.toLowerCase();
      if (includesPhrase(text, s)) return it;
    }
  }

  // 2. Keyword/Category checks
  if (text.includes('coke') || text.includes('cola') || text.includes('soda') || text.includes('drink') || text.includes('beverage')) {
    const found = cartItems.find(it => it.menuItem?.category === 'Beverages' || it.menuItem?.id.startsWith('bev_'));
    if (found) return found;
  }
  if (text.includes('burger') || text.includes('burgers') || text.includes('tikki') || text.includes('paneer') || text.includes('chicken') || text.includes('mutton')) {
    const found = cartItems.find(it => it.menuItem?.category === 'Burgers' || it.menuItem?.id.startsWith('b_'));
    if (found) return found;
  }
  if (text.includes('fries') || text.includes('side') || text.includes('sides') || text.includes('tides') || text.includes('tide') || text.includes('wedges') || text.includes('rings') || text.includes('popcorn') || text.includes('nugget')) {
    const found = cartItems.find(it => it.menuItem?.category === 'Sides' || it.menuItem?.id.startsWith('s_'));
    if (found) return found;
  }
  if (text.includes('dessert') || text.includes('desserts') || text.includes('deserts') || text.includes('desert') || text.includes('sweet') || text.includes('brownie') || text.includes('swirl') || text.includes('jamun') || text.includes('sundae')) {
    const found = cartItems.find(it => it.menuItem?.category === 'Desserts' || it.menuItem?.id.startsWith('d_'));
    if (found) return found;
  }
  if (text.includes('belgian') || text.includes('chocolate')) {
    const found = cartItems.find(it => it.menuItem?.id === 'bev_belgian_shake' || it.menuItem?.nameEn?.toLowerCase().includes('chocolate'));
    if (found) return found;
  }
  if (text.includes('mango')) {
    const found = cartItems.find(it => it.menuItem?.id === 'bev_mango_shake' || it.menuItem?.nameEn?.toLowerCase().includes('mango'));
    if (found) return found;
  }
  if (text.includes('shake')) {
    const found = cartItems.find(it => it.menuItem?.id?.includes('shake'));
    if (found) return found;
  }

  // 3. Positional / Pronoun checks
  if (text.includes('first item') || text.includes('pehla')) {
    return cartItems[0];
  }
  if (
    text.includes('last item') ||
    text.includes('aakhri') ||
    text.includes('one item') ||
    text.includes('1 item') ||
    text.includes('this item') ||
    text.includes('that item') ||
    text.includes('this') ||
    text.includes('that') ||
    text.includes('it')
  ) {
    return cartItems[cartItems.length - 1];
  }

  // 4. Default: If only 1 item in tray, target that item
  if (cartItems.length === 1) {
    return cartItems[0];
  }

  // 5. Default fallback to last added item
  return cartItems[cartItems.length - 1];
}

export function parseWordOrDigit(str: string): number | null {
  const s = str.trim().toLowerCase();
  if (/^(zero|0|shunya|none|nil)$/.test(s)) return 0;
  if (/^(one|1|ek|single)$/.test(s)) return 1;
  if (/^(two|2|do|double)$/.test(s)) return 2;
  if (/^(three|3|teen|triple)$/.test(s)) return 3;
  if (/^(four|4|char|chaar)$/.test(s)) return 4;
  if (/^(five|5|paanch)$/.test(s)) return 5;
  if (/^(six|6|chhe)$/.test(s)) return 6;
  if (/^(seven|7|saat)$/.test(s)) return 7;
  if (/^(eight|8|aath)$/.test(s)) return 8;
  if (/^(nine|9|nau)$/.test(s)) return 9;
  if (/^(ten|10|das)$/.test(s)) return 10;
  const num = parseInt(s, 10);
  if (!isNaN(num) && num >= 0 && num <= 20) return num;
  return null;
}

// Extract target quantity or delta from customer utterance
export function extractTargetQuantity(text: string, currentQty: number = 1): number | null {
  const lower = text.toLowerCase().trim();

  // 1. Delta increments: "one more", "1 more", "ek aur", "add 1 more"
  if (/\b(one|1|ek)\s+more\b/i.test(lower) || lower.includes('one more') || lower.includes('1 more') || lower.includes('ek aur') || lower.includes('add more') || lower.includes('aur add')) {
    return Math.min(20, currentQty + 1);
  }
  if (/\b(two|2|do)\s+more\b/i.test(lower) || lower.includes('two more') || lower.includes('2 more') || lower.includes('do aur')) {
    return Math.min(20, currentQty + 2);
  }
  if (/\b(three|3|teen)\s+more\b/i.test(lower) || lower.includes('3 more')) {
    return Math.min(20, currentQty + 3);
  }

  // 2. Delta decrements: "one less", "1 less", "ek kam", "reduce by 1"
  if (/\b(one|1|ek)\s+less\b/i.test(lower) || lower.includes('one less') || lower.includes('1 less') || lower.includes('ek kam') || lower.includes('reduce by 1') || lower.includes('reduce by one')) {
    return Math.max(0, currentQty - 1);
  }
  if (/\b(two|2|do)\s+less\b/i.test(lower) || lower.includes('two less') || lower.includes('2 less') || lower.includes('do kam')) {
    return Math.max(0, currentQty - 2);
  }

  // 3. Substitution: "2 cokes instead of 1", "3 instead of 2" -> target is the new count (the first number before 'instead of')
  const insteadMatch = lower.match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|ek|do|teen|char|paanch|\d+)\s*(?:cokes?|burgers?|fries?|shakes?|items?|drinks?)?\s+instead\s+of\b/i);
  if (insteadMatch) {
    const parsed = parseWordOrDigit(insteadMatch[1]);
    if (parsed !== null) return parsed;
  }

  // 4. "quantity to <X>" or "count to <X>" or "to <X>" or "make ... <X>"
  const targetToMatch = lower.match(/\b(?:quantity\s+to|count\s+to|set\s+to|reduce\s+to|increase\s+to|change\s+to|to|make\s+it|make\s+[a-z]+)\s+([a-z0-9]+)\b/i);
  if (targetToMatch) {
    const parsed = parseWordOrDigit(targetToMatch[1]);
    if (parsed !== null) return parsed;
  }

  // 5. "quantity <X>" (e.g. "coke quantity 2")
  const qtyDirectMatch = lower.match(/\bquantity\s+([a-z0-9]+)\b/i);
  if (qtyDirectMatch) {
    const parsed = parseWordOrDigit(qtyDirectMatch[1]);
    if (parsed !== null) return parsed;
  }

  // 6. Explicit zero / removal words
  if (/\b(zero|none|nil|remove|cancel|delete|drop|0)\b/i.test(lower) && !lower.includes('coke zero') && !lower.includes('sugar zero')) {
    return 0;
  }

  // 7. General number extraction (highest match first to avoid prefix substring collisions)
  if (/\b(ten|10|das)\b/i.test(lower)) return 10;
  if (/\b(nine|9|nau)\b/i.test(lower)) return 9;
  if (/\b(eight|8|aath)\b/i.test(lower)) return 8;
  if (/\b(seven|7|saat)\b/i.test(lower)) return 7;
  if (/\b(six|6|chhe)\b/i.test(lower)) return 6;
  if (/\b(five|5|paanch)\b/i.test(lower)) return 5;
  if (/\b(four|4|char|chaar)\b/i.test(lower)) return 4;
  if (/\b(three|3|teen)\b/i.test(lower)) return 3;
  if (/\b(two|2|do)\b/i.test(lower)) return 2;
  if (/\b(one|1|ek)\b/i.test(lower)) return 1;

  const digitMatch = lower.match(/\b([1-9]|1[0-9]|20)\b/);
  if (digitMatch) {
    return parseInt(digitMatch[1], 10);
  }

  return null;
}

export function parseDeterministicIntent(
  message: string,
  orderState: any
): NLUParsedResult {
  const rawNormalized = normalizeQSRSpokenUtterance(message || '');
  // Hindi (Devanagari) utterances are transliterated to Latin before parsing so
  // number words like "दो" (two) and menu names match the English catalog.
  const normalized = /[\u0900-\u097F]/.test(rawNormalized)
    ? normalizeQSRSpokenUtterance(transliterateDevanagariForNLU(rawNormalized))
    : rawNormalized;
  const text = normalized.toLowerCase().trim();

  const toolCalls: Array<{ id: string; name: string; args: Record<string, any> }> = [];
  let reply = '';

  // 0. Code / SQL prompt-injection guard.
  // Strings like "DROP TABLE menu; --1=1" are not removal commands and must
  // never touch the cart: sanitize them into a harmless catalog search.
  const looksLikeCodeInjection =
    /\b(drop|delete|truncate|alter|create|grant)\s+(table|database|schema|menu|index|sequence|rows|records)\b/.test(text) ||
    /\b(insert\s+into|select\s+\*|union\s+select|execute\s+sp_)\b/.test(text) ||
    /\bor\s+1\s*=\s*1\b|;\s*--|\/\*/.test(text);

  if (looksLikeCodeInjection) {
    toolCalls.push({
      id: `call_${Date.now()}_injsearch`,
      name: 'search_menu',
      args: { query: 'menu' },
    });
    return {
      reply: "I can only search our menu — I couldn't run that as a command. Would you like to see our Burgers, Sides, Drinks, or Desserts?",
      toolCalls,
    };
  }

  // 1. Allergen & Safety Guardrail (Rule 4)
  if (
    text.includes('peanut') ||
    text.includes('nut allergy') ||
    text.includes('celiac') ||
    text.includes('gluten') ||
    text.includes('shellfish') ||
    text.includes('severe allergy') ||
    text.includes('allergic')
  ) {
    const reason = text.includes('peanut')
      ? 'Severe Peanut Allergy Inquiry'
      : text.includes('celiac') || text.includes('gluten')
        ? 'Celiac Disease / Gluten Verification'
        : 'Allergen inquiry';

    toolCalls.push({
      id: `call_${Date.now()}_staff`,
      name: 'call_staff',
      args: { reason },
    });
    return {
      reply: 'Please hold on, our restaurant manager will assist you with ingredient and allergen details right away.',
      toolCalls,
    };
  }

  // 2. Staff Summons or Cash Counter Help
  if (
    text.includes('call staff') ||
    text.includes('manager') ||
    text.includes('human') ||
    text.includes('cash counter') ||
    text.includes('cash desk') ||
    text.includes('cash payment')
  ) {
    toolCalls.push({
      id: `call_${Date.now()}_staff`,
      name: 'call_staff',
      args: { reason: 'Customer requested floor staff assistance' },
    });
    return {
      reply: 'A floor staff member has been notified and is coming to assist you right away!',
      toolCalls,
    };
  }

  // 3. Clear / Cancel ENTIRE Order (Strictly for whole-cart reset only)
  const isEntireOrderCancel = (
    text === 'cancel order' ||
    text === 'cancel the order' ||
    text === 'cancel my order' ||
    text === 'cancel entire order' ||
    text === 'cancel whole order' ||
    text === 'cancel everything' ||
    text === 'cancel all' ||
    text === 'clear tray' ||
    text === 'clear the tray' ||
    text === 'clear cart' ||
    text === 'clear my cart' ||
    text === 'empty cart' ||
    text === 'empty tray' ||
    text === 'reset order' ||
    text === 'reset cart' ||
    text === 'start over' ||
    (
      (text.includes('cancel') || text.includes('clear') || text.includes('reset')) &&
      (text.includes('entire order') || text.includes('whole order') || text.includes('everything') || (text.includes('all') && text.includes('order'))) &&
      !text.includes('item') && !text.includes('coke') && !text.includes('burger') && !text.includes('fries') && !text.includes('shake') && !text.includes('one')
    ) ||
    // "discard my order" / "delete my order" = whole-cart reset (NOTE: "card" must
    // never match inside "dis-card", see payment section below)
    (
      (text.includes('discard') || text.includes('delete')) &&
      text.includes('order') &&
      !text.includes('item') && !text.includes('coke') && !text.includes('burger') && !text.includes('fries')
    )
  );

  if (isEntireOrderCancel) {
    toolCalls.push({
      id: `call_${Date.now()}_cancel`,
      name: 'cancel_order',
      args: { reason: 'Customer requested reset' },
    });
    return {
      reply: 'Order cancelled. Tray has been cleared.',
      toolCalls,
    };
  }

  // 3a-2. User asks to add more items / add another item without naming a specific food yet
  const isAskingToAddMoreItems = (
    (text.includes('add more') || text.includes('add another') || text.includes('more item') || text.includes('another item') || text.includes('aur item') || text.includes('aur add') || text.includes('kuch aur')) &&
    !text.includes('burger') && !text.includes('fries') && !text.includes('coke') && !text.includes('shake') && !text.includes('tikki') && !text.includes('paneer') && !text.includes('drink') && !text.includes('brownie') && !text.includes('one more') && !text.includes('1 more')
  );

  if (isAskingToAddMoreItems) {
    toolCalls.push({
      id: `call_${Date.now()}_filter_all`,
      name: 'filter_menu',
      args: { category: 'All', veg_filter: 'ALL', search_query: '' },
    });
    return {
      reply: 'Sure! What would you like to add? We have Burgers, Sides, Drinks, and Desserts. Just say the item name!',
      toolCalls,
    };
  }

  // 3a-3. Price / billing manipulation guardrail (prompt-injection defense).
  // Menu prices are immutable; answer with the authoritative total instead of
  // ever mutating state ("set price to zero" previously reached the quantity
  // branch and could delete a customer's line item).
  const isPriceManipulation =
    !text.includes('?') &&
    !/^(how|what)\b/.test(text) &&
    /\b(price|prices|rupees|billing|invoice|discount|coupon|gst rate|tax rate|vip)\b/.test(text) &&
    /\b(set|zero|0|change|override|mark|free|waive|reduce|update|make)\b/.test(text);

  if (isPriceManipulation) {
    const total = orderState?.totalAmountPaise ? (orderState.totalAmountPaise / 100).toFixed(2) : '0';
    toolCalls.push({
      id: `call_${Date.now()}_summary`,
      name: 'get_order_summary',
      args: {},
    });
    return {
      reply: `Our menu prices are fixed and include GST, so I can't change them. Your current total is ₹${total}. What would you like to order?`,
      toolCalls,
    };
  }

  // 3b. Quantity Changes & Corrections (e.g. "change coke quantity to 2", "make it 3", "2 cokes instead of 1", "add 1 more coke", "reduce burger to 1", "make burger 2")
  // Order-type switches ("make my order takeaway instead of dine in") are NOT quantity changes.
  const isOrderTypeSwitch =
    (text.includes('takeaway') || text.includes('take away') || text.includes('dine in') || text.includes('dine-in') || text.includes('eat here')) &&
    (text.includes('instead') || text.includes('change') || text.includes('make'));

  const isQuantityChange = !isOrderTypeSwitch && (
    text.includes('quantity') ||
    text.includes('count to') ||
    text.includes('set to') ||
    text.includes('instead of') ||
    text.includes('instead') ||
    text.includes('one more') ||
    text.includes('1 more') ||
    text.includes('two more') ||
    text.includes('2 more') ||
    text.includes('one less') ||
    text.includes('1 less') ||
    (text.includes('change') && !text.includes('order type') && !text.includes('dining')) ||
    (text.includes('make') && (text.includes('coke') || text.includes('burger') || text.includes('fries') || text.includes('shake') || text.includes('that') || text.includes('it') || text.includes('item'))) ||
    /\b(increase|decrease|reduce|update|set)\b.*\b(coke|burger|fries|item|quantity|count|to|by)\b/i.test(text)
  );

  if (isQuantityChange) {
    const cartItems = orderState?.items || [];
    if (cartItems.length === 0) {
      return {
        reply: 'Your tray is currently empty. Would you like to check out our Burgers, Sides, Drinks, or Desserts?',
        toolCalls: [],
      };
    }

    const targetItem = findCartItemByUtterance(text, cartItems);
    if (targetItem) {
      const targetQty = extractTargetQuantity(text, targetItem.quantity);
      if (targetQty !== null) {
        if (targetQty <= 0) {
          // Quantity 0 deterministically removes the line in the reducer,
          // but the emitted tool stays update_item so the action is auditable.
          toolCalls.push({
            id: `call_${Date.now()}_upd`,
            name: 'update_item',
            args: { line_id: targetItem.lineId, quantity: 0 },
          });
          const remaining = cartItems.length - 1;
          return {
            reply: `Removed ${targetItem.menuItem.nameEn} from your tray.${remaining > 0 ? ` You have ${remaining} ${remaining === 1 ? 'item' : 'items'} left in your tray.` : ' Your tray is now empty.'}`,
            toolCalls,
          };
        } else {
          toolCalls.push({
            id: `call_${Date.now()}_upd`,
            name: 'update_item',
            args: { line_id: targetItem.lineId, quantity: targetQty },
          });
          return {
            reply: `Updated ${targetItem.menuItem.nameEn} quantity to ${targetQty} in your tray!`,
            toolCalls,
          };
        }
      }
    }
  }

  // 3c. Single Item Removal & Cancellation (e.g. "cancel the coke", "remove the coke", "cancel one item", "cancel burger", "delete coke", "hata do")
  const isSingleItemCancelOrRemove = (
    !isEntireOrderCancel &&
    (
      text.includes('remove') ||
      text.includes('cancel') ||
      text.includes('delete') ||
      text.includes('drop') ||
      text.includes('hata do') ||
      text.includes('hatao') ||
      text.includes('nikal do') ||
      text.includes('nikalo') ||
      text.includes('nahi chahiye') ||
      text.includes("don't want") ||
      text.includes('dont want')
    ) &&
    // Only treat the utterance as an item removal when it actually references an
    // item (food noun, "item", or a pronoun right after the removal verb).
    // Bare digits are deliberately NOT accepted as item context: injection
    // strings like "DROP TABLE menu; --1=1" must never touch the cart.
    (
      /\b(burger|burgers|coke|cokes|cola|fries|fry|shake|drink|beverage|dessert|brownie|paneer|chicken|mutton|fish|tikki|sides|side|water|tea|ice cream|swirl|sundae|jamun|nuggets|wings|rings|popcorn|wedges|pie|thums up|soda|chaas|buttermilk|snack|item|items)\b/.test(text) ||
      /\b(remove|cancel|delete|drop|hata|nikal)\b[^.?!]*\b(it|that|this|one)\b/.test(text)
    )
  );

  if (isSingleItemCancelOrRemove) {
    const cartItems = orderState?.items || [];
    if (cartItems.length === 0) {
      return {
        reply: 'Your tray is already empty! What would you like to order?',
        toolCalls: [],
      };
    }

    const targetItem = findCartItemByUtterance(text, cartItems);
    if (targetItem) {
      // Partial removal with an explicit count (e.g. "remove 2 cokes" reduces the
      // line by 2 instead of wiping the whole line). Bare "do" is deliberately
      // excluded so Hindi verb endings like "hata do" / "nikal do" are not
      // misread as the number two.
      const removeCountMatch = text.match(/\b(?:remove|cancel|delete|drop|reduce|nikal|hata)\D*(\d+|one|two|three|ek|teen)\b/i);
      const removeCount = removeCountMatch ? parseWordOrDigit(removeCountMatch[1]) : null;
      if (removeCount !== null && removeCount > 0) {
        const newQty = Math.max(0, targetItem.quantity - removeCount);
        toolCalls.push({
          id: `call_${Date.now()}_upd`,
          name: 'update_item',
          args: { line_id: targetItem.lineId, quantity: newQty },
        });
        return {
          reply: newQty > 0
            ? `Reduced ${targetItem.menuItem.nameEn} to ${newQty} in your tray.`
            : `Removed ${targetItem.menuItem.nameEn} from your tray.${cartItems.length > 1 ? ` Your tray now has ${cartItems.length - 1} items.` : ' Your tray is now empty.'}`,
          toolCalls,
        };
      }

      // If customer specifies single count removal and item has quantity > 1 (e.g. "cancel one coke", "remove 1 coke", "cancel 1 item")
      const asksSingleUnit = text.includes('one') || text.includes(' 1') || text.includes('ek') || text.includes('single');
      if (targetItem.quantity > 1 && asksSingleUnit) {
        const newQty = targetItem.quantity - 1;
        toolCalls.push({
          id: `call_${Date.now()}_upd`,
          name: 'update_item',
          args: { line_id: targetItem.lineId, quantity: newQty },
        });
        return {
          reply: `Reduced ${targetItem.menuItem.nameEn} to ${newQty} in your tray.`,
          toolCalls,
        };
      }

      // Otherwise remove the full line item
      toolCalls.push({
        id: `call_${Date.now()}_rem`,
        name: 'remove_item',
        args: { line_id: targetItem.lineId },
      });
      const remainingCount = cartItems.length - 1;
      return {
        reply: `Removed ${targetItem.menuItem.nameEn} from your tray.${remainingCount > 0 ? ` Your tray now has ${remainingCount} ${remainingCount === 1 ? 'item' : 'items'}.` : ' Your tray is now empty.'}`,
        toolCalls,
      };
    } else {
      return {
        reply: "I couldn't find that item in your tray. Please check your order summary on the right.",
        toolCalls: [],
      };
    }
  }

  // 3b. Dietary & Menu Filtering (Veg, Non-Veg, Categories, Recommendations)
  const isAskingNonVeg = (
    text.includes('non-veg') ||
    text.includes('non veg') ||
    text.includes('nonveg') ||
    text.includes('chicken option') ||
    text.includes('meat option') ||
    ((text.includes('chicken') || text.includes('mutton') || text.includes('fish')) && (text.includes('what') || text.includes('show') || text.includes('dikhao') || text.includes('options') || text.includes('menu') || text.includes('list')))
  );

  if (isAskingNonVeg) {
    toolCalls.push({
      id: `call_${Date.now()}_filter_nonveg`,
      name: 'filter_menu',
      args: { veg_filter: 'NON_VEG', category: 'All', search_query: '' },
    });
    return {
      reply: 'Showing all non-vegetarian options on screen! Top recommendations are the Fiery Crispy Chicken Burger and Delhi Butter Chicken Burger.',
      toolCalls,
    };
  }

  const isAskingVeg = !isAskingNonVeg && (
    text.includes('veg option') ||
    text.includes('veg items') ||
    text.includes('vegetarian') ||
    text.includes('shakahari') ||
    text.includes('only veg') ||
    text.includes('pure veg') ||
    text.includes('all veg') ||
    text.includes('veg kya hai') ||
    text.includes('kya veg hai') ||
    (text.includes('veg burger') && (text.includes('what') || text.includes('show') || text.includes('dikhao') || text.includes('options') || text.includes('list'))) ||
    (text.includes('veg') && (text.includes('what') || text.includes('show') || text.includes('dikhao') || text.includes('options') || text.includes('menu') || text.includes('available') || text.includes('all') || text.includes('filter')))
  );

  if (isAskingVeg) {
    toolCalls.push({
      id: `call_${Date.now()}_filter_veg`,
      name: 'filter_menu',
      args: { veg_filter: 'VEG', category: 'All', search_query: '' },
    });
    return {
      reply: 'Showing all vegetarian options on screen! Our favorites are the Crispy Makhani Paneer Burger, Desi Masala Aloo Tikki, and Double Cheddar Crunch.',
      toolCalls,
    };
  }

  // 3c. Standalone or Inquired Category Filtering
  const isOrderOrCartIntent = (
    text.includes('order') ||
    text.includes('want') ||
    text.includes('give') ||
    text.includes('add') ||
    text.includes('buy') ||
    text.includes('can i have') ||
    text.includes("i'll have") ||
    text.includes('ill have') ||
    text.includes('chahiye') ||
    text.includes('lagao') ||
    text.includes('daal do') ||
    text.includes('kardo') ||
    text.includes('kar do')
  );

  const isSpecificBeverageMentioned = (
    text.includes('belgian') ||
    text.includes('chocolate') ||
    text.includes('coke') ||
    text.includes('cola') ||
    text.includes('thums up') ||
    text.includes('thumbs up') ||
    text.includes('iced tea') ||
    text.includes('peach') ||
    text.includes('mango') ||
    text.includes('chaas') ||
    text.includes('buttermilk') ||
    text.includes('water')
  );

  const isSpecificSideMentioned = (
    text.includes('peri') ||
    text.includes('piri') ||
    text.includes('salted') ||
    text.includes('lava') ||
    text.includes('cheese fries') ||
    text.includes('onion ring') ||
    text.includes('rings') ||
    text.includes('nugget') ||
    text.includes('wings') ||
    text.includes('popcorn') ||
    text.includes('wedges')
  );

  const isSpecificDessertMentioned = (
    text.includes('oreo') ||
    text.includes('mcflurry') ||
    text.includes('swirl') ||
    text.includes('brownie') ||
    text.includes('apple pie') ||
    text.includes('gulab') ||
    text.includes('jamun') ||
    text.includes('sundae') ||
    text.includes('strawberry')
  );

  // Beverages / Drinks inquiry: "drinks", "drink", "cold drinks", "beverages", "shakes", "soda", "peene ka"
  const isDrinksInquiry = !isSpecificBeverageMentioned && !isOrderOrCartIntent && (
    text === 'drinks' ||
    text === 'drink' ||
    text === 'beverages' ||
    text === 'beverage' ||
    text === 'cold drinks' ||
    text === 'cold drink' ||
    text === 'shakes' ||
    text === 'shake' ||
    text === 'soft drinks' ||
    text === 'soda' ||
    text.startsWith('drinks') ||
    text.endsWith('drinks') ||
    text === 'peene ka' ||
    (
      (text.includes('drink') || text.includes('beverage') || text.includes('shake') || text.includes('cold drink') || text.includes('peene') || text.includes('soft drink')) &&
      (text.includes('what') || text.includes('show') || text.includes('dikhao') || text.includes('options') || text.includes('menu') || text.includes('list') || text.includes('available') || text.includes('filter'))
    )
  );

  if (isDrinksInquiry) {
    toolCalls.push({
      id: `call_${Date.now()}_filter_bev`,
      name: 'filter_menu',
      args: { category: 'Beverages', veg_filter: 'ALL', search_query: '' },
    });
    return {
      reply: 'Showing all 7 refreshing drinks and shakes on your screen! We have Coke Zero, Thums Up, Alphonso Mango Shake, and Peach Iced Tea. Which one would you like?',
      toolCalls,
    };
  }

  // Burgers inquiry: "burgers", "burger", "show burgers", "burgers menu"
  const isBurgersInquiry = (
    text === 'burgers' ||
    text === 'burger' ||
    text === 'all burgers' ||
    (
      (text.includes('burger') || text.includes('burgers')) &&
      (text.includes('what') || text.includes('show') || text.includes('dikhao') || text.includes('options') || text.includes('menu') || text.includes('list') || text.includes('available') || text.includes('filter')) &&
      !text.includes('paneer') && !text.includes('tikki') && !text.includes('chicken') && !text.includes('mutton') && !text.includes('add')
    )
  );

  if (isBurgersInquiry) {
    toolCalls.push({
      id: `call_${Date.now()}_filter_burgers`,
      name: 'filter_menu',
      args: { category: 'Burgers', veg_filter: 'ALL', search_query: '' },
    });
    return {
      reply: 'Showing all 10 delicious burgers on screen! We have Crispy Makhani Paneer, Fiery Crispy Chicken, and Double Cheddar Crunch. What can I get for you?',
      toolCalls,
    };
  }

  // Sides & Fries inquiry: "sides", "side", "tides", "tide", "fries", "french fries", "snacks"
  const isSidesInquiry = !isSpecificSideMentioned && !isOrderOrCartIntent && (
    text === 'sides' ||
    text === 'side' ||
    text === 'tides' ||
    text === 'tide' ||
    text === 'tight' ||
    text === 'tights' ||
    text === 'sites' ||
    text === 'slides' ||
    text === 'fries' ||
    text === 'french fries' ||
    text === 'all fries' ||
    text === 'all sides' ||
    text === 'all tides' ||
    (
      (text.includes('side') || text.includes('tide') || text.includes('fries') || text.includes('snack')) &&
      (text.includes('what') || text.includes('show') || text.includes('dikhao') || text.includes('options') || text.includes('menu') || text.includes('list') || text.includes('available') || text.includes('filter'))
    )
  );

  if (isSidesInquiry) {
    toolCalls.push({
      id: `call_${Date.now()}_filter_sides`,
      name: 'filter_menu',
      args: { category: 'Sides', veg_filter: 'ALL', search_query: '' },
    });
    return {
      reply: 'Showing our crispy sides and fries on screen! We have Piri-Piri Shaker Fries, loaded Lava Cheese Fries, and Paneer Popcorn.',
      toolCalls,
    };
  }

  // Desserts inquiry: "desserts", "dessert", "deserts", "desert", "sweet", "sweets", "meetha", "ice cream"
  const isDessertsInquiry = !isSpecificDessertMentioned && !isOrderOrCartIntent && (
    text === 'desserts' ||
    text === 'dessert' ||
    text === 'deserts' ||
    text === 'desert' ||
    text === 'dezert' ||
    text === 'dezerts' ||
    text === 'sweets' ||
    text === 'sweet' ||
    text === 'meetha' ||
    text === 'ice cream' ||
    (
      (text.includes('dessert') || text.includes('desert') || text.includes('dezert') || text.includes('sweet') || text.includes('meetha') || text.includes('ice cream')) &&
      (text.includes('what') || text.includes('show') || text.includes('dikhao') || text.includes('options') || text.includes('menu') || text.includes('list') || text.includes('available') || text.includes('filter'))
    )
  );

  if (isDessertsInquiry) {
    toolCalls.push({
      id: `call_${Date.now()}_filter_desserts`,
      name: 'filter_menu',
      args: { category: 'Desserts', veg_filter: 'ALL', search_query: '' },
    });
    return {
      reply: 'Showing our sweet desserts on screen! We have Oreo Crunch Swirl, Sizzling Choco Brownie, and warm Gulab Jamun.',
      toolCalls,
    };
  }

  // Reset / Clear Filters / Show All Menu
  const isResettingFilters = (
    text.includes('show all') ||
    text.includes('all items') ||
    text.includes('full menu') ||
    text.includes('complete menu') ||
    text.includes('pura menu') ||
    text.includes('no filter') ||
    (text.includes('clear') && text.includes('filter')) ||
    (text.includes('reset') && text.includes('filter')) ||
    (text.includes('remove') && text.includes('filter')) ||
    (text.includes('clean') && text.includes('filter'))
  );

  if (isResettingFilters) {
    toolCalls.push({
      id: `call_${Date.now()}_filter_all`,
      name: 'filter_menu',
      args: { veg_filter: 'ALL', category: 'All', search_query: '' },
    });
    return {
      reply: 'Cleared all filters and displaying our complete menu catalog on screen.',
      toolCalls,
    };
  }

  // Recommendations / Bestsellers
  if (
    text.includes('recommend') ||
    text.includes('bestseller') ||
    text.includes('best seller') ||
    text.includes('popular') ||
    text.includes('specialty') ||
    text.includes('kya acha hai') ||
    text.includes('what is good')
  ) {
    toolCalls.push({
      id: `call_${Date.now()}_filter_rec`,
      name: 'filter_menu',
      args: { category: 'Burgers', veg_filter: 'ALL', search_query: '' },
    });
    return {
      reply: 'Our top favorites are the Crispy Makhani Paneer Burger and Fiery Crispy Chicken Burger! Both are displayed on your screen.',
      toolCalls,
    };
  }

  // 4. Order Type Setting (Dine In vs Takeaway)
  let detectedOrderType: 'DINE_IN' | 'TAKEAWAY' | null = null;
  if (text.includes('takeaway') || text.includes('take away') || text.includes('to go') || text.includes('pack')) {
    detectedOrderType = 'TAKEAWAY';
  } else if (text.includes('dine in') || text.includes('dine-in') || text.includes('eat here') || text.includes('here')) {
    detectedOrderType = 'DINE_IN';
  }

  // 5. Payment Methods
  // NOTE: word boundaries are required — a bare includes('card') matched the
  // "card" inside "discard" and started CARD payment on "discard my order".
  if (/\bupi\b|\bqr\b|gpay|phonepe|paytm/.test(text)) {
    toolCalls.push({
      id: `call_${Date.now()}_pay`,
      name: 'request_payment',
      args: { payment_method: 'UPI_QR' },
    });
    return {
      reply: 'Displaying UPI QR code on screen. Please scan with any UPI app.',
      toolCalls,
    };
  }

  if (/\bcard\b|\bterminal\b|\bcredit\b|\bdebit\b|\bpos\b/.test(text)) {
    toolCalls.push({
      id: `call_${Date.now()}_pay`,
      name: 'request_payment',
      args: { payment_method: 'CARD_TERMINAL' },
    });
    return {
      reply: 'Please insert or tap your card on the payment terminal below.',
      toolCalls,
    };
  }

  // 6. Confirm Order / Checkout
  if (
    text.includes('confirm') ||
    text.includes('checkout') ||
    text.includes('place order') ||
    text.includes('done ordering')
  ) {
    toolCalls.push({
      id: `call_${Date.now()}_confirm`,
      name: 'confirm_order',
      args: {},
    });
    // Only chain payment when there is actually something to pay for —
    // an empty cart must never reach the payment screen.
    if ((orderState?.items?.length || 0) > 0) {
      toolCalls.push({
        id: `call_${Date.now()}_pay_def`,
        name: 'request_payment',
        args: { payment_method: 'UPI_QR' },
      });
      return {
        reply: 'Order confirmed! Please choose UPI, Card, or Cash to complete payment.',
        toolCalls,
      };
    }
    return {
      reply: "Your tray is empty — please add something tasty before checking out!",
      toolCalls,
    };
  }

  // 7. Order Summary / Total Bill Inquiry
  if (
    text.includes('summary') ||
    text.includes('bill') ||
    text.includes('total') ||
    text.includes('what did i order') ||
    text.includes('order so far')
  ) {
    toolCalls.push({
      id: `call_${Date.now()}_summary`,
      name: 'get_order_summary',
      args: {},
    });
    const total = orderState?.totalAmountPaise ? (orderState.totalAmountPaise / 100).toFixed(2) : '0';
    return {
      reply: `Your current order has ${orderState?.itemCount || 0} items with a total of ₹${total} including taxes.`,
      toolCalls,
    };
  }

  // 8. Combo Upgrade
  if (text.includes('combo') || text.includes('meal')) {
    const burgerLine = orderState?.items?.find((i: any) => i.menuItem?.category === 'Burgers');
    let drinkId = 'bev_coke';
    if (text.includes('thums up') || text.includes('thumbs up')) drinkId = 'bev_thums_up';
    else if (text.includes('iced tea')) drinkId = 'bev_iced_tea';
    else if (text.includes('water')) drinkId = 'bev_mineral_water';

    if (burgerLine) {
      toolCalls.push({
        id: `call_${Date.now()}_combo`,
        name: 'apply_combo',
        args: { line_id: burgerLine.lineId, drink_item_id: drinkId },
      });
      return {
        reply: 'Upgraded your burger to a Meal Combo with fries and drink (+₹79)!',
        toolCalls,
      };
    }
  }

  // 9a. Negation guard: "I did not order any fries" must never ADD the item.
  const isNegation =
    /^(i|we)\b/.test(text) &&
    /\b(did not|didn'?t|do not|don'?t|never|haven'?t|have not|not)\b/.test(text) &&
    /\b(order|ordered|add|added|want|wanted|get|got|take|took|asked for)\b/.test(text);

  if (isNegation) {
    const cartItems = orderState?.items || [];
    if (cartItems.length === 0) {
      return {
        reply: "Your tray is empty — you haven't ordered anything yet.",
        toolCalls: [],
      };
    }
    const negatedWord = text
      .split(/\s+/)
      .map(w => w.replace(/[^a-z]/g, ''))
      .find(
        w =>
          w.length > 3 &&
          !['order', 'ordered', 'adding', 'never', 'dont'].includes(w) &&
          SEED_MENU_ITEMS.some(it =>
            (it.nameEn + ' ' + it.synonyms.join(' ')).toLowerCase().includes(w)
          )
      );
    const inTray = negatedWord
      ? cartItems.find((it: any) =>
        (it.menuItem.nameEn + ' ' + it.menuItem.synonyms.join(' ')).toLowerCase().includes(negatedWord)
      )
      : null;
    if (inTray) {
      return {
        reply: `You currently have ${inTray.menuItem.nameEn} in your tray. Would you like me to remove it?`,
        toolCalls: [],
      };
    }
    return {
      reply: negatedWord
        ? `You haven't ordered any ${negatedWord} yet — would you like to add one?`
        : "I couldn't find that in your tray. Here's what you have — would you like to change something?",
      toolCalls: negatedWord ? [] : [{ id: `call_${Date.now()}_summary`, name: 'get_order_summary', args: {} }],
    };
  }

  // 9b. Question & Inquiry Gate — questions answer/search, they NEVER mutate the cart.
  // ("How much is the paneer burger?" previously ADDED the burger to the tray.)
  //
  // BUT: polite REQUESTS often end with "?" ("Can I get one apple pie dessert
  // please?") — those are orders, not inquiries. Bypass the gate for explicit
  // request phrasing unless the utterance also carries real question intent
  // ("I want to know how many calories…" must still search, never add).
  const hasQuestionIntent =
    /^(how|what|which|who|when|why|where)\b/.test(text) ||
    /\b(how many|how much|how many calories|calories|calorie|carbs|protein|do you have|does (it|this|that|your) have|is there|are there|what is|what's|whats|what are)\b/.test(text);

  const isExplicitRequest =
    !hasQuestionIntent &&
    /\b(add|get me|give me|bring me|i want|i'd like|i would like|we want|we'd like|we would like|let me have|may i get|can i get|could i get|can i have|could i have|may i have|can we get|could we get)\b/.test(text);

  const looksLikeQuestion = !isExplicitRequest && (
    text.includes('?') ||
    /^(how|what|which|who|when|why|where)\b/.test(text) ||
    /^(do|does|did|is|are|was|were)\s+(you|your|we|the|this|that|there|it|they|any|your)\b/.test(text) ||
    /\b(how much|how many|calories|do you have|does (it|this|that) have|is there|are there|what is the|what's the|whats the)\b/.test(text)
  );

  if (looksLikeQuestion) {
    // Strip question scaffolding to recover the food noun phrase, then search.
    const q = text
      .replace(/\?/g, ' ')
      .replace(/\b(how many|how much|how many calories|calories|calorie|carbs|protein)\b/g, ' ')
      .replace(/\b(do you have|does your|do your|is there|are there|have you got|got any|any)\b/g, ' ')
      .replace(/\b(what is|what's|whats|what are|which is|tell me|information|info)\b/g, ' ')
      .replace(/\b(is the|is your|is this|is that|are the|are your|are these|are those|the|a|an|your|this|that|these|those|there|it)\b/g, ' ')
      .replace(/\b(are|is|do|does|did|we|you|in|of|for|on|to|at|with|and|or|please|now|right|today)\b/g, ' ')
      .replace(/\b(good|nice|tasty|great|delicious|yummy|fresh|available|made|using|contain|contains|have|worth|cost|price)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (q.length >= 3) {
      const matchCount = countMenuMatches(q);
      if (matchCount > 0) {
        toolCalls.push({
          id: `call_${Date.now()}_qsearch`,
          name: 'search_menu',
          args: { query: q },
        });
        return {
          reply: `Found ${matchCount} matching ${matchCount === 1 ? 'item' : 'items'} on screen! Take a look and let me know what you'd like.`,
          toolCalls,
        };
      }
    }
    toolCalls.push({
      id: `call_${Date.now()}_qfilter`,
      name: 'filter_menu',
      args: { category: 'All', veg_filter: 'ALL', search_query: '' },
    });
    return {
      reply: "I couldn't find that on our menu. We have Burgers, Sides, Drinks, and Desserts — what would you like?",
      toolCalls,
    };
  }

  // 11. Add Items
  // Parse quantity words in English, Hindi, and numbers
  const parseQuantity = (input: string): number => {
    if (/\b(50|fifty)\b/i.test(input)) return 50; // Triggers quantity cap test
    if (/\b(100|hundred)\b/i.test(input)) return 100;
    if (/\b(three|3|teen)\b/i.test(input)) return 3;
    if (/\b(two|2|do)\b/i.test(input)) return 2;
    if (/\b(four|4|char|chaar)\b/i.test(input)) return 4;
    if (/\b(five|5|paanch)\b/i.test(input)) return 5;
    if (/\b(six|6)\b/i.test(input)) return 6;
    return 1;
  };

  const parsedQty = parseQuantity(text);

  // Check modifier keywords
  const modifierIds: string[] = [];
  if (text.includes('extra cheese') || text.includes('cheese add')) modifierIds.push('mod_extra_cheese');
  if (text.includes('bina onion') || text.includes('no onion') || text.includes('bina pyaz')) modifierIds.push('mod_no_onion');
  if (text.includes('no pickle') || text.includes('bina achar')) modifierIds.push('mod_no_pickles');
  if (text.includes('jalapeno')) modifierIds.push('mod_spicy_jalapenos');

  // Strip modifier phrases from the text used for ITEM matching, so
  // "coke zero with extra cheddar cheese" doesn't also match the
  // Double Cheddar Crunch burger via the word "cheddar". Modifier detection
  // above still runs on the original text.
  const matchText = text.replace(
    /\b(extra (?:cheddar )?cheese|add cheese|cheese add|bina onion|no onion|bina pyaz|no pickle|no pickles|bina achar|jalapenos?|extra cheddar)\b/g,
    ' '
  );

  // Find matching items from SEED_MENU_ITEMS
  const matchedItems: Array<{ item: typeof SEED_MENU_ITEMS[0]; qty: number; matchedPhrase: string }> = [];

  // DIRECT "ADD <ITEM>" RULE:
  // If the user says "add ..." in front of any item name, guarantee direct addition to the cart!
  const addMatch = matchText.match(/\b(?:add|daal do|dalo|lagao|kardo|kar do|include)\s+(?:one|two|three|1|2|3|ek|do|a|an)?\s*(.+)/i);
  if (addMatch && addMatch[1]) {
    const rawTarget = addMatch[1].trim();
    let bestDirectMatch: { item: typeof SEED_MENU_ITEMS[0]; matchedPhrase: string } | null = null;
    let longestMatchLen = 0;

    for (const item of SEED_MENU_ITEMS) {
      const en = item.nameEn.toLowerCase();
      let phrase = '';
      if (en.includes(rawTarget) || rawTarget.includes(en)) {
        phrase = en;
      } else {
        for (const s of item.synonyms) {
          const sl = s.toLowerCase();
          if (rawTarget.includes(sl) || sl.includes(rawTarget)) {
            if (sl.length > phrase.length) {
              phrase = sl;
            }
          }
        }
      }

      if (phrase.length > longestMatchLen) {
        longestMatchLen = phrase.length;
        bestDirectMatch = { item, matchedPhrase: phrase };
      }
    }

    if (bestDirectMatch) {
      matchedItems.push({ item: bestDirectMatch.item, qty: parsedQty, matchedPhrase: bestDirectMatch.matchedPhrase });
    }
  }

  // If direct "add ..." didn't match, run general multi-item parser
  if (matchedItems.length === 0) {
    for (const item of SEED_MENU_ITEMS) {
      const enName = item.nameEn.toLowerCase();
      const hiName = item.nameHi;
      let matchedPhrase: string | null = null;
      if (includesPhrase(matchText, enName)) {
        matchedPhrase = enName;
      } else if (hiName && includesPhrase(matchText, hiName)) {
        matchedPhrase = hiName;
      } else {
        // Find longest matching synonym (word-boundary aware: "tea" must not
        // match inside "instead")
        let bestSyn: string | null = null;
        for (const syn of item.synonyms) {
          const s = syn.toLowerCase();
          if (includesPhrase(matchText, s)) {
            if (!bestSyn || s.length > bestSyn.length) {
              bestSyn = s;
            }
          }
        }
        if (bestSyn) matchedPhrase = bestSyn;
      }

      if (matchedPhrase) {
        // Don't duplicate if already matched
        if (!matchedItems.some(m => m.item.id === item.id)) {
          let itemQty = parsedQty;
          const matchIdx = matchText.indexOf(matchedPhrase);
          if (matchIdx > 0) {
            // Inspect up to 24 characters immediately before the matched item phrase
            const prefixWindow = matchText.slice(Math.max(0, matchIdx - 24), matchIdx).trim();
            const lastTokens = prefixWindow.split(/\s+/).slice(-2).join(' ');
            if (/\b(1|one|ek|a|an)\b/i.test(lastTokens)) {
              itemQty = 1;
            } else if (/\b(2|two|do)\b/i.test(lastTokens)) {
              itemQty = 2;
            } else if (/\b(3|three|teen)\b/i.test(lastTokens)) {
              itemQty = 3;
            } else if (/\b(4|four|char|chaar)\b/i.test(lastTokens)) {
              itemQty = 4;
            } else if (/\b(5|five|paanch)\b/i.test(lastTokens)) {
              itemQty = 5;
            }
          }
          matchedItems.push({ item, qty: itemQty, matchedPhrase });
        }
      }
    }
  }

  // Deduplicate overlapping substring matches:
  // e.g. If "peri fries" matched s_peri_fries, and "fries" matched s_salted_fries,
  // "fries" is a substring of the more specific "peri fries", so discard the generic match!
  if (matchedItems.length > 1) {
    const filteredMatches = matchedItems.filter(current => {
      const isSubMatchOfOther = matchedItems.some(other => {
        if (other.item.id === current.item.id) return false;
        return (
          other.matchedPhrase.length > current.matchedPhrase.length &&
          (other.matchedPhrase.includes(current.matchedPhrase) ||
            (matchText.indexOf(other.matchedPhrase) <= matchText.indexOf(current.matchedPhrase) &&
              matchText.indexOf(other.matchedPhrase) + other.matchedPhrase.length >= matchText.indexOf(current.matchedPhrase) + current.matchedPhrase.length))
        );
      });
      return !isSubMatchOfOther;
    });
    if (filteredMatches.length > 0) {
      matchedItems.length = 0;
      matchedItems.push(...filteredMatches);
    }
  }

  // 11b. Nearest Product Matching (with 50% match threshold)
  // Reaches nearest product and adds to cart if there is a >= 50% match.
  // If several items tie (e.g. "Mujhe ek badhiya sa burger do"), the request is
  // ambiguous: offer options via search_menu instead of adding a random item
  // the customer never chose.
  let ambiguityQuery: string | null = null;
  if (matchedItems.length === 0) {
    const rawClauses = matchText
      .split(/\b(and|aur|\+|plus|,)\b/i)
      .map(c => c.trim())
      .filter(c => c.length > 2);
    const clausesToEvaluate = rawClauses.length > 1 ? rawClauses : [matchText];

    for (const clause of clausesToEvaluate) {
      const scored = SEED_MENU_ITEMS
        .map(item => ({ item, score: scoreMenuItemMatch(clause, item).score }))
        .filter(s => s.score >= 0.5)
        .sort((a, b) => b.score - a.score);

      if (scored.length === 0) continue;

      const top = scored[0];
      const isAmbiguous = scored.length > 1 && top.score - scored[1].score < 0.15;

      if (isAmbiguous) {
        // Build the most specific search token from words that actually appear
        // in catalog item names (e.g. "burger" for "badhiya sa burger").
        const tokens = Array.from(
          new Set(
            clause
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, ' ')
              .split(/\s+/)
              .filter(t => t.length >= 3)
          )
        );
        let bestToken = '';
        let bestHits = 0;
        for (const t of tokens) {
          const hits = SEED_MENU_ITEMS.filter(it =>
            it.nameEn.toLowerCase().split(/[^a-z0-9]+/).includes(t)
          ).length;
          if (hits > bestHits) {
            bestHits = hits;
            bestToken = t;
          }
        }
        if (!ambiguityQuery) {
          ambiguityQuery = bestToken || top.item.category.toLowerCase();
        }
        continue;
      }

      let clauseQty = parsedQty;
      if (/\b(1|one|ek|a|an)\b/i.test(clause)) clauseQty = 1;
      else if (/\b(2|two|do)\b/i.test(clause)) clauseQty = 2;
      else if (/\b(3|three|teen)\b/i.test(clause)) clauseQty = 3;
      else if (/\b(4|four|char|chaar)\b/i.test(clause)) clauseQty = 4;
      else if (/\b(5|five|paanch)\b/i.test(clause)) clauseQty = 5;

      if (!matchedItems.some(m => m.item.id === top.item.id)) {
        matchedItems.push({ item: top.item, qty: clauseQty, matchedPhrase: top.item.nameEn.toLowerCase() });
      }
    }

    if (matchedItems.length === 0 && ambiguityQuery) {
      const n = countMenuMatches(ambiguityQuery);
      toolCalls.push({
        id: `call_${Date.now()}_ambsearch`,
        name: 'search_menu',
        args: { query: ambiguityQuery },
      });
      return {
        reply: `That could be a few things! Here ${n === 1 ? 'is 1 matching option' : `are ${n} matching options`} on screen — just tell me which one you'd like.`,
        toolCalls,
      };
    }
  }

  if (matchedItems.length > 0) {
    const itemNamesAdded: string[] = [];
    for (const match of matchedItems) {
      toolCalls.push({
        id: `call_${Date.now()}_${match.item.id}`,
        name: 'add_item',
        args: {
          item_id: match.item.id,
          quantity: match.qty,
          modifier_ids: modifierIds,
        },
      });
      itemNamesAdded.push(`${match.qty}x ${match.item.nameEn}`);
    }

    if (detectedOrderType) {
      toolCalls.push({
        id: `call_${Date.now()}_type`,
        name: 'set_order_type',
        args: { order_type: detectedOrderType },
      });
    }

    const firstItem = matchedItems[0].item;
    if (!firstItem.inStock) {
      reply = `Sorry, ${firstItem.nameEn} is currently out of stock. Would you like a Brownie or Oreo Swirl instead?`;
    } else {
      reply = `Ji, added ${itemNamesAdded.join(' and ')} to your tray! Anything else?`;
    }

    return { reply, toolCalls };
  }

  // 12. If only Order Type is specified
  if (detectedOrderType) {
    toolCalls.push({
      id: `call_${Date.now()}_type`,
      name: 'set_order_type',
      args: { order_type: detectedOrderType },
    });
    return {
      reply: `Order set for ${detectedOrderType === 'TAKEAWAY' ? 'Takeaway' : 'Dine-In'}. What would you like to order?`,
      toolCalls,
    };
  }

  // 13. Search Menu fallback
  const cleanKeyword = text
    .replace(/\b(search for|search|find|show me|show|options|option|items|item|menu|dikhao|batao|kya hai|please)\b/gi, '')
    .trim();
  const queryToSearch = cleanKeyword || text;

  // Filter single-letter or stray short noise tokens (e.g. "b", "a", "of")
  if (queryToSearch.length < 3) {
    return {
      reply: '',
      toolCalls: [],
    };
  }

  // Category fallback if query is synonymous with a category
  if (
    queryToSearch === 'drinks' ||
    queryToSearch === 'drink' ||
    queryToSearch === 'beverages' ||
    queryToSearch === 'beverage' ||
    queryToSearch === 'cold drinks' ||
    queryToSearch === 'cold drink' ||
    queryToSearch === 'shakes'
  ) {
    toolCalls.push({
      id: `call_${Date.now()}_filter_bev`,
      name: 'filter_menu',
      args: { category: 'Beverages', veg_filter: 'ALL', search_query: '' },
    });
    return {
      reply: 'Showing all 7 refreshing drinks and shakes on your screen! We have Coke Zero, Thums Up, Alphonso Mango Shake, and Peach Iced Tea. Which one would you like?',
      toolCalls,
    };
  }

  if (queryToSearch === 'burgers' || queryToSearch === 'burger') {
    toolCalls.push({
      id: `call_${Date.now()}_filter_burgers`,
      name: 'filter_menu',
      args: { category: 'Burgers', veg_filter: 'ALL', search_query: '' },
    });
    return {
      reply: 'Showing all 10 delicious burgers on screen! We have Crispy Makhani Paneer, Fiery Crispy Chicken, and Double Cheddar Crunch. What can I get for you?',
      toolCalls,
    };
  }

  if (
    queryToSearch === 'sides' ||
    queryToSearch === 'side' ||
    queryToSearch === 'tides' ||
    queryToSearch === 'tide' ||
    queryToSearch === 'fries' ||
    queryToSearch === 'french fries'
  ) {
    toolCalls.push({
      id: `call_${Date.now()}_filter_sides`,
      name: 'filter_menu',
      args: { category: 'Sides', veg_filter: 'ALL', search_query: '' },
    });
    return {
      reply: 'Showing our crispy sides and fries on screen! We have Piri-Piri Shaker Fries, loaded Lava Cheese Fries, and Paneer Popcorn.',
      toolCalls,
    };
  }

  if (
    queryToSearch === 'desserts' ||
    queryToSearch === 'dessert' ||
    queryToSearch === 'deserts' ||
    queryToSearch === 'desert' ||
    queryToSearch === 'dezert' ||
    queryToSearch === 'sweets' ||
    queryToSearch === 'meetha'
  ) {
    toolCalls.push({
      id: `call_${Date.now()}_filter_desserts`,
      name: 'filter_menu',
      args: { category: 'Desserts', veg_filter: 'ALL', search_query: '' },
    });
    return {
      reply: 'Showing our sweet desserts on screen! We have Oreo Crunch Swirl, Sizzling Choco Brownie, and warm Gulab Jamun.',
      toolCalls,
    };
  }

  // Count items matching this search query
  const matchCount = countMenuMatches(queryToSearch);

  // If 0 items match:
  if (matchCount === 0) {
    // Check if utterance is casual background conversation between people near the kiosk
    const isExplicitSearchOrFood = (
      /\b(search for|search|find|dikhao|batao|kya hai|do you have|is there|kya milta|options|menu)\b/i.test(text) ||
      /\b(food|burger|fries|finger|snack|drink|beverage|shake|tea|coffee|water|paani|sweets|dessert|brownie|cake|ice cream|swirl|paneer|chicken|makhani|tikki|aloo|crispy|cheese|patty|bun|sauce|mayo|dip|onion|pickle|jalapeno|spicy|combo|meal|veg|nonveg|non-veg|vegan|khana|peena|order|parcel|takeaway|dine|tray|cart|bill|pay|payment|kiosk|pizza|dosa|samosa|momos|biryani|noodles|pasta|wrap|roll)\b/i.test(text) ||
      // Prompt-injection attempts are not background chatter: answer with a
      // harmless search instead of staying silent or touching the cart.
      /\b(system|override|instructions|sudo|database|environment|password|administrator|command|injection|root)\b/i.test(text)
    );

    // If there is no mention of food, menu, or kiosk actions, discard background chatter silently!
    if (!isExplicitSearchOrFood) {
      console.log(`[NLU] Silently ignored background conversation: "${text}"`);
      return {
        reply: '',
        toolCalls: [],
      };
    }

    // Emit search_menu (not filter_menu) so unresolvable queries are handled by
    // the same search path as every other lookup.
    toolCalls.push({
      id: `call_${Date.now()}_search_nomatch`,
      name: 'search_menu',
      args: { query: queryToSearch },
    });
    return {
      reply: `I couldn't find any items matching "${queryToSearch}". Would you like to check out our Burgers, Sides, Drinks, or Desserts instead?`,
      toolCalls,
    };
  }

  toolCalls.push({
    id: `call_${Date.now()}_search`,
    name: 'search_menu',
    args: { query: queryToSearch },
  });
  return {
    reply: `Found ${matchCount} matching ${matchCount === 1 ? 'item' : 'items'} on screen! Take a look and let me know what you'd like to add.`,
    toolCalls,
  };
}
