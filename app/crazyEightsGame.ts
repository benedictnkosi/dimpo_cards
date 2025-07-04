import cards from './cards.json';

export type Card = { suit: string; value: string };
export type Player = 'north' | 'south';
export interface GameState {
  hands: { north: Card[]; south: Card[] };
  stock: Card[];
  discard: Card[];
  turn: Player;
  currentSuit: string;
  winner: Player | null;
  chooseSuit: boolean; // true if player must choose suit after playing 8
}

function shuffle(deck: Card[]): Card[] {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function initGame(): GameState {
  let deck = shuffle(cards as Card[]);
  const hands = { north: deck.slice(0, 7), south: deck.slice(7, 14) };
  deck = deck.slice(14);
  // Start discard pile with a non-8 card
  let discard: Card[] = [];
  let top: Card | undefined;
  while (deck.length) {
    top = deck.shift();
    if (top && top.value !== '8') {
      discard = [top];
      break;
    } else if (top) {
      deck.push(top); // put 8s at bottom
    }
  }
  return {
    hands,
    stock: deck,
    discard,
    turn: 'south',
    currentSuit: discard[0].suit,
    winner: null,
    chooseSuit: false,
  };
}

export function canPlay(card: Card, top: Card, currentSuit: string): boolean {
  return card.value === '8' || card.suit === currentSuit || card.value === top.value;
}

export function playCard(state: GameState, player: Player, cardIdx: number, newSuit?: string): GameState {
  if (state.winner) return state;
  const hand = [...state.hands[player]];
  const card = hand[cardIdx];
  const top = state.discard[state.discard.length - 1];
  if (!canPlay(card, top, state.currentSuit)) return state;
  hand.splice(cardIdx, 1);
  const hands = { ...state.hands, [player]: hand };
  let currentSuit = card.suit;
  let chooseSuit = false;
  if (card.value === '8') {
    chooseSuit = true;
    if (newSuit) {
      currentSuit = newSuit;
      chooseSuit = false;
    } else {
      // Wait for player to choose suit
      return { ...state, hands, chooseSuit: true };
    }
  }
  const discard = [...state.discard, card];
  const winner = hand.length === 0 ? player : null;
  return {
    ...state,
    hands,
    discard,
    currentSuit,
    turn: player === 'south' ? 'north' : 'south',
    winner,
    chooseSuit,
  };
}

export function drawCard(state: GameState, player: Player): GameState {
  if (state.winner) return state;
  let stock = state.stock;
  let discard = state.discard;
  // If stock is empty, reload from discard (except top card)
  if (stock.length === 0 && discard.length > 1) {
    // Take all but the last card (top card stays)
    const newStock = shuffle(discard.slice(0, -1));
    stock = newStock;
    discard = [discard[discard.length - 1]];
  }
  if (stock.length === 0) return state; // still empty, can't draw
  const hand = [...state.hands[player], stock[0]];
  const hands = { ...state.hands, [player]: hand };
  stock = stock.slice(1);
  // End turn after drawing: switch to the other player
  return { ...state, hands, stock, discard, turn: player === 'south' ? 'north' : 'south' };
}

export function hasPlayableCard(hand: Card[], top: Card, currentSuit: string): boolean {
  return hand.some(card => canPlay(card, top, currentSuit));
} 