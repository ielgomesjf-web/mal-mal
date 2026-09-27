// =============================================================
//  uno.js — o MOTOR do jogo. Só regras, nada de tela.
//  Por que separado? Porque assim dá pra testar as regras
//  sozinhas (no Node, sem navegador) e a tela só "desenha"
//  o que o motor manda.
// =============================================================

const COLORS = ['red', 'yellow', 'green', 'blue'];
const COLOR_NAMES = { red: 'Vermelho', yellow: 'Amarelo', green: 'Verde', blue: 'Azul' };

// Regras opcionais (todas ligam/desligam na tela inicial).
const RULES = {
  stacking: false, // +2 e +4 acumulam
  nine: false, // 9: o jogador anterior compra 1 carta
  zero: false, // 0: todo mundo passa a mão pro próximo
  one: false, // 1: quem jogou pode trocar de mão com alguém
  multi: false, // empilhar: jogar várias cartas do mesmo número de uma vez
  cut: false, // cortar: carta idêntica à da mesa rouba a vez
  freeze: false, // carta especial Estaca Zero (balde de água fria)
};
const FREEZE_COPIES = 2;

// Níveis de dificuldade dos bots.
//  play:   'random' (qualquer carta), 'basic' (o bot de sempre), 'smart' (pensa + memória)
//  forget: chance de esquecer o UNO · catch: chance de te pegar sem UNO
//  cut:    chance de cortar · think: tempo "pensando" (ms, mínimo + sorteio)
//  peek:   espia a mão de quem é humano · gang: bots se juntam contra o humano
const BOT_LEVELS = {
  easy: { name: 'Fácil', play: 'random', forget: 0.4, catch: 0.25, cut: 0.15, think: [1300, 900] },
  medium: { name: 'Médio', play: 'basic', forget: 0.15, catch: 0.7, cut: 0.35, think: [900, 700] },
  hard: { name: 'Difícil', play: 'smart', forget: 0.03, catch: 0.9, cut: 0.6, think: [800, 500] },
  evil: { name: 'Mal-mal 😈', play: 'smart', peek: true, gang: true, forget: 0, catch: 1, cut: 0.9, think: [550, 400] },
};
const FREEZE_DRAW = 6;

// Monta o baralho oficial de 108 cartas:
// por cor: um 0, dois de cada 1–9, dois Bloqueio, dois Inverter, dois +2
// e mais 4 Coringas e 4 Coringas +4. (+2 Estaca Zero se a regra estiver ligada)
function createDeck(rules = RULES) {
  const deck = [];
  let id = 0;
  for (const color of COLORS) {
    deck.push({ id: id++, color, value: '0' });
    for (let n = 1; n <= 9; n++) {
      deck.push({ id: id++, color, value: String(n) });
      deck.push({ id: id++, color, value: String(n) });
    }
    for (const value of ['skip', 'reverse', 'draw2']) {
      deck.push({ id: id++, color, value });
      deck.push({ id: id++, color, value });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ id: id++, color: null, value: 'wild' });
    deck.push({ id: id++, color: null, value: 'wild4' });
  }
  if (rules.freeze) {
    for (let i = 0; i < FREEZE_COPIES; i++) deck.push({ id: id++, color: null, value: 'freeze' });
  }
  return deck;
}

// Embaralhamento Fisher–Yates: cada ordem tem a mesma chance.
function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// "Coringa" aqui = carta preta, sem cor, em que quem joga escolhe a cor.
const isWild = (card) => card.color === null;
const isNumber = (card) => /^[0-9]$/.test(card.value);

// Pontos que a carta vale no fim da rodada (regra oficial).
function cardPoints(card) {
  if (isNumber(card)) return Number(card.value);
  if (isWild(card)) return 50;
  return 20;
}

class UnoGame {
  // players: [{ name, isBot }]
  // options: { rules: {...RULES}, target: pontos pra vencer o jogo }
  constructor(players, options = {}, rng = Math.random) {
    this.players = players.map((p) => ({ ...p, hand: [], saidUno: false }));
    this.scores = this.players.map(() => 0);
    this.rules = { ...RULES, ...(options.rules || {}) };
    if (options.stacking) this.rules.stacking = true; // compatível com a versão antiga
    this.target = options.target || 500;
    // Modo caótico: quem zera a mão compra 7 e segue. Depois de X batidas (somando todo mundo), acaba.
    this.mode = options.mode === 'chaos' ? 'chaos' : 'normal';
    this.chaosTarget = options.chaosTarget || 5;
    this.level = BOT_LEVELS[options.level] ? options.level : 'medium';
    this.rng = rng;
    this.round = 0;
    this.events = [];
    this.moves = 0; // conta toda ação — a tela usa pra saber se alguém "cortou" no meio
  }

  // ---------- começo de rodada ----------
  startRound() {
    this.round++;
    this.drawPile = shuffle(createDeck(this.rules), this.rng);
    this.discard = [];
    this.direction = 1; // 1 = horário, -1 = anti-horário
    this.pendingDraw = 0; // só usado quando acumular está ligado
    this.phase = 'play'; // 'play' | 'drawn' | 'over'
    this.drawnCard = null;
    this.unoWindow = null; // índice de quem ficou com 1 carta sem gritar UNO
    this.winner = null;
    this.roundPoints = 0;
    this.gameOver = false;
    this.events = [];
    this.batidas = this.players.map(() => 0); // quantas vezes cada um zerou a mão (caótico)
    this.batidasTotal = 0;
    this.winners = [];
    // Memória dos bots espertos: cores que cada um NÃO tem (viram quando a pessoa comprou por falta).
    this.lacks = this.players.map(() => new Set());

    for (const p of this.players) {
      p.hand = [];
      p.saidUno = false;
    }
    for (let i = 0; i < 7; i++) {
      for (const p of this.players) p.hand.push(this.drawPile.pop());
    }

    // A primeira carta da mesa tem que ser um número.
    // (Simplificação: se sair especial, ela volta pro monte e tira outra.)
    let first = this.drawPile.pop();
    while (!isNumber(first)) {
      this.drawPile.unshift(first);
      first = this.drawPile.pop();
    }
    this.discard.push(first);
    this.currentColor = first.color;

    // Quem começa roda a cada rodada.
    this.turn = (this.round - 1) % this.players.length;
    this.emit('start', { card: first, turn: this.turn });
  }

  // ---------- consultas ----------
  get top() {
    return this.discard[this.discard.length - 1];
  }

  get current() {
    return this.players[this.turn];
  }

  // Índice relativo a QUALQUER jogador (from), seguindo o sentido do jogo.
  indexFrom(from, steps) {
    const n = this.players.length;
    return (((from + this.direction * steps) % n) + n) % n;
  }

  nextIndex(steps = 1) {
    return this.indexFrom(this.turn, steps);
  }

  canPlay(playerIdx, card) {
    if (this.phase === 'over') return false;
    const hand = this.players[playerIdx].hand;
    // Depois de comprar, só dá pra jogar a carta que acabou de comprar.
    if (this.phase === 'drawn' && card !== this.drawnCard) return false;

    // Tem +2/+4 acumulado vindo na sua direção: só rebate com outro.
    if (this.pendingDraw > 0) {
      return card.value === 'wild4' || (card.value === 'draw2' && this.top.value === 'draw2');
    }

    // Regra oficial: +4 só pode se você NÃO tiver carta da cor da mesa.
    if (card.value === 'wild4') return !hand.some((c) => c.color === this.currentColor);
    if (isWild(card)) return true;
    return card.color === this.currentColor || card.value === this.top.value;
  }

  playableCards(playerIdx) {
    return this.players[playerIdx].hand.filter((c) => this.canPlay(playerIdx, c));
  }

  // Cortar: fora da sua vez, com carta IDÊNTICA (mesma cor e mesmo símbolo) à da mesa.
  canCut(playerIdx, card) {
    const top = this.top;
    return (
      this.rules.cut &&
      this.phase !== 'over' &&
      playerIdx !== this.turn &&
      top.color !== null &&
      card.color === top.color &&
      card.value === top.value
    );
  }

  // Um grupo de cartas pode ir junto? (1 carta, ou várias do mesmo número com "empilhar")
  groupOk(playerIdx, cards, first) {
    if (!cards.length || cards.some((c) => !c)) return false;
    if (cards.length === 1) return first(cards[0]);
    return (
      this.rules.multi &&
      !(this.phase === 'drawn' && playerIdx === this.turn) &&
      cards.every((c) => isNumber(c) && c.value === cards[0].value) &&
      new Set(cards).size === cards.length &&
      first(cards[0])
    );
  }

  canPlayGroup(playerIdx, ids) {
    if (playerIdx !== this.turn) return false;
    return this.groupOk(playerIdx, this.findCards(playerIdx, ids), (c) => this.canPlay(playerIdx, c));
  }

  canCutGroup(playerIdx, ids) {
    return this.groupOk(playerIdx, this.findCards(playerIdx, ids), (c) => this.canCut(playerIdx, c));
  }

  findCards(playerIdx, ids) {
    const hand = this.players[playerIdx].hand;
    return [].concat(ids).map((id) => hand.find((c) => c.id === id));
  }

  // ---------- ações ----------
  // ids: um id ou uma lista (empilhar). A ÚLTIMA carta da lista fica em cima.
  // extra.swapWith: com quem trocar de mão quando joga 1 (ou null pra não trocar).
  play(playerIdx, ids, chosenColor, extra = {}) {
    this.assertTurn(playerIdx);
    const player = this.players[playerIdx];
    const cards = this.findCards(playerIdx, ids);
    if (cards.some((c) => !c)) throw new Error('Carta não está na mão');
    if (!this.canPlayGroup(playerIdx, ids)) throw new Error('Jogada inválida');
    const card = cards[cards.length - 1];
    if (isWild(card) && !COLORS.includes(chosenColor)) throw new Error('Escolha uma cor');

    this.moves++;
    this.closeUnoWindow(playerIdx);
    for (const c of cards) {
      player.hand.splice(player.hand.indexOf(c), 1);
      this.discard.push(c);
    }
    this.currentColor = isWild(card) ? chosenColor : card.color;
    this.phase = 'play';
    this.drawnCard = null;
    this.emit('play', { player: playerIdx, cards, card, color: this.currentColor });

    const n = this.players.length;
    const next = this.nextIndex(1);
    const stillPlaying = player.hand.length > 0;
    const chaos = this.mode === 'chaos';
    let handsMoved = false;

    switch (card.value) {
      case 'skip':
        this.emit('skip', { player: next });
        this.turn = this.nextIndex(2);
        break;
      case 'reverse':
        if (n === 2) {
          // Com 2 jogadores, inverter funciona como bloqueio.
          this.emit('skip', { player: next });
          this.turn = this.nextIndex(2);
        } else {
          this.direction *= -1;
          this.emit('reverse', { direction: this.direction });
          this.turn = this.nextIndex(1);
        }
        break;
      case 'draw2':
      case 'wild4': {
        const amount = card.value === 'draw2' ? 2 : 4;
        if (this.rules.stacking && (stillPlaying || chaos)) {
          // Acumula: o próximo pode rebater ou comprar tudo.
          this.pendingDraw += amount;
          this.turn = next;
        } else {
          const total = this.pendingDraw + amount;
          this.pendingDraw = 0;
          this.giveCards(next, total);
          this.emit('skip', { player: next });
          this.turn = this.nextIndex(2);
        }
        break;
      }
      case 'freeze': {
        // Balde de água fria: todo mundo que está de UNO volta pra estaca zero.
        const victims = this.players.map((p, i) => i).filter((i) => i !== playerIdx && this.players[i].hand.length === 1);
        for (const v of victims) {
          this.emit('freeze', { player: v, by: playerIdx });
          this.giveCards(v, FREEZE_DRAW);
        }
        if (!victims.length) this.emit('freeze', { player: null, by: playerIdx });
        this.turn = next;
        break;
      }
      case '9':
        if (this.rules.nine) {
          // O anterior (quem jogou antes de você) compra 1 por cada 9 jogado.
          const prev = this.indexFrom(playerIdx, -1);
          this.emit('nine', { player: prev, by: playerIdx, count: cards.length });
          this.giveCards(prev, cards.length);
        }
        this.turn = next;
        break;
      case '0':
        if (this.rules.zero && stillPlaying) {
          // Cada um passa a mão pro próximo no sentido do jogo.
          const hands = this.players.map((p) => p.hand);
          this.players.forEach((p, i) => (p.hand = hands[this.indexFrom(i, -1)]));
          handsMoved = true;
          this.emit('rotate', { direction: this.direction });
        }
        this.turn = next;
        break;
      case '1': {
        const other = extra.swapWith;
        if (this.rules.one && stillPlaying && Number.isInteger(other) && other !== playerIdx && this.players[other]) {
          [player.hand, this.players[other].hand] = [this.players[other].hand, player.hand];
          handsMoved = true;
          this.emit('swap', { player: playerIdx, with: other });
        }
        this.turn = next;
        break;
      }
      default:
        this.turn = next;
    }

    if (handsMoved) {
      // Mão trocada não é culpa de ninguém: quem ficou com 1 carta já está protegido.
      this.unoWindow = null;
      for (const l of this.lacks) l.clear(); // mãos mudaram de dono: memória zera
      for (const p of this.players) p.saidUno = p.hand.length === 1;
    } else if (player.hand.length === 1 && !player.saidUno) {
      // Ficou com 1 carta e não gritou? Fica "vulnerável" até alguém agir.
      this.unoWindow = playerIdx;
    } else if (player.hand.length !== 1) {
      player.saidUno = false;
    }

    if (player.hand.length === 0) {
      if (chaos) this.batida(playerIdx);
      else this.finishRound(playerIdx);
    }
  }

  // Caótico: zerou a mão → conta uma batida, compra 7 e o jogo continua.
  batida(playerIdx) {
    this.batidas[playerIdx]++;
    this.batidasTotal++;
    this.emit('batida', { player: playerIdx, count: this.batidas[playerIdx], total: this.batidasTotal });
    if (this.batidasTotal >= this.chaosTarget) return this.finishChaos();
    this.players[playerIdx].saidUno = false;
    this.giveCards(playerIdx, 7);
  }

  // Ganha quem bateu mais vezes. Empate: quem tem menos cartas na mão.
  finishChaos() {
    this.phase = 'over';
    this.unoWindow = null;
    const most = Math.max(...this.batidas);
    let best = this.players.map((p, i) => i).filter((i) => this.batidas[i] === most);
    const fewest = Math.min(...best.map((i) => this.players[i].hand.length));
    best = best.filter((i) => this.players[i].hand.length === fewest);
    this.winners = best; // mais de um = empate de verdade
    this.winner = best[0];
    this.roundPoints = 0;
    this.gameOver = true;
    this.emit('roundOver', { winner: this.winner, points: 0 });
  }

  // Cortar: joga fora da vez e a vez passa a ser sua.
  cut(playerIdx, ids, chosenColor, extra) {
    if (!this.canCutGroup(playerIdx, ids)) throw new Error('Não dá pra cortar');
    const from = this.turn;
    this.turn = playerIdx;
    this.phase = 'play';
    this.drawnCard = null;
    this.emit('cut', { player: playerIdx, from });
    this.play(playerIdx, ids, chosenColor, extra);
  }

  // Comprar: ou paga o acumulado, ou compra 1.
  draw(playerIdx) {
    this.assertTurn(playerIdx);
    if (this.phase === 'drawn') throw new Error('Você já comprou — jogue ou passe');
    this.moves++;
    this.closeUnoWindow(playerIdx);

    if (this.pendingDraw > 0) {
      const total = this.pendingDraw;
      this.pendingDraw = 0;
      this.giveCards(playerIdx, total);
      this.emit('skip', { player: playerIdx });
      this.turn = this.nextIndex(1);
      return null;
    }

    const missing = this.currentColor;
    const [card] = this.giveCards(playerIdx, 1);
    if (card && this.canPlayAfterDraw(playerIdx, card)) {
      // Pode jogar a carta comprada, ou passar.
      this.phase = 'drawn';
      this.drawnCard = card;
    } else {
      this.lacks[playerIdx].add(missing); // comprou e não serviu: não tem essa cor
      this.turn = this.nextIndex(1);
    }
    return card || null;
  }

  canPlayAfterDraw(playerIdx, card) {
    this.phase = 'drawn';
    this.drawnCard = card;
    const ok = this.canPlay(playerIdx, card);
    this.phase = 'play';
    this.drawnCard = null;
    return ok;
  }

  pass(playerIdx) {
    this.assertTurn(playerIdx);
    if (this.phase !== 'drawn') throw new Error('Só dá pra passar depois de comprar');
    this.moves++;
    this.phase = 'play';
    this.drawnCard = null;
    this.emit('pass', { player: playerIdx });
    this.turn = this.nextIndex(1);
  }

  // Gritar UNO: vale com 2 cartas (antes de jogar a penúltima) ou com 1.
  callUno(playerIdx) {
    const p = this.players[playerIdx];
    if (this.phase === 'over' || p.hand.length > 2 || p.saidUno) return false;
    p.saidUno = true;
    if (this.unoWindow === playerIdx) this.unoWindow = null;
    this.emit('uno', { player: playerIdx });
    return true;
  }

  // Pegar alguém que esqueceu o UNO: ele compra 2.
  catchUno(catcherIdx) {
    const target = this.unoWindow;
    if (target === null || target === catcherIdx || this.phase === 'over') return false;
    this.unoWindow = null;
    this.giveCards(target, 2);
    this.emit('caught', { player: target, by: catcherIdx });
    return true;
  }

  // ---------- internos ----------
  assertTurn(playerIdx) {
    if (this.phase === 'over') throw new Error('A rodada acabou');
    if (playerIdx !== this.turn) throw new Error('Não é a sua vez');
  }

  // Qualquer ação de OUTRO jogador fecha a chance de pegar quem esqueceu o UNO.
  closeUnoWindow(actorIdx) {
    if (this.unoWindow !== null && this.unoWindow !== actorIdx) this.unoWindow = null;
  }

  drawOne() {
    if (this.drawPile.length === 0) {
      // Monte acabou: embaralha a mesa (menos a carta de cima) e vira monte.
      const top = this.discard.pop();
      this.drawPile = shuffle(this.discard, this.rng);
      this.discard = [top];
      if (this.drawPile.length) this.emit('reshuffle', {});
    }
    return this.drawPile.pop() || null;
  }

  giveCards(playerIdx, count) {
    const p = this.players[playerIdx];
    const got = [];
    for (let i = 0; i < count; i++) {
      const c = this.drawOne();
      if (!c) break;
      p.hand.push(c);
      got.push(c);
    }
    if (p.hand.length > 1) p.saidUno = false;
    if (this.unoWindow === playerIdx && p.hand.length > 1) this.unoWindow = null;
    if (got.length) this.lacks[playerIdx].clear();
    this.emit('draw', { player: playerIdx, cards: got });
    return got;
  }

  finishRound(winnerIdx) {
    this.phase = 'over';
    this.winner = winnerIdx;
    this.unoWindow = null;
    this.roundPoints = this.players.reduce(
      (sum, p) => sum + p.hand.reduce((s, c) => s + cardPoints(c), 0),
      0
    );
    this.scores[winnerIdx] += this.roundPoints;
    this.gameOver = this.scores[winnerIdx] >= this.target;
    this.emit('roundOver', { winner: winnerIdx, points: this.roundPoints });
  }

  emit(type, data) {
    this.events.push({ type, ...data });
  }

  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}

// ---------- cérebro dos bots ----------
// Dá uma nota pra cada carta jogável e escolhe a melhor. O nível muda o quanto ele pensa.
const levelOf = (game, idx) => BOT_LEVELS[game.players[idx].level] || BOT_LEVELS[game.level] || BOT_LEVELS.medium;
const humanOf = (game) => game.players.findIndex((p) => !p.isBot);
const pick = (game, list) => list[Math.floor(game.rng() * list.length)];

const Bot = {
  chooseCard(game, idx) {
    const cfg = levelOf(game, idx);
    const hand = game.players[idx].hand;
    const options = game.playableCards(idx);
    if (options.length === 0) return null;
    if (cfg.play === 'random') return pick(game, options); // Fácil: qualquer uma

    const smart = cfg.play === 'smart';
    const next = game.nextIndex(1);
    const nextHand = game.players[next].hand.length;
    const prev = game.indexFrom(idx, -1);
    // Online pode ter vários humanos: o Mal-mal mira no humano que vem logo depois dele.
    const human = !game.players[next].isBot ? next : humanOf(game);
    const colorCount = countColors(hand);
    const someoneOnUno = game.players.some((p, i) => i !== idx && p.hand.length === 1);
    const humanOnUno = human >= 0 && human !== idx && game.players[human].hand.length === 1;
    // Quem é "perigo"? Normal: o próximo quase ganhando. Mal-mal: o próximo sendo VOCÊ já basta.
    const nextIsHuman = next === human;
    const threat = nextHand <= 2 || (cfg.gang && nextIsHuman && nextHand <= 5);
    const nextLacks = smart && game.lacks ? game.lacks[next] : new Set();
    const humanColors = cfg.peek && human >= 0 ? countColors(game.players[human].hand) : null;

    let best = null;
    let bestScore = -Infinity;
    for (const card of options) {
      let score = game.rng() * 2; // um pouquinho de sorte pra não ficar previsível
      if (card.value === 'freeze') {
        // Balde de água fria só vale a pena em quem está de UNO.
        score += someoneOnUno ? 60 : hand.length > 3 ? -18 : 0;
        if (cfg.gang && humanOnUno) score += 40; // Mal-mal: balde é SEU
      } else if (isWild(card)) {
        // Coringa é valioso: guarda pro final, a não ser que esteja acabando.
        score -= hand.length > 3 ? 12 : 0;
        if (card.value === 'wild4') score -= hand.length > 3 ? 6 : 0;
      } else {
        score += colorCount[card.color] * 2; // fica na cor que mais tem
        if (isNumber(card)) score += Number(card.value) / 3; // livra dos pontos altos
        if (game.rules.multi && isNumber(card)) score += (sameValue(hand, card).length - 1) * 5; // várias de uma vez!
      }

      const attack = card.value === 'draw2' || card.value === 'wild4' || card.value === 'skip';
      if (threat) {
        if (card.value === 'draw2' || card.value === 'wild4') score += 30;
        if (card.value === 'skip') score += 22;
        if (card.value === 'reverse') score += 12;
      }

      if (smart) {
        // Guarda munição: sem ninguém perigoso, +2 e Bloqueio esperam a hora certa.
        if (!threat && attack && hand.length > 3) score -= 6;
        // Mal-mal não gasta ataque em outro bot se VOCÊ não é o próximo.
        if (cfg.gang && attack && !nextIsHuman && nextHand > 2) score -= 8;
        // Fuja da cor de quem está de UNO: mesma cor pode dar a vitória pra ele.
        if (nextHand === 1 && !isWild(card)) score += card.color === game.currentColor ? -15 : 10;
        // Memória: o próximo não tem essa cor? Joga nela!
        if (card.color && nextLacks.has(card.color)) score += 8;
        // Espiando: você (o próximo) não tem essa cor? Pior pra você.
        if (humanColors && nextIsHuman && card.color && !humanColors[card.color]) score += 8;
        // 9 (anterior compra): ótimo se o anterior está quase ganhando.
        if (game.rules.nine && card.value === '9' && game.players[prev].hand.length <= 2) score += 12;
        // Inverter entrega a vez pro ANTERIOR: péssimo se ele está quase ganhando, ótimo se é o próximo.
        if (card.value === 'reverse' && game.players.length > 2) {
          const prevHand = game.players[prev].hand.length;
          if (prevHand <= 2) score -= 25;
          else if (nextHand <= 2) score += 10;
        }
        // Quase acabando: prefira jogar a carta que você teria MENOS chance de usar depois.
        if (hand.length <= 3 && !isWild(card) && colorCount[card.color] === 1) score += 4;
        // 0 (mãos giram): você recebe a mão do anterior. Bom se a dele é menor.
        if (game.rules.zero && card.value === '0') score += (hand.length - 1 - game.players[prev].hand.length) * 2;
      }

      if (score > bestScore) {
        bestScore = score;
        best = card;
      }
    }
    return best;
  },

  // Com "empilhar", leva junto as outras do mesmo número.
  // A última (que fica em cima) é da cor que o bot mais tem.
  group(game, idx, card) {
    if (!game.rules.multi || !isNumber(card) || (game.phase === 'drawn' && idx === game.turn)) return [card.id];
    if (levelOf(game, idx).play === 'random' && game.rng() < 0.5) return [card.id]; // Fácil às vezes nem percebe
    const hand = game.players[idx].hand;
    const rest = sameValue(hand, card).filter((c) => c !== card);
    const left = hand.filter((c) => c !== card && !rest.includes(c));
    const counts = countColors(left);
    rest.sort((a, b) => counts[a.color] - counts[b.color]);
    return [card.id, ...rest.map((c) => c.id)];
  },

  chooseColor(game, idx) {
    const cfg = levelOf(game, idx);
    if (cfg.play === 'random') return pick(game, COLORS);
    const counts = countColors(game.players[idx].hand);
    const score = { ...counts };
    if (cfg.play === 'smart') {
      const next = game.nextIndex(1);
      for (const c of game.lacks[next]) score[c] += 2; // o próximo não tem
      const human = !game.players[next].isBot ? next : humanOf(game);
      if (cfg.peek && human >= 0 && human !== idx) {
        // Mal-mal espia sua mão: escolhe a cor que VOCÊ tem menos.
        const mine = countColors(game.players[human].hand);
        for (const c of COLORS) score[c] -= mine[c] * 1.5;
      }
    }
    let best = COLORS[Math.floor(game.rng() * 4)];
    for (const c of COLORS) if (score[c] > score[best]) best = c;
    return best;
  },

  // Regra do 1: troca com quem tem menos cartas, se valer a pena.
  chooseSwap(game, idx, cardsLeft) {
    const cfg = levelOf(game, idx);
    const others = game.players.map((p, i) => i).filter((i) => i !== idx);
    if (cfg.play === 'random') return game.rng() < 0.5 ? pick(game, others) : null;
    let best = null;
    for (const i of others) {
      const n = game.players[i].hand.length;
      if (n < cardsLeft && (best === null || n < game.players[best].hand.length)) best = i;
    }
    // Mal-mal: se você está entre os que têm menos, a troca é com VOCÊ.
    const human = humanOf(game);
    if (cfg.gang && best !== null && human >= 0 && human !== idx && game.players[human].hand.length <= game.players[best].hand.length + 1) {
      best = human;
    }
    return best;
  },

  // Tem carta idêntica pra cortar?
  findCut(game, idx) {
    return game.players[idx].hand.find((c) => game.canCut(idx, c)) || null;
  },
};

function sameValue(hand, card) {
  return hand.filter((c) => c.value === card.value && isNumber(c));
}

function countColors(hand) {
  const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) if (c.color) counts[c.color]++;
  return counts;
}

// Deixa o Node usar isso nos testes; no navegador vira global.
if (typeof module !== 'undefined') {
  module.exports = { UnoGame, Bot, RULES, BOT_LEVELS, createDeck, shuffle, cardPoints, isWild, isNumber, COLORS, COLOR_NAMES };
}
