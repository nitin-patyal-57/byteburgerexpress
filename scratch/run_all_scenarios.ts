import { DIALOGUE_SCENARIOS } from '../src/core/dialogueScenarios.ts';
import { ToolExecutionEngine } from '../src/core/toolExecutionEngine.ts';
import { DeterministicOrderStore } from '../src/core/orderReducer.ts';
import { parseDeterministicIntent } from '../src/core/nluFallback.ts';

const PRE_SETUP: Record<number, Array<{ name: string; args: Record<string, any> }>> = {
  5: [{ name: 'add_item', args: { item_id: 'b_aloo_tikki', quantity: 1 } }],
  7: [{ name: 'add_item', args: { item_id: 'b_makhani_paneer', quantity: 1 } }],
  8: [{ name: 'add_item', args: { item_id: 's_peri_fries', quantity: 1 } }],
  9: [{ name: 'add_item', args: { item_id: 'b_veggie_delight', quantity: 1 } }],
  10: [{ name: 'add_item', args: { item_id: 'b_mutton_galouti', quantity: 1 } }],
  24: [{ name: 'add_item', args: { item_id: 'b_aloo_tikki', quantity: 2 } }],
  25: [{ name: 'set_order_type', args: { order_type: 'DINE_IN' } }],
  26: [{ name: 'add_item', args: { item_id: 'b_cheddar_crunch', quantity: 1 } }],
  28: [{ name: 'add_item', args: { item_id: 'b_fish_fillet', quantity: 1 } }],
  30: [{ name: 'add_item', args: { item_id: 's_salted_fries', quantity: 1 } }],
};

async function run() {
  let passed = 0;
  for (const s of DIALOGUE_SCENARIOS) {
    const store = new DeterministicOrderStore();
    const engine = new ToolExecutionEngine(store);
    const executedTools: string[] = [];
    const toolResults: any[] = [];

    for (const step of (PRE_SETUP[s.id] || [])) {
      await engine.execute(step.name, step.args);
    }

    const parsed = parseDeterministicIntent(s.userUtterance, store.getState());
    for (const tc of parsed.toolCalls) {
      const r = await engine.execute(tc.name, tc.args);
      executedTools.push(tc.name);
      toolResults.push(r);
    }

    const assertion = s.assertions(store.getState(), toolResults);
    const toolMatch = s.expectedToolCalls.length === 0
      ? executedTools.length === 0
      : s.expectedToolCalls.every(t => executedTools.includes(t));
    const ok = assertion.passed && toolMatch;

    if (ok) {
      passed++;
      console.log(`[PASS] #${s.id} ${s.title}`);
    } else {
      console.log(`[FAIL] #${s.id} ${s.title}`);
      console.log(`  Utterance: "${s.userUtterance}"`);
      console.log(`  Assertion passed: ${assertion.passed} (${assertion.message})`);
      console.log(`  Expected tools: [${s.expectedToolCalls.join(', ')}] | Got: [${executedTools.join(', ')}]`);
    }
  }
  console.log(`\n========================================`);
  console.log(`FINAL RESULT: ${passed}/${DIALOGUE_SCENARIOS.length} SCENARIOS PASSED`);
  console.log(`========================================`);
}

run();
