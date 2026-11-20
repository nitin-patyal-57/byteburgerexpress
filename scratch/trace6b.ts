import { parseDeterministicIntent, scoreMenuItemMatch, countMenuMatches } from '../src/core/nluFallback.ts';
import { normalizeQSRSpokenUtterance } from '../src/core/acousticNormalizer.ts';
import { SEED_MENU_ITEMS } from '../src/data/seedMenu.ts';

const utt = 'Mujhe ek badhiya sa burger do.';
const normalized = normalizeQSRSpokenUtterance(utt);
console.log('normalized:', JSON.stringify(normalized));

const result = parseDeterministicIntent(normalized, { items: [], itemCount: 0 });
console.log('reply:', result.reply);
console.log('tools:', JSON.stringify(result.toolCalls, null, 2));

// Score every item
console.log('\n--- scores ---');
const scored = SEED_MENU_ITEMS.map(i => ({ id: i.id, score: scoreMenuItemMatch(normalized.toLowerCase(), i).score }))
  .filter(s => s.score > 0).sort((a, b) => b.score - a.score);
console.log(scored.slice(0, 8));
console.log('countMenuMatches:', countMenuMatches('mujhe ek badhiya sa burger do.'));
