// ============================
// 扑克牌基础工具
// ============================

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

const SUIT_COLORS = {
  '♠': '#333',
  '♣': '#333',
  '♥': '#dc3545',
  '♦': '#dc3545'
};

class PokerCard {
  constructor(suit, rank) {
    this.suit = suit;
    this.rank = rank;
    this.value = RANK_VALUES[rank];
    this.color = SUIT_COLORS[suit];
    this.id = `${suit}${rank}`;
  }

  toString() {
    return `${this.suit}${this.rank}`;
  }
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(new PokerCard(suit, rank));
    }
  }
  return deck;
}

function shuffle(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ============================
// 牌型判断（德州扑克）
// ============================

const HAND_RANKS = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10
};

const HAND_NAMES = {
  1: '高牌',
  2: '一对',
  3: '两对',
  4: '三条',
  5: '顺子',
  6: '同花',
  7: '葫芦',
  8: '四条',
  9: '同花顺',
  10: '皇家同花顺'
};

// 从7张牌中选出最佳5张牌
function evaluateBestHand(sevenCards) {
  const all5CardCombos = getCombinations(sevenCards, 5);
  let best = null;

  for (const combo of all5CardCombos) {
    const result = evaluate5CardHand(combo);
    if (!best || compareHands(result, best) > 0) {
      best = result;
    }
  }

  return best;
}

function evaluate5CardHand(cards) {
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const values = sorted.map(c => c.value);
  const suits = sorted.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);
  const isStraight = isStraightHand(values);
  const isRoyal = isFlush && values[0] === 14 && values[4] === 10;

  if (isRoyal) return { rank: HAND_RANKS.ROYAL_FLUSH, values: [...values], cards: sorted, name: HAND_NAMES[10] };
  if (isFlush && isStraight) return { rank: HAND_RANKS.STRAIGHT_FLUSH, values: [...values], cards: sorted, name: HAND_NAMES[9] };

  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const countEntries = Object.entries(counts).map(([k, v]) => [parseInt(k), v]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (countEntries[0][1] === 4) {
    const kicker = values.find(v => v !== countEntries[0][0]);
    return { rank: HAND_RANKS.FOUR_KIND, values: [countEntries[0][0], kicker], cards: sorted, name: HAND_NAMES[8] };
  }

  if (countEntries[0][1] === 3 && countEntries[1][1] === 2) {
    return { rank: HAND_RANKS.FULL_HOUSE, values: [countEntries[0][0], countEntries[1][0]], cards: sorted, name: HAND_NAMES[7] };
  }

  if (isFlush) return { rank: HAND_RANKS.FLUSH, values: [...values], cards: sorted, name: HAND_NAMES[6] };
  if (isStraight) return { rank: HAND_RANKS.STRAIGHT, values: [...values], cards: sorted, name: HAND_NAMES[5] };

  if (countEntries[0][1] === 3) {
    const kickers = values.filter(v => v !== countEntries[0][0]).slice(0, 2);
    return { rank: HAND_RANKS.THREE_KIND, values: [countEntries[0][0], ...kickers], cards: sorted, name: HAND_NAMES[4] };
  }

  if (countEntries[0][1] === 2 && countEntries[1][1] === 2) {
    const kicker = values.find(v => v !== countEntries[0][0] && v !== countEntries[1][0]);
    return { rank: HAND_RANKS.TWO_PAIR, values: [countEntries[0][0], countEntries[1][0], kicker], cards: sorted, name: HAND_NAMES[3] };
  }

  if (countEntries[0][1] === 2) {
    const kickers = values.filter(v => v !== countEntries[0][0]).slice(0, 3);
    return { rank: HAND_RANKS.ONE_PAIR, values: [countEntries[0][0], ...kickers], cards: sorted, name: HAND_NAMES[2] };
  }

  return { rank: HAND_RANKS.HIGH_CARD, values: [...values], cards: sorted, name: HAND_NAMES[1] };
}

function isStraightHand(values) {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.length < 5) return false;
  // A-2-3-4-5 顺子
  if (unique[0] === 14) {
    const lowAce = [5, 4, 3, 2, 1];
    const hasLowAce = lowAce.every(v => unique.includes(v === 1 ? 14 : v));
    if (hasLowAce) return true;
  }
  for (let i = 0; i <= unique.length - 5; i++) {
    if (unique[i] - unique[i + 4] === 4) return true;
  }
  return false;
}

function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < a.values.length; i++) {
    if (a.values[i] !== b.values[i]) return a.values[i] - b.values[i];
  }
  return 0;
}

function getCombinations(arr, k) {
  if (k === 1) return arr.map(e => [e]);
  if (k === arr.length) return [arr];
  const result = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const sub = getCombinations(arr.slice(i + 1), k - 1);
    for (const s of sub) result.push([arr[i], ...s]);
  }
  return result;
}

function getRankName(rank) {
  return HAND_NAMES[rank] || '未知';
}

module.exports = {
  PokerCard,
  createDeck,
  shuffle,
  evaluateBestHand,
  evaluate5CardHand,
  compareHands,
  getRankName,
  HAND_RANKS,
  HAND_NAMES,
  RANK_VALUES,
  SUITS,
  RANKS
};
