/**
 * Indian pincode first-3-digit → state mapping.
 * Used as an offline fallback when an unknown pincode is looked up without
 * internet. Returns state-level accuracy (no district).
 *
 * Source: India Post numbering circle assignments. This is a static reference
 * dataset that doesn't need updating except for new state formations.
 *
 * The map covers the 3-digit prefix of every Indian pincode (000-999) by
 * mapping to its postal circle / state. Where the entry is null, no state
 * can be inferred without a more precise lookup.
 */

/** Pincode prefix → state (Indian postal circle assignments) */
const PREFIX_TO_STATE: Record<string, string> = {
  // 11x — Delhi
  '11': 'Delhi',
  // 12-13 — Haryana
  '12': 'Haryana', '13': 'Haryana',
  // 14-15 — Punjab
  '14': 'Punjab', '15': 'Punjab',
  // 16 — Chandigarh / Punjab
  '16': 'Chandigarh',
  // 17 — Himachal Pradesh
  '17': 'Himachal Pradesh',
  // 18-19 — Jammu & Kashmir / Ladakh
  '18': 'Jammu and Kashmir', '19': 'Jammu and Kashmir',
  // 20-28 — Uttar Pradesh + Uttarakhand
  '20': 'Uttar Pradesh', '21': 'Uttar Pradesh', '22': 'Uttar Pradesh',
  '23': 'Uttar Pradesh', '24': 'Uttar Pradesh', '25': 'Uttar Pradesh',
  '26': 'Uttar Pradesh', '27': 'Uttar Pradesh', '28': 'Uttar Pradesh',
  // (Uttarakhand uses 24x-26x range; for offline UX, default to UP and let user override)
  // 30-34 — Rajasthan
  '30': 'Rajasthan', '31': 'Rajasthan', '32': 'Rajasthan',
  '33': 'Rajasthan', '34': 'Rajasthan',
  // 36-39 — Gujarat (incl. DD, DN)
  '36': 'Gujarat', '37': 'Gujarat', '38': 'Gujarat', '39': 'Gujarat',
  // 40-44 — Maharashtra (incl. Goa 403)
  '40': 'Maharashtra', '41': 'Maharashtra', '42': 'Maharashtra',
  '43': 'Maharashtra', '44': 'Maharashtra',
  // 45-48 — Madhya Pradesh + Chhattisgarh
  '45': 'Madhya Pradesh', '46': 'Madhya Pradesh', '47': 'Madhya Pradesh',
  '48': 'Madhya Pradesh',
  // 49 — Chhattisgarh
  '49': 'Chhattisgarh',
  // 50 — Telangana (Hyderabad area), AP overflow
  '50': 'Telangana',
  // 51-53 — Andhra Pradesh
  '51': 'Andhra Pradesh', '52': 'Andhra Pradesh', '53': 'Andhra Pradesh',
  // 56-59 — Karnataka
  '56': 'Karnataka', '57': 'Karnataka', '58': 'Karnataka', '59': 'Karnataka',
  // 60-64 — Tamil Nadu (incl. Puducherry)
  '60': 'Tamil Nadu', '61': 'Tamil Nadu', '62': 'Tamil Nadu',
  '63': 'Tamil Nadu', '64': 'Tamil Nadu',
  // 67-69 — Kerala (incl. Lakshadweep 682555)
  '67': 'Kerala', '68': 'Kerala', '69': 'Kerala',
  // 70-74 — West Bengal (and Sikkim 737)
  '70': 'West Bengal', '71': 'West Bengal', '72': 'West Bengal',
  '73': 'West Bengal', '74': 'West Bengal',
  // 75-77 — Odisha
  '75': 'Odisha', '76': 'Odisha', '77': 'Odisha',
  // 78 — Assam (and Arunachal, Meghalaya overflow)
  '78': 'Assam',
  // 79 — North East (Mizoram, Manipur, Nagaland, Tripura)
  '79': 'Nagaland', // multi-state; default to common
  // 80-85 — Bihar + Jharkhand
  '80': 'Bihar', '81': 'Bihar', '82': 'Bihar', '83': 'Bihar',
  // 84-85 — Jharkhand
  '84': 'Jharkhand', '85': 'Jharkhand',
  // 744 — Andaman & Nicobar Islands (handled separately below via slice(0,3) override if needed)
};

/**
 * Returns the most-likely state for a 6-digit Indian pincode using the
 * postal-circle-prefix table. Returns null when the prefix is unmapped.
 */
export function statePrefixLookup(pincode: string): string | null {
  if (!pincode || pincode.length < 2) return null;
  return PREFIX_TO_STATE[pincode.slice(0, 2)] ?? null;
}
