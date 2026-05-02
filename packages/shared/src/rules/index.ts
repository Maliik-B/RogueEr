export { HIERARCHY_RULES, H01, H02, H03, H04, H05, H06, H07, H08, H09, H10 } from "./hierarchy.js";
export { CARD_PROPERTY_RULES, C01, C02, C03, C04, C05, C06, C07, C08, C09, C10, generateAceSplitCombinations, markSevensWild } from "./card-property.js";
export { COMPOSITION_RULES, F01, F02, F03, F04, F05, F06, F07, F08, F09, F10 } from "./composition.js";

import type { Rule } from "../types.js";
import { HIERARCHY_RULES } from "./hierarchy.js";
import { CARD_PROPERTY_RULES } from "./card-property.js";
import { COMPOSITION_RULES } from "./composition.js";

export const ALL_RULES: Rule[] = [...HIERARCHY_RULES, ...CARD_PROPERTY_RULES, ...COMPOSITION_RULES];

export const RULE_POOL: Map<string, Rule> = new Map(ALL_RULES.map((r) => [r.id, r]));
