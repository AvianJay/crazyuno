import type { CardKind } from '../types';
import { crazyCards } from './crazy';
import type { CardDef } from './def';
import { standardCards } from './standard';

export type { CardDef, EffectContext } from './def';

export const ALL_CARDS: CardDef[] = [...standardCards, ...crazyCards];

const byKind = new Map<CardKind, CardDef>(ALL_CARDS.map((d) => [d.kind, d]));

export function getCardDef(kind: CardKind): CardDef {
  const def = byKind.get(kind);
  if (!def) throw new Error(`未知的牌：${kind}`);
  return def;
}

export const CRAZY_KINDS: CardKind[] = crazyCards.map((d) => d.kind);
