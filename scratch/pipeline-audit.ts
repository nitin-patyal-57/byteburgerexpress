/**
 * Pipeline audit: runs each scenario's REAL user utterance through the actual
 * production voice pipeline (normalizer -> parseDeterministicIntent ->
 * ToolExecutionEngine -> DeterministicOrderStore) and checks assertions.
 */
import { DIALOGUE_SCENARIOS } from '../src/core/dialogueScenarios.ts';
import { parseDeterministicIntent } from '../src/core/nluFallback.ts';
import { normalizeQSRSpokenUtterance } from '../src/core/acousticNormalizer.ts';
import { ToolExecutionEngine } from '../src/core/toolExecutionEngine.ts';
import { DeterministicOrderStore } from '../src/core/orderReducer.ts';

let pass = 0;
let fail = 0;

async function main() {
for (const sc of DIALOGUE_SCENARIOS) {
  const store = new DeterministicOrderStore();
  const engine = new ToolExecutionEngine(store);
  const executedTools: string[] = [];
  const toolResults: any[] = [];

  try {
    // Pre-state setup some scenarios rely on (mirrors real conversation history)
    if (sc.id === 5) {
      await engine.execute('add_item', { item_id: 'b_aloo_tikki', quantity: 1 });
    } else if (sc.id === 7) {
      await engine.execute('add_item', { item_id: 'b_makhani_paneer', quantity: 1 });
    } else if (sc.id === 8) {
      await engine.execute('add_item', { item_id: 's_peri_fries', quantity: 1 });
    } else if (sc.id === 9) {
      await engine.execute('add_item', { item_id: 'b_veggie_delight', quantity: 1 });
    } else if (sc.id === 10) {
      await engine.execute('add_item', { item_id: 'b_mutton_galouti', quantity: 1 });
    } else if (sc.id === 24) {
      await engine.execute('add_item', { item_id: 'b_aloo_tikki', quantity: 2 });
    } else if (sc.id === 25) {
      await engine.execute('set_order_type', { order_type: 'DINE_IN' });
    } else if (sc.id === 26) {
      await engine.execute('add_item', { item_id: 'b_cheddar_crunch', quantity: 1 });
    } else if (sc.id === 28) {
      await engine.execute('add_item', { item_id: 'b_fish_fillet', quantity: 1 });
    } else if (sc.id === 30) {
      await engine.execute('add_item', { item_id: 's_salted_fries', quantity: 1 });
    }

    // === THE REAL PIPELINE ===
    const normalized = normalizeQSRSpokenUtterance(sc.userUtterance);
    const parsed = parseDeterministicIntent(normalized, store.getState());

    for (const tc of parsed.toolCalls) {
      const r = await engine.execute(tc.name, tc.args);
      executedTools.push(tc.name);
      toolResults.push(r);
    }

    const assertion = sc.assertions(store.getState(), toolResults);
    const expected = sc.expectedToolCalls.join(',') || 'none';
    const got = executedTools.join(',') || 'none';
    const toolMatch =
      sc.expectedToolCalls.length === 0
        ? executedTools.length === 0
        : sc.expectedToolCalls.every(t => executedTools.includes(t));

    if (assertion.passed && toolMatch) {
      pass++;
      console.log(`PASS #${String(sc.id).padStart(2, '0')} ${sc.title}`);
    } else {
      fail++;
      console.log(
        `FAIL #${String(sc.id).padStart(2, '0')} ${sc.title}\n` +
          `      utterance: "${sc.userUtterance}"\n` +
          `      expected tools: [${expected}]  actual: [${got}]\n` +
          `      assertion: ${assertion.passed} -> ${assertion.message}\n` +
          `      reply: "${parsed.reply}"`
      );
    }
  } catch (e: any) {
    fail++;
    console.log(`ERROR #${sc.id} ${sc.title}: ${e?.message}`);
  }
}

console.log(`\n===== REAL PIPELINE: ${pass} passed, ${fail} failed of ${DIALOGUE_SCENARIOS.length} =====`);

// ---- Extra process probes (not part of the 30) ----
console.log('\n--- Extra probes ---');
const probes: Array<[string, string]> = [
  ['price inquiry', 'How much is the paneer burger?'],
  ['availability inquiry', 'Do you have Coke?'],
  ['calorie question', 'How many calories in aloo tikki burger?'],
  ['confirm empty cart', 'confirm order please'],
  ['cancel all items', 'cancel all items'],
  ['discard order', 'discard my order please'],
  ['remove 2 cokes', 'remove 2 cokes'],
  ['wrong item complaint', 'I did not order any fries'],
];
for (const [label, utt] of probes) {
  const store = new DeterministicOrderStore();
  const engine = new ToolExecutionEngine(store);
  const parsed = parseDeterministicIntent(normalizeQSRSpokenUtterance(utt), store.getState());
  const tools: string[] = [];
  for (const tc of parsed.toolCalls) {
    await engine.execute(tc.name, tc.args);
    tools.push(`${tc.name}(${JSON.stringify(tc.args)})`);
  }
  const st = store.getState();
  console.log(
    `[${label}] "${utt}"\n    -> tools: [${tools.join(', ') || 'none'}] | cart: ${st.itemCount} items, status=${st.status}\n    -> reply: "${parsed.reply}"`
  );
}
}

main().catch(e => { console.error(e); process.exit(1); });
