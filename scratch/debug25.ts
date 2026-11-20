import { parseDeterministicIntent, scoreMenuItemMatch } from '../src/core/nluFallback.ts';
import { SEED_MENU_ITEMS } from '../src/data/seedMenu.ts';

const utt = 'Actually make my order takeaway instead of dine in.';
const parsed = parseDeterministicIntent(utt, { items: [], itemCount: 0 });
console.log('tools:', parsed.toolCalls.map(t => `${t.name}(${JSON.stringify(t.args)})`));
console.log('reply:', parsed.reply);

// Score path debug
const scored = SEED_MENU_ITEMS
  .map(item => ({ id: item.id, name: item.nameEn, score: scoreMenuItemMatch(utt, item).score }))
  .filter(s => s.score >= 0.4)
  .sort((a, b) => b.score - a.score);
console.log('scores >= 0.4:', scored);

// Which synonym could substring-match?
const lower = utt.toLowerCase();
for (const item of SEED_MENU_ITEMS) {
  if (lower.includes(item.nameEn.toLowerCase())) console.log('NAME MATCH:', item.id);
  for (const syn of item.synonyms) {
    if (lower.includes(syn.toLowerCase())) console.log('SYN MATCH:', item.id, '->', syn);
  }
}
