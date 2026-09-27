// =============================================================
//  sala.js — o que o ANFITRIÃO manda pra cada jogador online,
//  e o jogo "espelho" que roda no aparelho do CONVIDADO.
//
//  Cada um se vê sempre sentado embaixo (lugar 0). Por isso o
//  anfitrião "gira" a mesa pra cada convidado: quem está no lugar 2
//  de verdade vê a si mesmo no 0, o próximo no 1, e assim por diante.
//  E cada um só recebe as PRÓPRIAS cartas — as dos outros viram só
//  a quantidade. Ninguém consegue espiar pelo navegador.
//  (Sem tela aqui dentro: o teste.js usa este arquivo no Node.)
// =============================================================

const SALA_MOTOR = typeof module !== 'undefined' ? require('./uno.js') : { UnoGame };

// Carta escondida (mão dos outros).
const HIDDEN = () => ({ id: -1, color: null, value: 'hidden' });

// O que o jogador sentado em `seat` pode ver.
function viewFor(game, seat) {
  const n = game.players.length;
  const rot = (i) => (i === null || i === undefined || i < 0 ? i : (i - seat + n) % n);
  const order = game.players.map((_, k) => (k + seat) % n); // lugar na tela → lugar de verdade
  return {
    players: order.map((i) => {
      const p = game.players[i];
      return { name: p.name, avatar: p.avatar, isBot: p.isBot, count: p.hand.length, saidUno: p.saidUno };
    }),
    hand: game.players[seat].hand,
    discard: game.discard.slice(-3),
    currentColor: game.currentColor,
    direction: game.direction,
    turn: rot(game.turn),
    phase: game.phase,
    pendingDraw: game.pendingDraw,
    unoWindow: rot(game.unoWindow),
    drawnId: game.turn === seat && game.drawnCard ? game.drawnCard.id : null,
    rules: game.rules,
    mode: game.mode,
    level: game.level,
    target: game.target,
    chaosTarget: game.chaosTarget,
    round: game.round,
    scores: order.map((i) => game.scores[i]),
    batidas: order.map((i) => game.batidas[i]),
    batidasTotal: game.batidasTotal,
    winner: rot(game.winner),
    winners: (game.winners || []).map(rot),
    gameOver: game.gameOver,
    roundPoints: game.roundPoints,
    moves: game.moves,
  };
}

// Os eventos (jogou, comprou, cortou…) girados pro jogador `seat`.
// Carta comprada por OUTRA pessoa vira carta escondida.
function eventsFor(game, seat, events) {
  const n = game.players.length;
  const rot = (i) => (typeof i === 'number' && i >= 0 ? (i - seat + n) % n : i);
  return events.map((ev) => {
    const out = { ...ev };
    for (const k of ['player', 'by', 'from', 'with', 'winner', 'turn']) if (k in out) out[k] = rot(out[k]);
    if (ev.type === 'draw' && ev.player !== seat) out.cards = ev.cards.map(HIDDEN);
    return out;
  });
}

// Lugar na tela do convidado → lugar de verdade (pra "trocar de mão com fulano").
const realIndex = (n, seat, viewIdx) => (viewIdx + seat) % n;

// Copia a visão pra dentro do jogo espelho.
function applyView(g, v) {
  g.players = v.players.map((p, i) => ({
    name: p.name,
    avatar: p.avatar,
    isBot: p.isBot,
    saidUno: p.saidUno,
    hand: i === 0 ? v.hand : Array.from({ length: p.count }, HIDDEN),
  }));
  for (const k of ['discard', 'currentColor', 'direction', 'turn', 'phase', 'pendingDraw', 'unoWindow', 'rules', 'mode', 'level',
    'target', 'chaosTarget', 'round', 'scores', 'batidas', 'batidasTotal', 'winner', 'winners', 'gameOver', 'roundPoints', 'moves']) {
    g[k] = v[k];
  }
  g.drawnCard = v.drawnId === null ? null : g.players[0].hand.find((c) => c.id === v.drawnId) || null;
  g.lacks = g.players.map(() => new Set());
}

// O jogo espelho do convidado: usa as MESMAS regras do motor pra saber o que
// dá pra jogar (canPlay, canCut…), mas as ações viram mensagens pro anfitrião.
function makeRemoteGame(view, send) {
  const g = Object.create(SALA_MOTOR.UnoGame.prototype);
  applyView(g, view);
  g.remote = true;
  g.events = [];
  g.rng = Math.random;
  // Tira as cartas da mão na hora (senão elas "piscam" até o anfitrião responder).
  const optimistic = (ids) => {
    const hand = g.players[0].hand;
    for (const id of ids) {
      const c = hand.find((x) => x.id === id);
      if (c) {
        hand.splice(hand.indexOf(c), 1);
        g.discard.push(c);
      }
    }
  };
  const playOrCut = (cutting) => (p, ids, color, extra = {}) => {
    ids = [].concat(ids);
    send({ type: 'play', ids, color, swapWith: Number.isInteger(extra.swapWith) ? extra.swapWith : null, cutting });
    optimistic(ids);
  };
  g.play = playOrCut(false);
  g.cut = playOrCut(true);
  g.draw = () => (send({ type: 'draw' }), null);
  g.pass = () => send({ type: 'pass' });
  g.callUno = () => (send({ type: 'uno' }), true);
  g.catchUno = () => (send({ type: 'catch' }), true);
  return g;
}

if (typeof module !== 'undefined') {
  module.exports = { viewFor, eventsFor, applyView, makeRemoteGame, realIndex };
}
