import { isDebugMode } from "~/lib/is-debug-mode";

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
    return SCORE_MAX;
  }

  // D and M matrices for dynamic programming
  const D: number[][] = [
    new Array(MATCH_MAX_LEN).fill(SCORE_MIN),
    new Array(MATCH_MAX_LEN).fill(SCORE_MIN),
  ];
  const M: number[][] = [
    new Array(MATCH_MAX_LEN).fill(SCORE_MIN),
    new Array(MATCH_MAX_LEN).fill(SCORE_MIN),
  ];

  let lastD = null;
  let lastM = null;
  let currD = D[0];
  let currM = M[0];

  for (let i = 0; i < needleLen; i++) {
    if (i > 0) {
      lastD = currD;
      lastM = currM;
      currD = D[i % 2];
      currM = M[i % 2];
    }

    if (currD && currM) {
      matchRow(match, i, currD, currM, lastD || null, lastM || null);
    }
  }

  return currM?.[haystackLen - 1] ?? SCORE_MIN;
}

export function positions(needle: string, haystack: string): number[] | null {
  if (!needle) return null;

  const match = setupMatchStruct(needle, haystack);
  if (!match) return null;

  const { needleLen, haystackLen, lowerNeedle, lowerHaystack, matchBonus } = match;

  if (needleLen === haystackLen) {
    return Array.from({ length: needleLen }, (_, i) => i);
  }

  // Full D and M matrices for backtracking
  const D: number[][] = new Array(needleLen);
  const M: number[][] = new Array(needleLen);
  for (let i = 0; i < needleLen; i++) {
    D[i] = new Array(haystackLen).fill(SCORE_MIN);
    M[i] = new Array(haystackLen).fill(SCORE_MIN);
  }

  // Fill matrices
  for (let i = 0; i < needleLen; i++) {
    const needleCh = lowerNeedle.charAt(i);
    let prevScore = SCORE_MIN;
    const gapScore = i === needleLen - 1 ? SCORE_GAP_TRAILING : SCORE_GAP_INNER;

    for (let j = 0; j < haystackLen; j++) {
      if (needleCh === lowerHaystack.charAt(j)) {
        let score = SCORE_MIN;
        if (i === 0) {
          score = j * SCORE_GAP_LEADING + (matchBonus[j] || 0);
        } else if (j > 0 && i > 0) {
          const prevD = D[i - 1];
          const prevM = M[i - 1];
          if (prevD && prevM) {
            const prevDVal = prevD[j - 1];
            const prevMVal = prevM[j - 1];
            const bonus = matchBonus[j] || 0;
            if (prevDVal !== undefined && prevMVal !== undefined) {
              score = Math.max(prevMVal + bonus, prevDVal + SCORE_MATCH_CONSECUTIVE);
            }
          }
        }
        const currD = D[i];
        const currM = M[i];
        if (currD && currM) {
          currD[j] = score;
          currM[j] = prevScore = Math.max(score, prevScore + gapScore);
        }
      } else {
        const currD = D[i];
        const currM = M[i];
        if (currD && currM) {
          currD[j] = SCORE_MIN;
          currM[j] = prevScore = prevScore + gapScore;
        }
      }
    }
  }

  // Backtrace to find positions
  const positions = new Array(needleLen).fill(-1);
  let matchRequired = false;

  for (let i = needleLen - 1; i >= 0; i--) {
    for (let j = haystackLen - 1; j >= 0; j--) {
      if (i === needleLen - 1 && j === haystackLen - 1) {
        matchRequired = true;
      }

      const currD = D[i];
      const currM = M[i];
      if (!currD || !currM) continue;

      const dVal = currD[j];
      const mVal = currM[j];

      if (dVal !== undefined && mVal !== undefined && (matchRequired || dVal === mVal)) {
        if (dVal !== SCORE_MIN) {
          if (i > 0 && j > 0) {
            const prevD = D[i - 1];
            if (prevD) {
              const prevDVal = prevD[j - 1];
              if (prevDVal !== undefined) {
                matchRequired = mVal === prevDVal + SCORE_MATCH_CONSECUTIVE;
              }
            }
          } else {
            matchRequired = false;
          }
          positions[i] = j;
          if (i === 0) break;
          j--;
          break;
        }
      }
    }
  }

  return positions;
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

  for (const str of choices) {
    if (hasMatch(needle, str)) {
      const choiceScore = score(needle, str);
      results.push({ str, score: choiceScore });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Debug logging for top 5 matches
  if (isDebugMode()) {
    const top5 = results.slice(0, 5);
    console.log(`🐛 Top 5 matches for "${needle}":`);
    top5.forEach((result, index) => {
      const pos = positions(needle, result.str);
      const positionsStr = pos ? `[${pos.join(", ")}]` : "[]";
      console.log(`  ${index + 1}. "${result.str}" (score: ${result.score.toFixed(3)}, positions: ${positionsStr})`);
    });
  }

  return results;
}
