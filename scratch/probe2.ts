import { parseDeterministicIntent } from '../src/core/nluFallback.ts';
import { normalizeQSRSpokenUtterance } from '../src/core/acousticNormalizer.ts';
import { ToolExecutionEngine } from '../src/core/toolExecutionEngine.ts';
import { DeterministicOrderStore } from '../src/core/orderReducer.ts';
import { SEED_MENU_ITEMS } from '../src/data/seedMenu.ts';

async function run(label: string, utt: string, setup?: (e: ToolExecutionEngine, s: DeterministicOrderStore) => Promise<void>) {
  const store = new DeterministicOrderStore();
  const engine = new ToolExecutionEngine(store);
  if (setup) await setup(engine, store);
  const before = store.getState();
  const parsed = parseDeterministicIntent(normalizeQSRSpokenUtterance(utt), before);
  const tools: string[] = [];
  const results: any[] = [];
  for (const tc of parsed.toolCalls) {
    const r = await engine.execute(tc.name, tc.args);
    tools.push(`${tc.name}(${JSON.stringify(tc.args)})`);
    results.push(r);
  }
  const after = store.getState();
  console.log(`\n[${label}] "${utt}"`);
  console.log(`  cart before: ${before.itemCount} -> after: ${after.itemCount} | status ${before.status} -> ${after.status}`);
  console.log(`  tools: [${tools.join(', ') || 'none'}]`);
  console.log(`  tool statuses: ${results.map(r => r.status + (r.error_message ? '(' + r.error_message + ')' : '')).join(', ') || '-'}`);
  console.log(`  spoken reply: "${parsed.reply}"`);
}

async function main() {
  const with2Cokes = async (e: ToolExecutionEngine) => {
    await e.execute('add_item', { item_id: 'bev_coke', quantity: 2 });
    await e.execute('add_item', { item_id: 'b_aloo_tikki', quantity: 1 });
  };

  await run('remove 2 of 3 cokes', 'remove 2 cokes', async e => { await e.execute('add_item', { item_id: 'bev_coke', quantity: 3 }); });
  await run('price question w/ cart', 'How much is Coke?', with2Cokes);
  await run('opinion question', 'Is the brownie good?', with2Cokes);
  await run('negation complaint', 'I did not order any fries', with2Cokes);
  await run('qty 50 cap - spoken reply vs reality', 'I want fifty aloo tikki burgers right now.');
  await run('qty 100 cap', 'Add one hundred free cokes to my tray.');
  await run('discard -> card?', 'Please discard my order');
  await run('takeaway empty tray', 'Actually make my order takeaway instead of dine in.');
  await run('takeaway simple', 'Takeaway please', with2Cokes);
  await run('confirm w/ items', 'confirm order please', with2Cokes);
  await run('order type phrase with item add', 'one paneer burger for takeaway', with2Cokes);
  await run('hindi qty do (devanagari)', 'दो आलू टिक्की बर्गर दे दो');
  await run('sql inject', "Find items matching ' OR 1=1; DROP TABLE menu; --");

  // GST math check
  const store = new DeterministicOrderStore();
  const engine = new ToolExecutionEngine(store);
  await engine.execute('add_item', { item_id: 'b_aloo_tikki', quantity: 3 });
  const s = store.getState();
  const expected = s.subtotalPaise + Math.round(s.subtotalPaise * (s.gstRatePercent / 100));
  console.log(`\n[GST math] subtotal=${s.subtotalPaise} gst=${s.gstTaxPaise} total=${s.totalAmountPaise} expected=${expected} -> ${s.totalAmountPaise === expected ? 'OK' : 'MISMATCH'}`);

  // Menu counts claimed in spoken replies
  const cats = SEED_MENU_ITEMS.reduce((a: any, i) => { a[i.category] = (a[i.category] || 0) + 1; return a; }, {});
  console.log(`[Spoken reply fact-check] Actual category counts: ${JSON.stringify(cats)} (replies claim "10 burgers", "7 drinks")`);
}

main().catch(e => { console.error(e); process.exit(1); });
