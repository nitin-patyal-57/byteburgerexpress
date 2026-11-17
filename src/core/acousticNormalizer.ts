/**
 * Acoustic Normalizer for QSR Voice Kiosks.
 * Corrects common speech-to-text (STT) phonetic and acoustic confusions
 * in Indian English, Hinglish, and noisy restaurant environments.
 */

// Levenshtein edit distance algorithm for nearest-context matching
export function getLevenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[][] = Array.from({ length: bn + 1 }, () => new Array(an + 1).fill(0));
  for (let i = 0; i <= an; ++i) matrix[0][i] = i;
  for (let j = 0; j <= bn; ++j) matrix[j][0] = j;

  for (let j = 1; j <= bn; ++j) {
    for (let i = 1; i <= an; ++i) {
      if (b.charAt(j - 1) === a.charAt(i - 1)) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i - 1] + 1, // substitution
          matrix[j][i - 1] + 1,     // insertion
          matrix[j - 1][i] + 1      // deletion
        );
      }
    }
  }
  return matrix[bn][an];
}

export function normalizeQSRSpokenUtterance(rawInput: string): string {
  if (!rawInput || typeof rawInput !== 'string') return '';

  let text = rawInput.trim();

  // 1. Critical Category Acoustic & Spelling Corrections (Nearest Restaurant Context)
  // Sides: Web Speech API frequently acoustically maps /saɪdz/ to "tides", "tide", "sites", "slides", "tights"
  text = text
    .replace(/\b(tides|tide|tight|tights|sites|site|slides|slide|cides|syde|sydes|saids)\b/gi, (match) => {
      const lower = match.toLowerCase();
      if (lower === 'tide' || lower === 'site' || lower === 'slide' || lower === 'syde' || lower === 'tight') return 'side';
      return 'sides';
    })
    // Desserts: Web Speech API or customer typing frequently spells "desserts" as "deserts" (one 's') or "desert"
    .replace(/\b(deserts|desert|dezert|dezerts|dizert|dizerts|disert|diserts|desarts|dessarts|dezzert|dezzerts)\b/gi, (match) => {
      const lower = match.toLowerCase();
      if (lower === 'desert' || lower === 'dezert' || lower === 'disert' || lower === 'desart') return 'dessert';
      return 'desserts';
    })
    // Burgers phonetic variations: "bergers", "burgurs", "burgrs"
    .replace(/\b(bergers|burgurs|burgrs|bargers)\b/gi, 'burgers')
    .replace(/\b(berger|burgur|burgr|barger)\b/gi, 'burger')
    // Beverages phonetic variations: "bevereges", "bevrages"
    .replace(/\b(bevereges|bevrages|biverages)\b/gi, 'beverages');

  // 2. Critical STT Correction: "Vijay" -> "Veg"
  // Web Speech API frequently mishears Indian English /vɛdʒ/ as "Vijay" or "Vjay"
  text = text
    // "non-vijay", "non vijay" -> "non-veg"
    .replace(/\bnon[\s-]*vijay\b/gi, 'non-veg')
    .replace(/\bnon[\s-]*vjay\b/gi, 'non-veg')
    .replace(/\bnon[\s-]*vedge\b/gi, 'non-veg')
    // "vijay", "vjay", "vedge", "vajay" -> "veg"
    .replace(/\bvijay\b/gi, 'veg')
    .replace(/\bvjay\b/gi, 'veg')
    .replace(/\bvedge\b/gi, 'veg')
    .replace(/\bvedg\b/gi, 'veg')
    .replace(/\bvajay\b/gi, 'veg')
    .replace(/\bvazay\b/gi, 'veg')
    // "wedge items", "wage items" when used in dietary context
    .replace(/\b(all\s+)?(?:wage|wedge)\s+(items?|options?|burgers?|menu)\b/gi, 'veg $2');

  // 3. Menu Item Phonetic Normalizations
  text = text
    // Paneer variations: "panir", "panner", "panier"
    .replace(/\b(panir|panner|panier|punir)\b/gi, 'paneer')
    // Aloo Tikki variations: "alu tiki", "aalu tikki"
    .replace(/\b(alu|aalu)\s+(tiki|tikky|ticky|tikki)\b/gi, 'aloo tikki')
    .replace(/\b(alu|aalu)\b/gi, 'aloo')
    .replace(/\b(tiki|tikky|ticky)\b/gi, 'tikki')
    // Makhani variations: "makhni", "makani", "makhan"
    .replace(/\b(makhni|makani)\b/gi, 'makhani')
    // Thums Up: "thumbs up", "thumb up", "thump up"
    .replace(/\b(thumbs\s+up|thumb\s+up|thump\s+up|thumsup)\b/gi, 'thums up')
    // Peri-peri / Piri-piri
    .replace(/\b(piri\s+piri|piripiri|peri-peri|piri-piri)\b/gi, 'peri peri')
    // Chaas: "chas", "chaach"
    .replace(/\b(chas|chaach|chhaas)\b/gi, 'chaas')
    // Gulab Jamun: "gulabjaman", "gulaab jamun"
    .replace(/\b(gulabjaman|gulaab\s+jamun)\b/gi, 'gulab jamun')
    // Coke Zero: "cook zero", "coca cola zero"
    .replace(/\b(cook\s+zero|coca\s+cola\s+zero)\b/gi, 'coke zero')
    // Chocolate & Belgian variations: "chocoloate", "choclate", "choclet", "chocolaate", "chocalate", "chocolete", "choklate"
    .replace(/\b(chocoloate|choclate|choclet|chocolaate|chocalate|chocolete|choklate|choklet|choklat)\b/gi, 'chocolate')
    // Belgian variations: "belgun", "belgen", "belgiam", "belgin", "belgion", "beljim"
    .replace(/\b(belgun|belgen|belgiam|belgin|belgion|beljim|beljeen)\b/gi, 'belgian');

  // 4. Beverage & Category Phonetic Normalizations
  text = text
    .replace(/\b(cold-drink|colddrink|cold-drinks|colddrinks)\b/gi, 'cold drinks')
    .replace(/\b(soft-drink|softdrink|soft-drinks|softdrinks)\b/gi, 'soft drinks')
    .replace(/\b(drinlk|drinck|drnik|drinlks|drincks|drniks|drnks)\b/gi, 'drinks');

  // 5. Operational Command Normalization
  text = text
    // "take away", "pack kardo", "parcel"
    .replace(/\btake\s+away\b/gi, 'takeaway')
    .replace(/\b(pack\s+kardo|parcel\s+kardo|pack\s+kar\s+do)\b/gi, 'takeaway')
    // "dine in", "dining", "eat here"
    .replace(/\b(dining\s+order|dying)\b/gi, 'dine in');

  // 6. Nearest Context Matcher for single-word category utterances
  const words = text.toLowerCase().split(/\s+/);
  if (words.length === 1) {
    const single = words[0];
    // Check if within edit distance 1 or 2 of primary categories
    if (getLevenshteinDistance(single, 'sides') <= 2 || getLevenshteinDistance(single, 'side') <= 1) {
      return single.endsWith('s') ? 'sides' : 'side';
    }
    if (getLevenshteinDistance(single, 'desserts') <= 2 || getLevenshteinDistance(single, 'dessert') <= 2) {
      return single.endsWith('s') ? 'desserts' : 'dessert';
    }
    if (getLevenshteinDistance(single, 'drinks') <= 2 || getLevenshteinDistance(single, 'drink') <= 1) {
      return single.endsWith('s') ? 'drinks' : 'drink';
    }
    if (getLevenshteinDistance(single, 'burgers') <= 2 || getLevenshteinDistance(single, 'burger') <= 1) {
      return single.endsWith('s') ? 'burgers' : 'burger';
    }
  }

  return text;
}
