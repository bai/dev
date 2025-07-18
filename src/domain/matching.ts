// Fuzzy string matching algorithm. This is pure domain logic with no side effects

const SCORE_MIN = -Infinity;
const SCORE_MAX = Infinity;
const SCORE_GAP_LEADING = -0.005;
const SCORE_GAP_TRAILING = -0.005;
const SCORE_GAP_INNER = -0.01;
const SCORE_MATCH_CONSECUTIVE = 1.0;
const SCORE_MATCH_SLASH = 0.9;
const SCORE_MATCH_WORD = 0.8;
const SCORE_MATCH_CAPITAL = 0.7;
const SCORE_MATCH_DOT = 0.6;

const MATCH_MAX_LEN = 1024;

// Bonus states for state machine
const bonusStates: number[][] = [
  new Array(256).fill(0), // State 0: default
  // State 1: lowercase letters and digits
  (() => {
    const state = new Array(256).fill(0);
    state["/".charCodeAt(0)] = SCORE_MATCH_SLASH;
    state["-".charCodeAt(0)] = SCORE_MATCH_WORD;
    state["_".charCodeAt(0)] = SCORE_MATCH_WORD;
    state[" ".charCodeAt(0)] = SCORE_MATCH_WORD;
    state[".".charCodeAt(0)] = SCORE_MATCH_DOT;
    return state;
  })(),
  // State 2: uppercase letters
  (() => {
    const state = new Array(256).fill(0);
    state["/".charCodeAt(0)] = SCORE_MATCH_SLASH;
    state["-".charCodeAt(0)] = SCORE_MATCH_WORD;
    state["_".charCodeAt(0)] = SCORE_MATCH_WORD;
    state[" ".charCodeAt(0)] = SCORE_MATCH_WORD;
    state[".".charCodeAt(0)] = SCORE_MATCH_DOT;
    // lowercase letters get capital bonus
    for (let i = "a".charCodeAt(0); i <= "z".charCodeAt(0); i++) {
      state[i] = SCORE_MATCH_CAPITAL;
    }
    return state;
  })(),
];

// Bonus index based on character type
const bonusIndex = (() => {
  const index = new Array(256).fill(0);
  // Uppercase letters -> state 2
  for (let i = "A".charCodeAt(0); i <= "Z".charCodeAt(0); i++) {
    index[i] = 2;
  }
  // Lowercase letters -> state 1
  for (let i = "a".charCodeAt(0); i <= "z".charCodeAt(0); i++) {
    index[i] = 1;
  }
  // Digits -> state 1
  for (let i = "0".charCodeAt(0); i <= "9".charCodeAt(0); i++) {
    index[i] = 1;
  }
  return index;
})();

function computeBonus(lastCh: string, ch: string): number {
  const chCode = ch.charCodeAt(0);
  const lastChCode = lastCh.charCodeAt(0);
  const stateIdx = bonusIndex[chCode];
  const state = bonusStates[stateIdx];
  if (!state) return 0;
  return state[lastChCode] || 0;
}

interface MatchStruct {
  needleLen: number;
  haystackLen: number;
  lowerNeedle: string;
  lowerHaystack: string;
  matchBonus: number[];
}

function precomputeBonus(haystack: string, matchBonus: number[]): void {
  let lastCh = "/";
  for (let i = 0; i < haystack.length; i++) {
    const ch = haystack.charAt(i);
    matchBonus[i] = computeBonus(lastCh, ch);
    lastCh = ch;
  }
}

function setupMatchStruct(needle: string, haystack: string): MatchStruct | null {
  const needleLen = needle.length;
  const haystackLen = haystack.length;

  if (haystackLen > MATCH_MAX_LEN || needleLen > haystackLen) {
    return null;
  }

  const lowerNeedle = needle.toLowerCase();
  const lowerHaystack = haystack.toLowerCase();
  const matchBonus = new Array(haystackLen);

  precomputeBonus(haystack, matchBonus);

  return {
    needleLen,
    haystackLen,
    lowerNeedle,
    lowerHaystack,
    matchBonus,
  };
}

function matchRow(
  match: MatchStruct,
  row: number,
  currD: number[],
  currM: number[],
  lastD: number[] | null,
  lastM: number[] | null,
): void {
  const { needleLen, haystackLen, lowerNeedle, lowerHaystack, matchBonus } = match;
  const i = row;
  const needleCh = lowerNeedle.charAt(i);
  let prevScore = SCORE_MIN;
  const gapScore = i === needleLen - 1 ? SCORE_GAP_TRAILING : SCORE_GAP_INNER;

  for (let j = 0; j < haystackLen; j++) {
    if (needleCh === lowerHaystack.charAt(j)) {
      let score = SCORE_MIN;
      if (i === 0) {
        score = j * SCORE_GAP_LEADING + (matchBonus[j] || 0);
      } else if (j > 0 && lastD && lastM) {
        const lastDVal = lastD[j - 1];
        const lastMVal = lastM[j - 1];
        const bonus = matchBonus[j] || 0;
        if (lastDVal !== undefined && lastMVal !== undefined) {
          score = Math.max(lastMVal + bonus, lastDVal + SCORE_MATCH_CONSECUTIVE);
        }
      }
      currD[j] = score;
      currM[j] = prevScore = Math.max(score, prevScore + gapScore);
    } else {
      currD[j] = SCORE_MIN;
      currM[j] = prevScore = prevScore + gapScore;
    }
  }
}

export function hasMatch(needle: string, haystack: string): boolean {
  if (!needle) return true;
  if (!haystack) return false;

  const needleLower = needle.toLowerCase();
  const haystackLower = haystack.toLowerCase();
  let haystackIdx = 0;

  for (const ch of needleLower) {
    let found = false;
    for (; haystackIdx < haystackLower.length; haystackIdx++) {
      if (haystackLower.charAt(haystackIdx) === ch) {
        found = true;
        haystackIdx++;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

export function score(needle: string, haystack: string): number {
  if (!needle) return SCORE_MIN;

  const match = setupMatchStruct(needle, haystack);
  if (!match) return SCORE_MIN;

  const { needleLen, haystackLen } = match;

  if (needleLen === haystackLen) {
    // Check if it's actually an exact match (case-insensitive)
    if (match.lowerNeedle === match.lowerHaystack) {
      return SCORE_MAX;
    }
    // If same length but not matching, no match is possible
    return SCORE_MIN;
  }

  // D and M matrices for dynamic programming
  const D0 = new Array(MATCH_MAX_LEN).fill(SCORE_MIN) as number[];
  const D1 = new Array(MATCH_MAX_LEN).fill(SCORE_MIN) as number[];
  const M0 = new Array(MATCH_MAX_LEN).fill(SCORE_MIN) as number[];
  const M1 = new Array(MATCH_MAX_LEN).fill(SCORE_MIN) as number[];

  let lastD: number[] | null = null;
  let lastM: number[] | null = null;
  let currD = D0;
  let currM = M0;

  for (let i = 0; i < needleLen; i++) {
    if (i > 0) {
      lastD = currD;
      lastM = currM;
      currD = i % 2 === 0 ? D0 : D1;
      currM = i % 2 === 0 ? M0 : M1;
    }

    matchRow(match, i, currD, currM, lastD, lastM);
  }

  return currM[haystackLen - 1] ?? SCORE_MIN;
}

export function positions(needle: string, haystack: string): number[] | null {
  if (!needle) return [];

  const match = setupMatchStruct(needle, haystack);
  if (!match) return null;

  // First check if there's actually a match
  if (!hasMatch(needle, haystack)) return null;

  const { needleLen, haystackLen } = match;

  if (needleLen === haystackLen) {
    return Array.from({ length: needleLen }, (_, i) => i);
  }

  // D and M matrices for dynamic programming
  const D: number[][] = [];
  const M: number[][] = [];

  for (let i = 0; i <= needleLen; i++) {
    D[i] = new Array(haystackLen).fill(SCORE_MIN) as number[];
    M[i] = new Array(haystackLen).fill(SCORE_MIN) as number[];
  }

  for (let i = 0; i < needleLen; i++) {
    const lastD: number[] | null = i > 0 ? (D[i - 1] ?? null) : null;
    const lastM: number[] | null = i > 0 ? (M[i - 1] ?? null) : null;
    const currentD = D[i];
    const currentM = M[i];

    if (currentD && currentM) {
      matchRow(match, i, currentD, currentM, lastD, lastM);
    }
  }

  // Backtrack to find positions
  const result: number[] = new Array(needleLen);
  let matchRequired = false;

  // Start from the end and work backwards
  for (let i = needleLen - 1, j = haystackLen - 1; i >= 0; i--) {
    // Find the rightmost match for this needle position
    for (; j >= 0; j--) {
      const dScore = D[i]?.[j];
      const mScore = M[i]?.[j];

      if (dScore !== undefined && mScore !== undefined && dScore !== SCORE_MIN) {
        // Check if this position is valid for backtracking
        if (matchRequired || dScore === mScore) {
          // Check if the next match should be consecutive
          matchRequired = i > 0 && j > 0 && M[i]?.[j] === (D[i - 1]?.[j - 1] ?? SCORE_MIN) + SCORE_MATCH_CONSECUTIVE;

          result[i] = j;
          j--; // Move to the next position for the previous needle character
          break;
        }
      }
    }

    // If we couldn't find a match position, backtracking failed
    if (result[i] === undefined) {
      return null;
    }
  }

  return result;
}

export interface Choice {
  str: string;
  score: number;
  positions?: number[];
}

export function filter(needle: string, choices: string[]): Choice[] {
  if (!needle) {
    return choices.map((str) => ({ str, score: 0 }));
  }

  const results: Choice[] = [];

  for (const choice of choices) {
    if (hasMatch(needle, choice)) {
      const matchScore = score(needle, choice);
      const matchPositions = positions(needle, choice);
      results.push({
        str: choice,
        score: matchScore,
        positions: matchPositions ?? undefined,
      });
    }
  }

  // Sort by score (higher is better)
  results.sort((a, b) => b.score - a.score);

  return results;
}
