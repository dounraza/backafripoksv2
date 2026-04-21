export class HandEvaluator {
  static RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };

  static HAND_TYPES = {
    ROYAL_FLUSH: 9,
    STRAIGHT_FLUSH: 8,
    FOUR_OF_A_KIND: 7,
    FULL_HOUSE: 6,
    FLUSH: 5,
    STRAIGHT: 4,
    THREE_OF_A_KIND: 3,
    TWO_PAIR: 2,
    PAIR: 1,
    HIGH_CARD: 0
  };

  static evaluate(cards) {
    const parsedCards = cards.map(c => ({
      value: this.RANK_VALUES[c.value],
      suit: c.suit
    })).sort((a, b) => b.value - a.value);

    const counts = {};
    const suits = {};
    parsedCards.forEach(c => {
      counts[c.value] = (counts[c.value] || 0) + 1;
      if (c.suit) {
        suits[c.suit] = (suits[c.suit] || []).concat(c.value);
      }
    });

    const isFlush = Object.values(suits).find(s => s.length >= 5);
    const straightInfo = this.getStraight(parsedCards);
    
    // Check Flush & Straight Flush
    if (isFlush) {
      const flushCards = isFlush.sort((a, b) => b - a);
      const flushStraight = this.getStraight(flushCards.map(v => ({ value: v })));
      if (flushStraight) {
        return { score: flushStraight === 14 ? this.HAND_TYPES.ROYAL_FLUSH : this.HAND_TYPES.STRAIGHT_FLUSH, high: flushStraight };
      }
      return { score: this.HAND_TYPES.FLUSH, high: flushCards[0], kicker: flushCards.slice(1, 5) };
    }

    if (straightInfo) return { score: this.HAND_TYPES.STRAIGHT, high: straightInfo };

    const pairs = Object.entries(counts).filter(([_, count]) => count === 2).map(([val]) => parseInt(val)).sort((a, b) => b - a);
    const trips = Object.entries(counts).filter(([_, count]) => count === 3).map(([val]) => parseInt(val)).sort((a, b) => b - a);
    const quads = Object.entries(counts).filter(([_, count]) => count === 4).map(([val]) => parseInt(val)).sort((a, b) => b - a);

    // Four of a kind
    if (quads.length > 0) {
      const kicker = parsedCards.map(c => c.value).filter(v => v !== quads[0]).slice(0, 1);
      return { score: this.HAND_TYPES.FOUR_OF_A_KIND, high: quads[0], kicker };
    }

    // Full House
    if (trips.length > 0 && pairs.length > 0) return { score: this.HAND_TYPES.FULL_HOUSE, high: trips[0], low: pairs[0] };
    if (trips.length > 1) return { score: this.HAND_TYPES.FULL_HOUSE, high: trips[0], low: trips[1] };

    // Three of a kind
    if (trips.length > 0) {
      const kickers = parsedCards.map(c => c.value).filter(v => v !== trips[0]).slice(0, 2);
      return { score: this.HAND_TYPES.THREE_OF_A_KIND, high: trips[0], kicker: kickers };
    }

    // Two Pair
    if (pairs.length >= 2) {
      const kickers = parsedCards.map(c => c.value).filter(v => v !== pairs[0] && v !== pairs[1]).slice(0, 1);
      return { score: this.HAND_TYPES.TWO_PAIR, high: pairs[0], low: pairs[1], kicker: kickers };
    }

    // Pair
    if (pairs.length === 1) {
      const kickers = parsedCards.map(c => c.value).filter(v => v !== pairs[0]).slice(0, 3);
      return { score: this.HAND_TYPES.PAIR, high: pairs[0], kicker: kickers };
    }

    if (parsedCards.length === 0) return { score: this.HAND_TYPES.HIGH_CARD, high: 0, kicker: [] };

    return { score: this.HAND_TYPES.HIGH_CARD, high: parsedCards[0].value, kicker: parsedCards.slice(1, 5).map(c => c.value) };
  }

  static getHandDescription(result) {
    const valueToName = (val) => {
      const names = { 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };
      return names[val] || `${val}'s`;
    };

    const singleName = (val) => {
      const names = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
      return names[val] || val;
    };

    switch (result.score) {
      case this.HAND_TYPES.ROYAL_FLUSH: return "ROYAL FLUSH";
      case this.HAND_TYPES.STRAIGHT_FLUSH: return `STRAIGHT FLUSH to the ${singleName(result.high)}`;
      case this.HAND_TYPES.FOUR_OF_A_KIND: return `FOUR OF A KIND, ${valueToName(result.high)}`;
      case this.HAND_TYPES.FULL_HOUSE: return `FULL HOUSE, ${valueToName(result.high)} over ${valueToName(result.low)}`;
      case this.HAND_TYPES.FLUSH: return `FLUSH, ${singleName(result.high)} high`;
      case this.HAND_TYPES.STRAIGHT: return `STRAIGHT to the ${singleName(result.high)}`;
      case this.HAND_TYPES.THREE_OF_A_KIND: return `THREE OF A KIND, ${valueToName(result.high)}`;
      case this.HAND_TYPES.TWO_PAIR: return `TWO PAIR, ${valueToName(result.high)} and ${valueToName(result.low)}`;
      case this.HAND_TYPES.PAIR: return `PAIR of ${valueToName(result.high)}`;
      default: return `HIGH CARD, ${singleName(result.high)}`;
    }
  }

  static getStraight(cards) {
    const values = [...new Set(cards.map(c => c.value))].sort((a, b) => b - a);
    if (values.length < 5) return null;

    // Handle Ace-low straight (A, 2, 3, 4, 5)
    if (values.includes(14)) values.push(1);

    let consecutive = 1;
    for (let i = 0; i < values.length - 1; i++) {
      if (values[i] === values[i + 1] + 1) {
        consecutive++;
        if (consecutive === 5) return values[i - 3];
      } else {
        consecutive = 1;
      }
    }
    return null;
  }

  // Compare deux mains : retourne 1 si hand1 gagne, -1 si hand2 gagne, 0 si égalité
  static compare(hand1, hand2) {
    if (hand1.score > hand2.score) return 1;
    if (hand1.score < hand2.score) return -1;
    
    if (hand1.high > hand2.high) return 1;
    if (hand1.high < hand2.high) return -1;

    if (hand1.low && hand2.low) {
      if (hand1.low > hand2.low) return 1;
      if (hand1.low < hand2.low) return -1;
    }

    // kicker comparison
    if (hand1.kicker && hand2.kicker) {
      for (let i = 0; i < hand1.kicker.length; i++) {
        if (hand1.kicker[i] > hand2.kicker[i]) return 1;
        if (hand1.kicker[i] < hand2.kicker[i]) return -1;
      }
    }

    return 0;
  }
}
