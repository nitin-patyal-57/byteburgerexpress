import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, type FunctionDeclaration } from '@google/genai';
import { SEED_MENU_ITEMS } from './src/data/seedMenu.ts';
import { parseDeterministicIntent } from './src/core/nluFallback.ts';
import { normalizeQSRSpokenUtterance } from './src/core/acousticNormalizer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '1mb' }));

// CORS: the Capacitor app runs from https://localhost and calls this server cross-origin
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Kiosk-Token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Optional shared-secret check: set KIOSK_API_TOKEN on the server to require X-Kiosk-Token on /api/v1 routes
app.use('/api/v1', (req, res, next) => {
  const required = (process.env.KIOSK_API_TOKEN || '').trim();
  if (required && req.header('X-Kiosk-Token') !== required) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Initialize Google GenAI client (server-side only)
const rawApiKey = (process.env.GEMINI_API_KEY || '').trim();
const isApiKeyConfigured = Boolean(
  rawApiKey &&
  rawApiKey !== 'MY_GEMINI_API_KEY' &&
  !rawApiKey.startsWith('MY_') &&
  rawApiKey.length > 10
);

const ai = new GoogleGenAI({
  apiKey: isApiKeyConfigured ? rawApiKey : 'placeholder',
  httpOptions: {
    timeout: 5000,
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Idempotent order processing cache
const processedOrders = new Map<string, any>();
let kitchenTicketCounter = 100;

// Gemini Function Declarations for VoiceOrder Kiosk (11 tools)
const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'search_menu',
    description: 'Search the restaurant menu by query string, cuisine, or category.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "The search term (e.g., 'burger', 'aloo tikki', 'cold drink', 'sauce').",
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'filter_menu',
    description: 'Filter the visible menu items on the customer screen by dietary preference (VEG, NON_VEG, ALL), category (Burgers, Sides, Beverages, Desserts, All), or search query string.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        veg_filter: {
          type: Type.STRING,
          enum: ['VEG', 'NON_VEG', 'ALL'],
          description: 'Filter by vegetarian or non-vegetarian items.',
        },
        category: {
          type: Type.STRING,
          enum: ['All', 'Burgers', 'Sides', 'Beverages', 'Desserts'],
          description: 'Filter by menu category.',
        },
        search_query: {
          type: Type.STRING,
          description: 'Keyword search query to display matching products on screen.',
        },
      },
    },
  },
  {
    name: 'add_item',
    description: 'Add an item from the menu to the cart with specified quantity and optional modifier IDs.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        item_id: {
          type: Type.STRING,
          description: "The unique menu item identifier (e.g., 'b_makhani_paneer', 'b_aloo_tikki', 'b_spicy_chicken', 'bev_coke', 's_peri_fries').",
        },
        quantity: {
          type: Type.INTEGER,
          description: 'Number of items to add (1 to 20).',
        },
        modifier_ids: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "Optional modifier IDs (e.g., 'mod_extra_cheese', 'mod_no_onion', 'mod_no_pickles', 'mod_spicy_jalapenos').",
        },
      },
      required: ['item_id', 'quantity'],
    },
  },
  {
    name: 'remove_item',
    description: "Remove a specific line item from the active cart. Invoke this when the customer asks to remove, cancel, or delete a single item (e.g., 'remove the coke', 'cancel the coke', 'cancel one item', 'delete burger'). NEVER call cancel_order for single item removals!",
    parameters: {
      type: Type.OBJECT,
      properties: {
        line_id: {
          type: Type.STRING,
          description: 'The unique cart line item ID to remove.',
        },
      },
      required: ['line_id'],
    },
  },
  {
    name: 'update_item',
    description: "Modify the quantity of an existing line item in the cart (e.g., 'change coke quantity to 2', 'make it 3', 'make coke 2', '2 burgers instead of 1', 'add 1 more coke', 'reduce burger to 1'). Setting quantity to 0 removes the item.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        line_id: {
          type: Type.STRING,
          description: 'The existing cart line item ID.',
        },
        quantity: {
          type: Type.INTEGER,
          description: 'New quantity (0 to 20). 0 removes the item.',
        },
        add_modifier_ids: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        remove_modifier_ids: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ['line_id'],
    },
  },
  {
    name: 'set_order_type',
    description: 'Set whether this order is Dine-In or Takeaway.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        order_type: {
          type: Type.STRING,
          enum: ['DINE_IN', 'TAKEAWAY'],
          description: 'Dining preference.',
        },
      },
      required: ['order_type'],
    },
  },
  {
    name: 'apply_combo',
    description: 'Upgrade an existing burger line item to a meal combo (includes medium fries and drink for +Rs 79).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        line_id: {
          type: Type.STRING,
          description: 'The burger line item ID.',
        },
        drink_item_id: {
          type: Type.STRING,
          description: "Selected beverage item ID (e.g., 'bev_coke', 'bev_thums_up', 'bev_iced_tea').",
        },
      },
      required: ['line_id', 'drink_item_id'],
    },
  },
  {
    name: 'get_order_summary',
    description: 'Retrieve the current authoritative state, list of items, and tax-inclusive total of the order.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        detail_level: {
          type: Type.STRING,
          description: "Detail level of summary ('brief' or 'full')",
        },
      },
    },
  },
  {
    name: 'confirm_order',
    description: 'Marks the order as explicitly confirmed by the customer after verbal read-back.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        confirmed: {
          type: Type.BOOLEAN,
          description: 'Explicit confirmation flag',
        },
      },
    },
  },
  {
    name: 'request_payment',
    description: 'Transitions the kiosk to the payment screen for the selected method.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        payment_method: {
          type: Type.STRING,
          enum: ['UPI_QR', 'CARD_TERMINAL', 'CASH_COUNTER'],
          description: 'Payment channel chosen by the customer.',
        },
      },
      required: ['payment_method'],
    },
  },
  {
    name: 'cancel_order',
    description: "Clears the ENTIRE order and resets the cart. STRICT RULE: ONLY call this tool if the customer explicitly asks to cancel the WHOLE order, clear the entire cart, or start over from scratch (e.g. 'cancel whole order', 'clear tray', 'start over'). NEVER call cancel_order when the customer asks to remove, cancel, or reduce a single item (e.g. 'cancel the coke', 'remove coke', 'cancel one item'). For single items, call remove_item or update_item!",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: { type: Type.STRING },
      },
    },
  },
  {
    name: 'call_staff',
    description: 'Summons human floor staff to the kiosk for assistance or allergen verification.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: {
          type: Type.STRING,
          description: "Reason for summoning staff (e.g., 'Severe Peanut Allergy Inquiry', 'Celiac Disease', 'Cash payment request').",
        },
      },
      required: ['reason'],
    },
  },
];

const SYSTEM_INSTRUCTION = `You are "ByteBurger Voice Assistant", a fast, warm, and highly efficient voice ordering agent for a quick-service restaurant.
Your primary role is to help customers build, customize, confirm, and pay for their food orders entirely via spoken dialogue.

CRITICAL OPERATIONAL RULES:
1. DETERMINISTIC ACTIONS ONLY: You have NO authority to modify the customer's cart or finalize totals directly. You MUST call the appropriate function tool for EVERY item add, quantity change, modification, combo upsize, order type assignment, confirmation, and payment trigger.
2. CONCISE SPOKEN RESPONSES: Keep all spoken replies to 1-2 brief sentences (maximum 25 words). Do not list long menus unless explicitly asked.
3. LANGUAGE & CODE-SWITCHING: Understand English, Hindi, Hinglish, and Punjabi. Always reply in the exact language or mix of languages the customer uses. (e.g., if the customer says "Bhai ek paneer burger add kardo with extra cheese", respond in natural Hinglish: "Ji, Spicy Paneer Burger with extra cheese add kar diya hai! Anything to drink?").
4. ALLERGEN & NUTRITION SAFETY: If a customer asks about severe allergies (nuts, peanuts, gluten, celiac, shellfish), DO NOT state medical safety. Invoke call_staff(reason="Allergy inquiry") and tell the customer: "Please hold on, our restaurant manager will assist you with ingredient and allergen details right away."
5. SINGLE UPSELL RULE: Suggest at most ONE relevant upsell per order (e.g., fries, dips, or drinks if missing). If rejected, never ask again.
6. MANDATORY READ-BACK: Before calling request_payment, you MUST invoke get_order_summary, speak the final item count and key items, and require an explicit "Yes" or confirmation before calling confirm_order and request_payment. Spoken totals are purely for conversational comfort; state that the authoritative bill is displayed on screen.
7. SINGLE ITEM REMOVAL vs WHOLE CART CANCELLATION & QUANTITY CHANGES:
When a customer says 'cancel the coke', 'remove coke', 'cancel 1 burger', 'cancel one item', 'remove that item', or 'hata do', this is a SINGLE ITEM ACTION. You MUST invoke remove_item(line_id=...) or update_item(line_id=..., quantity=...). NEVER invoke cancel_order unless the customer explicitly commands to clear the ENTIRE tray, cancel the WHOLE order, or start completely over from scratch!
When a customer asks to change or update quantities (e.g., 'change coke quantity to 2', 'make it 3', 'make coke 2', '2 cokes instead of 1', 'add 1 more coke', 'reduce burger to 1', 'make burger 2'), you MUST invoke update_item(line_id=..., quantity=...).
8. DIETARY & CATEGORY MENU FILTERING & NEAREST CONTEXT: When a customer asks about dietary options or categories (e.g., 'What are the veg options?', 'Show non-veg burgers', 'What cold drinks do you have?', 'What do you recommend?'), or says ONLY a category word (e.g. 'Drinks', 'Drink', 'Cold drinks', 'Beverages', 'Burgers', 'Sides', 'Fries', 'Desserts'), NEVER repeat the user's utterance and NEVER leave the screen blank.
Always use nearest QSR context: If a user says "Deserts" or "Desert", intelligently understand they mean "Desserts" (filter_menu category='Desserts'). If speech recognition hears "Tides", "Tide", "Sites", or "Slides", intelligently understand they mean "Sides" (filter_menu category='Sides'). You MUST call filter_menu with the matching category, veg_filter='ALL', search_query='', and provide a warm spoken recommendation of 2-3 popular items.
If a customer searches or asks for something with 0 matching items (or an item not on our menu like pizza, pasta, biryani), NEVER state that items are filtered or show a blank screen. Instead, ask what they would like and offer our 4 main categories: Burgers, Sides, Drinks, and Desserts.
9. KNOWN ITEM IDs:
Burgers: b_makhani_paneer (Crispy Makhani Paneer Burger, Veg, Rs 199), b_aloo_tikki (Desi Masala Aloo Tikki Burger, Veg, Rs 99), b_cheddar_crunch (Double Cheddar Crunch Veg, Rs 229), b_veggie_delight (Classic Green Veggie Delight, Rs 149), b_spicy_chicken (Fiery Crispy Chicken Burger, Non-veg, Rs 249), b_butter_chicken (Delhi Butter Chicken Burger, Rs 269), b_chicken_cheese_melt (Chicken Cheese Melt Supreme, Rs 279), b_mutton_galouti (Royal Awadhi Mutton Galouti Burger, Rs 349), b_fish_fillet (Crispy Fried Fish Fillet Burger, Rs 259), b_double_trouble (Monster Double Chicken Smash, Rs 369).
Sides: s_peri_fries (Piri-Piri Shaker Fries, Rs 119), s_salted_fries (Classic Salted Golden Fries, Rs 99), s_cheese_fries (Cheesy Loaded Lava Fries, Rs 169), s_onion_rings (Rs 129), s_chicken_nuggets (Rs 179), s_chicken_wings (Rs 219), s_paneer_popcorn (Rs 159), s_masala_wedges (Rs 129).
Beverages: bev_coke (Coca-Cola Zero Sugar, Rs 60), bev_thums_up (Thums Up Charged, Rs 60), bev_mango_shake (Alphonso Mango Thick Shake, Rs 169), bev_belgian_shake (Belgian Chocolate Shake, Rs 179), bev_masala_chaas (Spiced Tadka Buttermilk, Rs 50), bev_iced_tea (Peach Passion Iced Tea, Rs 119), bev_mineral_water (Natural Spring Water, Rs 40).
Desserts: d_mcflurry_oreo (Oreo Crunch Soft Serve Swirl, Rs 129), d_hot_brownie (Sizzling Choco Brownie, Rs 179), d_apple_pie (Crispy Spiced Apple Pie, OUT OF STOCK), d_gulab_jamun (Warm Mawa Gulab Jamun 2 Pcs, Rs 79), d_strawberry_sundae (Wild Strawberry Sundae, Rs 119).
10. NEAREST PRODUCT MATCHING & 50% MATCH THRESHOLD (CRITICAL):
When a customer orders an item using descriptive, colloquial, or partial keywords (e.g. 'order one chocolate drink', 'chocolate drink', 'dark chocolate shake', 'spiced buttermilk', 'paneer burger', 'makhani burger'), you MUST reach the nearest matching menu item and invoke add_item. If there is a 50% or greater match between the customer's request and a menu item's name, synonyms, or category (such as 'chocolate drink' matching 'Belgian Chocolate Shake' (bev_belgian_shake) in Beverages), DO NOT merely filter or show the item on screen—invoke add_item(item_id='bev_belgian_shake', quantity=1) immediately and confirm warmly!`;

// 1. Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'ByteBurger Voice Kiosk Proxy',
    time: new Date().toISOString(),
    apiKeyConfigured: isApiKeyConfigured,
  });
});

// 1b. Human Female Speech Synthesis Endpoint (gemini-3.8-flash-lite-tts with Kore female voice)
app.post('/api/v1/voice/synthesize', async (req, res) => {
  try {
    const { text, voiceName = 'Kore' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    if (!isApiKeyConfigured) {
      return res.json({ available: false, reason: 'api_key_not_configured' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-lite-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: text,
              speechMetadata: {
                style: 'Warm, natural female restaurant host with clear, friendly tone',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return res.json({
        available: true,
        audioBase64: base64Audio,
        format: 'audio/wav',
        voice: voiceName || 'Kore',
      });
    }

    return res.json({ available: false });
  } catch {
    return res.json({ available: false });
  }
});

// 2. Ephemeral Token Minting Endpoint (matches Ktor specification)
app.post('/api/v1/auth/ephemeral-token', async (_req, res) => {
  try {
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const liveModel = 'models/gemini-2.0-flash-live-001';

    // Mock/ephemeral token descriptor for the client Live WebSocket
    res.json({
      token: `auth_tok_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      expiresAtIso: expireTime,
      liveModel,
      constraints: {
        responseModalities: ['AUDIO'],
        sessionResumption: true,
        vadEnabled: true,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Menu Catalog Sync Endpoint
app.get('/api/v1/menu/catalog', (_req, res) => {
  res.json({
    version: 1,
    currency: 'INR',
    categories: ['Burgers', 'Sides', 'Beverages', 'Desserts', 'Combos'],
    itemCount: SEED_MENU_ITEMS.length,
    items: SEED_MENU_ITEMS,
  });
});

// 4. Idempotent Order Submission Endpoint
app.post('/api/v1/orders/submit', (req, res) => {
  try {
    const { idempotencyKey, orderId, orderType, items, totalMinorUnits, paymentMethod } = req.body;

    if (!idempotencyKey) {
      return res.status(400).json({ error: 'idempotencyKey is required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array' });
    }
    if (!Number.isInteger(totalMinorUnits) || totalMinorUnits < 0) {
      return res.status(400).json({ error: 'totalMinorUnits must be a non-negative integer' });
    }

    if (processedOrders.has(idempotencyKey)) {
      return res.status(200).json(processedOrders.get(idempotencyKey));
    }

    kitchenTicketCounter = kitchenTicketCounter >= 999 ? 100 : kitchenTicketCounter + 1;
    const result = {
      status: 'ACCEPTED',
      kitchenOrderNumber: kitchenTicketCounter,
      orderId: orderId || `ORD-${Date.now()}`,
      orderType: orderType || 'DINE_IN',
      itemCount: Array.isArray(items) ? items.reduce((acc: number, it: any) => acc + (it.quantity || 1), 0) : 0,
      totalPaise: totalMinorUnits,
      paymentMethod: paymentMethod || 'UPI_QR',
      submittedAt: new Date().toISOString(),
    };

    processedOrders.set(idempotencyKey, result);
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// 5. Turn-based Voice/Text Gemini API Endpoint
app.post('/api/v1/voice/turn', async (req, res) => {
  const startTime = Date.now();
  try {
    const { message, orderState, history = [] } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    // Apply QSR acoustic speech-to-text normalizer (e.g., 'Vijay' -> 'Veg', 'non-vijay' -> 'non-veg')
    const normalizedMessage = normalizeQSRSpokenUtterance(message);

    if (!isApiKeyConfigured) {
      const fallback = parseDeterministicIntent(normalizedMessage, orderState);
      return res.json({
        ...fallback,
        latencyMs: Date.now() - startTime,
        isFallback: true,
      });
    }

    // Build context-aware prompt
    const cartSummary = orderState && orderState.items?.length > 0
      ? `CURRENT CART STATE:
Total items: ${orderState.itemCount}
Items: ${orderState.items.map((i: any) => `${i.quantity}x ${i.menuItem.nameEn} (lineId: "${i.lineId}")${i.isComboMeal ? ' [Combo]' : ''}`).join(', ')}
Subtotal: Rs ${orderState.subtotalPaise / 100}
Order Type: ${orderState.orderType}
Status: ${orderState.status}`
      : 'CURRENT CART STATE: Empty (0 items). Order Type: UNSET.';

    // Construct conversation history for multi-turn coherence
    const contents: any[] = [];

    // Add prior turns if available
    for (const h of history.slice(-6)) {
      contents.push({
        role: h.speaker === 'USER' ? 'user' : 'model',
        parts: [{ text: h.text }],
      });
    }

    // Add current user utterance with context
    contents.push({
      role: 'user',
      parts: [
        {
          text: `[Context: ${cartSummary}]\n\nCustomer spoken utterance: "${message}"`,
        },
      ],
    });

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: [{ functionDeclarations }],
        },
      });

      const replyText = response?.text || '';
      const functionCalls = response?.functionCalls || [];

      const toolCallsFormatted = functionCalls.map((fc: any, idx: number) => ({
        id: `call_${Date.now()}_${idx}`,
        name: fc.name,
        args: fc.args || {},
      }));

      return res.json({
        reply: replyText,
        toolCalls: toolCallsFormatted,
        latencyMs: Date.now() - startTime,
      });
    } catch {
      // Clean fallback to deterministic QSR intent parser
      const fallback = parseDeterministicIntent(normalizedMessage, orderState);
      return res.json({
        ...fallback,
        latencyMs: Date.now() - startTime,
        isFallback: true,
      });
    }
  } catch {
    const fallback = parseDeterministicIntent(
      normalizeQSRSpokenUtterance(req.body?.message || ''),
      req.body?.orderState
    );
    return res.json({
      ...fallback,
      latencyMs: Date.now() - startTime,
      isFallback: true,
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`ByteBurger Express Server running on port ${PORT}`);
  });
}

startServer();
