import { normalizeQSRSpokenUtterance } from '../src/core/acousticNormalizer.ts';
import { SEED_MENU_ITEMS } from '../src/data/seedMenu.ts';

const utt = 'Mujhe ek badhiya sa burger do.';
const text = normalizeQSRSpokenUtterance(utt).toLowerCase().trim();
console.log('normalized text:', JSON.stringify(text));

// 1. Direct add rule regex
const addMatch = text.match(/\b(?:add|daal do|dalo|lagao|kardo|kar do|include)\s+(?:one|two|three|1|2|3|ek|do|a|an)?\s*(.+)/i);
console.log('direct addMatch:', addMatch ? JSON.stringify(addMatch[1]) : null);

// 2. General parser matches
for (const item of SEED_MENU_ITEMS) {
  const enName = item.nameEn.toLowerCase();
  const hiName = item.nameHi;
  let matchedPhrase: string | null = null;
  if (text.includes(enName)) matchedPhrase = 'EN:' + enName;
  else if (hiName && text.includes(hiName)) matchedPhrase = 'HI:' + hiName;
  else {
    for (const syn of item.synonyms) {
      const s = syn.toLowerCase();
      if (text.includes(s) && (!matchedPhrase || s.length > matchedPhrase.length)) matchedPhrase = 'SYN:' + s;
    }
  }
  if (matchedPhrase) console.log('GENERAL MATCH:', item.id, matchedPhrase);
}

// 3. Score path
const stop = /\b(order|ordered|ordering|one|two|three|four|five|1|2|3|4|5|ek|do|teen|char|chaar|paanch|a|an|the|this|that|some|add|want|give|get|buy|please|bhai|kardo|kar do|chahiye|daal do|can i have|i'll have|ill have|kripya|mujhe|glass|cup|plate|pack|tray|cart|item|items)\b/gi;
const cleanQ = text.toLowerCase().replace(stop, ' ').replace(/[^a-z0-9\s]/g, ' ').trim();
console.log('cleanQ:', JSON.stringify(cleanQ), 'tokens:', cleanQ.split(/\s+/));
