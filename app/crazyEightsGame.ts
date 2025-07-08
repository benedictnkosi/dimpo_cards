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
  // Start discard pile with a non-special card (7, 2, 8, J, A)
  let discard: Card[] = [];
  let top: Card | undefined;
  while (deck.length) {
    top = deck.shift();
    if (top && !['7', '2', '8', 'J', 'A'].includes(top.value)) {
      discard = [top];
      break;
    } else if (top) {
      deck.push(top); // put special cards at bottom
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
  console.log('[canPlay] Checking if card can be played:', { card, top, currentSuit });
  
  // If no top card (empty discard pile), any card can be played
  if (!top) {
    console.log('[canPlay] No top card, allowing play');
    return true;
  }
  
  // Allow any card to be played (simplified rules for now)
  console.log('[canPlay] Allowing play (simplified rules)');
  return true;
}

export function playCard(state: GameState, player: Player, cardIdx: number, newSuit?: string): GameState {
  console.log('[playCard] START - player:', player, 'cardIdx:', cardIdx, 'newSuit:', newSuit);
  console.log('[playCard] Input state:', {
    hands: { north: state.hands.north.length, south: state.hands.south.length },
    discard: state.discard.length,
    turn: state.turn,
    currentSuit: state.currentSuit,
    winner: state.winner,
    chooseSuit: state.chooseSuit
  });
  
  if (state.winner) {
    console.log('[playCard] Game already has winner, returning unchanged state');
    return state;
  }
  
  const hand = [...state.hands[player]];
  console.log('[playCard] Player hand before play:', hand.map(c => `${c.value}${c.suit}`));
  
  const card = hand[cardIdx];
  console.log('[playCard] Card to play:', card);
  
  if (!card) {
    console.log('[playCard] No card found at index:', cardIdx, 'hand length:', hand.length);
    return state;
  }
  
  const top = state.discard[state.discard.length - 1];
  console.log('[playCard] Top card:', top, 'currentSuit:', state.currentSuit);
  
  if (!canPlay(card, top, state.currentSuit)) {
    console.log('[playCard] Cannot play card:', card, 'on top:', top, 'with currentSuit:', state.currentSuit);
    return state;
  }
  
  console.log('[playCard] Removing card from hand at index:', cardIdx);
  hand.splice(cardIdx, 1);
  console.log('[playCard] Player hand after removing card:', hand.map(c => `${c.value}${c.suit}`));
  
  const hands = { ...state.hands, [player]: hand };
  console.log('[playCard] Updated hands:', {
    north: hands.north.map(c => `${c.value}${c.suit}`),
    south: hands.south.map(c => `${c.value}${c.suit}`)
  });
  
  let currentSuit = card.suit;
  let chooseSuit = false;
  
  if (card.value === '8') {
    console.log('[playCard] Playing 8, setting chooseSuit to true');
    chooseSuit = true;
    if (newSuit) {
      console.log('[playCard] New suit provided:', newSuit);
      currentSuit = newSuit;
      chooseSuit = false;
    }
    // Always add the 8 to discard pile, even if suit choice is pending
  }
  
  const discard = [...state.discard, card];
  console.log('[playCard] Updated discard pile:', discard.map(c => `${c.value}${c.suit}`));
  
  // Don't set winner when hand is empty - allow game to continue
  const winner = null; // Removed: hand.length === 0 ? player : null;
  if (winner) {
    console.log('[playCard] Player won:', winner);
  }
  
  const newState: GameState = {
    ...state,
    hands,
    discard,
    currentSuit,
    // Only switch turn if suit choice is not pending
    turn: chooseSuit ? player : (player === 'south' ? 'north' as Player : 'south' as Player),
    winner,
    chooseSuit,
  };
  
  console.log('[playCard] Final state:', {
    hands: { north: newState.hands.north.length, south: newState.hands.south.length },
    discard: newState.discard.length,
    turn: newState.turn,
    currentSuit: newState.currentSuit,
    winner: newState.winner,
    chooseSuit: newState.chooseSuit
  });
  
  return newState;
}

export function drawCard(state: GameState, player: Player): GameState {
  console.log('[DRAW CARD details]', {
    player,
    stock: state.stock.length,
    discard: state.discard.length,
    winner: state.winner,
  });
  console.log('[BEFORE DRAW] player:', player, 'north:', state.hands.north, 'south:', state.hands.south);
  // Allow drawing even when there's a winner (empty hand scenario)
  // if (state.winner) return state;
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
  
  const drawnCard = stock[0];
  const hand = [...state.hands[player], drawnCard];
  console.log('[north hand]', ...state.hands['north']);
  console.log('[south hand]', ...state.hands['south']);
  let hands: { north: Card[]; south: Card[] };
  if (player === 'north') {
    hands = {
      north: hand,
      south: state.hands.south.slice(),
    };
  } else {
    hands = {
      north: state.hands.north.slice(),
      south: hand,
    };
  }
  console.log('[AFTER DRAW] player:', player, 'north:', hands.north, 'south:', hands.south);
  stock = stock.slice(1);
  // End turn after drawing: switch to the other player
  const newState: GameState = { ...state, hands, stock, discard, turn: player === 'south' ? 'north' : 'south' };
  console.log('[FINAL STATE] hands:', newState.hands);
  return newState;
}

export function hasPlayableCard(hand: Card[], top: Card, currentSuit: string): boolean {
  return hand.some(card => canPlay(card, top, currentSuit));
} 