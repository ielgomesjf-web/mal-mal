// Teste do motor: roda `node teste.js` dentro da pasta UNOGame.
// Joga milhares de rodadas só com bots e confere as regras que não podem quebrar.
const { UnoGame, Bot, RULES, createDeck, isWild } = require('./uno.js');

let falhas = 0;
function confere(ok, msg) {
  if (!ok) {
    falhas++;
    if (falhas <= 10) console.log('FALHOU:', msg);
  }
}

// 1) Baralho
confere(createDeck().length === 108, 'baralho oficial tem 108 cartas');
confere(createDeck().filter(isWild).length === 8, '8 coringas');
confere(createDeck({ freeze: true }).length === 110, 'com Estaca Zero: 110');

// 2) Partidas simuladas
const TODAS = Object.fromEntries(Object.keys(RULES).map((k) => [k, true]));
function totalCartas(g) {
  return g.drawPile.length + g.discard.length + g.players.reduce((s, p) => s + p.hand.length, 0);
}

let rodadas = 0;
let jogadas = 0;
const visto = {};
for (const rules of [{}, { stacking: true }, TODAS]) {
  for (let jogadores = 2; jogadores <= 4; jogadores++) {
    for (let partida = 0; partida < 250; partida++) {
      const g = new UnoGame(
        Array.from({ length: jogadores }, (_, i) => ({ name: 'Bot' + i, isBot: true })),
        { rules, target: 500 }
      );
      g.startRound();
      const TOTAL = createDeck(g.rules).length;
      confere(g.players.every((p) => p.hand.length === 7), 'todos começam com 7');
      let passos = 0;
      while (g.phase !== 'over' && passos < 5000) {
        // alguém corta?
        if (g.rules.cut && Math.random() < 0.3) {
          const k = Math.floor(Math.random() * jogadores);
          const c = Bot.findCut(g, k);
          if (c) {
            g.cut(k, Bot.group(g, k, c), undefined, {});
            visto.cut = (visto.cut || 0) + 1;
            passos++;
            confere(totalCartas(g) === TOTAL, 'cortar perdeu carta');
            continue;
          }
        }
        const i = g.turn;
        const p = g.players[i];
        if (g.unoWindow !== null && g.unoWindow !== i && Math.random() < 0.5) g.catchUno(i);
        if (p.hand.length === 2 && Math.random() < 0.8) g.callUno(i);
        let card = Bot.chooseCard(g, i);
        if (!card) {
          const comprada = g.draw(i);
          card = g.phase === 'drawn' ? comprada : null;
        }
        if (card) {
          if (card.value === 'wild4' && g.pendingDraw === 0) {
            confere(!p.hand.some((c) => c.color === g.currentColor), '+4 ilegal');
          }
          const ids = Bot.group(g, i, card);
          if (ids.length > 1) visto.multi = (visto.multi || 0) + 1;
          visto[card.value] = (visto[card.value] || 0) + 1;
          const antes = p.hand.length;
          const swap = card.value === '1' ? Bot.chooseSwap(g, i, antes - ids.length) : null;
          g.play(i, ids, isWild(card) ? Bot.chooseColor(g, i) : undefined, { swapWith: swap });
        }
        jogadas++;
        passos++;
        confere(totalCartas(g) === TOTAL, `cartas somem/duplicam (total=${totalCartas(g)}, esperado ${TOTAL})`);
        const ids = new Set([...g.drawPile, ...g.discard, ...g.players.flatMap((p) => p.hand)].map((c) => c.id));
        confere(ids.size === TOTAL, 'id repetido');
      }
      confere(g.phase === 'over', 'rodada terminou (' + JSON.stringify(rules) + ', n=' + jogadores + ')');
      confere(g.players[g.winner].hand.length === 0, 'vencedor sem cartas');
      rodadas++;
    }
  }
}
confere(visto.cut > 0 && visto.multi > 0 && visto.freeze > 0, 'simulação exercitou cortar/empilhar/estaca zero');

// 3) Casos pontuais
function mesa(nomes, rules, top, hands) {
  const g = new UnoGame(nomes.map((name) => ({ name })), { rules });
  g.startRound();
  g.turn = 0;
  g.discard.push(top);
  g.currentColor = top.color;
  hands.forEach((h, i) => (g.players[i].hand = h));
  return g;
}
const C = (id, color, value) => ({ id, color, value });

{
  const g = mesa(['A', 'B', 'C'], {}, C(900, 'red', '5'), [[C(901, 'red', 'reverse'), C(902, 'blue', '1')]]);
  g.play(0, 901);
  confere(g.direction === -1 && g.turn === 2, 'inverter com 3 muda o sentido');
  confere(g.unoWindow === 0, 'esqueceu o UNO fica vulnerável');
  confere(g.catchUno(2) && g.players[0].hand.length === 3, 'pegou: compra 2');
}
{
  const g = mesa(['A', 'B'], {}, C(900, 'green', '5'), [
    [C(901, null, 'wild4'), C(902, 'green', '1'), C(903, 'blue', '2')],
    [C(904, 'green', 'skip'), C(905, 'red', '3')],
  ]);
  confere(!g.canPlay(0, g.players[0].hand[0]), '+4 bloqueado tendo verde');
  g.play(0, 902);
  g.play(1, 904);
  confere(g.turn === 1, 'bloqueio com 2 jogadores: joga de novo');
}
{
  const g = mesa(['A', 'B', 'C'], { stacking: true }, C(900, 'red', '5'), [
    [C(901, 'red', 'draw2'), C(910, 'red', '1')],
    [C(902, 'blue', 'draw2'), C(911, 'red', '1')],
  ]);
  const antes = g.players[2].hand.length;
  g.play(0, 901);
  g.play(1, 902);
  confere(g.pendingDraw === 4 && g.turn === 2, 'acumulou +4');
  g.draw(2);
  confere(g.players[2].hand.length === antes + 4 && g.turn === 0, 'comprou o acumulado e perdeu a vez');
}
{ // 9: o anterior compra
  const g = mesa(['A', 'B', 'C'], { nine: true }, C(900, 'red', '5'), [[], [C(901, 'red', '9'), C(902, 'blue', '3')], []]);
  g.players[0].hand = [C(903, 'red', '2'), C(904, 'red', '3')];
  g.turn = 1;
  g.play(1, 901);
  confere(g.players[0].hand.length === 3 && g.turn === 2, '9: o anterior (A) compra 1');
}
{ // 0: todo mundo passa a mão
  const g = mesa(['A', 'B', 'C'], { zero: true }, C(900, 'red', '5'), [
    [C(901, 'red', '0'), C(902, 'blue', '3')],
    [C(903, 'red', '7'), C(904, 'red', '8'), C(905, 'red', '9')],
    [C(906, 'green', '1')],
  ]);
  g.play(0, 901);
  const ids = g.players.map((p) => p.hand.map((c) => c.id).join());
  confere(ids[0] === '906' && ids[1] === '902' && ids[2] === '903,904,905', '0: mãos giram pro próximo');
  confere(g.players[0].saidUno && g.unoWindow === null, '0: quem recebeu 1 carta está protegido');
}
{ // 1: troca de mão
  const g = mesa(['A', 'B', 'C'], { one: true }, C(900, 'red', '5'), [
    [C(901, 'red', '1'), C(902, 'blue', '3'), C(903, 'blue', '4')],
    [C(904, 'red', '7')],
    [C(905, 'green', '1'), C(906, 'green', '2')],
  ]);
  g.play(0, 901, undefined, { swapWith: 1 });
  confere(g.players[0].hand.length === 1 && g.players[1].hand.length === 2, '1: trocou de mão com B');
  const g2 = mesa(['A', 'B'], { one: true }, C(900, 'red', '5'), [[C(901, 'red', '1'), C(902, 'blue', '3')], [C(904, 'red', '7')]]);
  g2.play(0, 901, undefined, { swapWith: null });
  confere(g2.players[0].hand.length === 1, '1: pode escolher não trocar');
}
{ // empilhar
  const g = mesa(['A', 'B'], { multi: true }, C(900, 'red', '5'), [
    [C(901, 'blue', '5'), C(902, 'green', '5'), C(903, 'yellow', '5'), C(904, 'blue', '7')],
  ]);
  confere(!g.canPlayGroup(0, [901, 904]), 'empilhar: números diferentes não');
  g.play(0, [902, 901, 903]);
  confere(g.top.id === 903 && g.currentColor === 'yellow' && g.players[0].hand.length === 1, 'empilhar: última fica em cima');
  const g2 = mesa(['A', 'B'], {}, C(900, 'red', '5'), [[C(901, 'blue', '5'), C(902, 'green', '5')]]);
  confere(!g2.canPlayGroup(0, [901, 902]), 'empilhar desligado: não pode');
}
{ // cortar
  const g = mesa(['A', 'B', 'C', 'D'], { cut: true }, C(900, 'red', '5'), [
    [C(901, 'blue', '2')],
    [C(902, 'red', '6')],
    [C(903, 'red', '5'), C(904, 'blue', '5'), C(905, 'green', '1')],
  ]);
  g.turn = 1;
  confere(!g.canCut(2, g.players[2].hand[1]), 'cortar: mesma cor E número');
  g.cut(2, 903);
  confere(g.turn === 3 && g.top.id === 903, 'cortar: rouba a vez e segue dele');
  confere(!mesa(['A', 'B'], {}, C(900, 'red', '5'), [[], [C(903, 'red', '5')]]).canCut(1, C(903, 'red', '5')), 'cortar desligado');
}
{ // estaca zero
  const g = mesa(['A', 'B', 'C'], { freeze: true }, C(900, 'red', '5'), [
    [C(901, null, 'freeze'), C(902, 'blue', '3')],
    [C(903, 'red', '7')],
    [C(904, 'green', '1'), C(905, 'green', '2')],
  ]);
  g.play(0, 901, 'blue');
  confere(g.players[1].hand.length === 7 && g.players[2].hand.length === 2, 'estaca zero: quem estava de UNO volta pra 7');
  confere(g.currentColor === 'blue', 'estaca zero escolhe cor');
}

// 3b) Modo caótico: rodadas só de bots até as batidas acabarem
{
  let jogos = 0;
  for (const rules of [{}, TODAS]) {
    for (let n = 2; n <= 4; n++) {
      for (let k = 0; k < 60; k++) {
        const g = new UnoGame(Array.from({ length: n }, (_, i) => ({ name: 'B' + i, isBot: true })), { rules, mode: 'chaos', chaosTarget: 5 });
        g.startRound();
        const TOTAL = createDeck(g.rules).length;
        let passos = 0;
        let vivos = 0; // quantas vezes alguém bateu e o jogo seguiu
        while (g.phase !== 'over' && passos++ < 20000) {
          const i = g.turn;
          let card = Bot.chooseCard(g, i);
          if (!card) { const c = g.draw(i); card = g.phase === 'drawn' ? c : null; }
          if (card) {
            const ids = Bot.group(g, i, card);
            const antes = g.batidasTotal;
            g.play(i, ids, isWild(card) ? Bot.chooseColor(g, i) : undefined, { swapWith: card.value === '1' ? Bot.chooseSwap(g, i, g.players[i].hand.length - ids.length) : null });
            if (g.batidasTotal > antes && g.phase !== 'over') {
              vivos++;
              confere(g.players[i].hand.length >= 1, 'caótico: quem bateu comprou cartas');
            }
          }
          confere(totalCartas(g) === TOTAL, 'caótico: cartas somem');
        }
        confere(g.phase === 'over', 'caótico terminou');
        confere(g.batidasTotal === 5, 'caótico acaba na 5ª batida (teve ' + g.batidasTotal + ')');
        confere(vivos === 4, 'caótico: as 4 primeiras batidas não acabam o jogo');
        confere(g.batidas[g.winner] === Math.max(...g.batidas), 'caótico: vence quem bateu mais');
        jogos++;
      }
    }
  }
  // desempate: mesmo número de batidas → menos cartas na mão
  const g = new UnoGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }], { mode: 'chaos', chaosTarget: 3 });
  g.startRound();
  g.batidas = [1, 1, 0];
  g.batidasTotal = 2;
  g.turn = 0;
  g.discard.push({ id: 900, color: 'red', value: '5' });
  g.currentColor = 'red';
  g.players[0].hand = [{ id: 901, color: 'red', value: '3' }];
  g.players[1].hand = [{ id: 902, color: 'red', value: '1' }, { id: 903, color: 'red', value: '2' }];
  g.play(0, 901);
  confere(g.phase === 'over' && g.winner === 0 && g.winners.length === 1, 'caótico: 2 batidas ganha de 1');
  g.batidas = [2, 2, 0];
  g.finishChaos();
  confere(g.winner === 0, 'caótico: empate desempata por menos cartas');
  console.log(`${jogos} jogos no modo caótico`);
}

// 3c) Dificuldade: um "humano" que joga igual ao bot médio ganha bem mais no Fácil que no Mal-mal
{
  const { BOT_LEVELS } = require('./uno.js');
  const taxa = (level) => {
    let v = 0;
    const N = 1500;
    for (let k = 0; k < N; k++) {
      const g = new UnoGame(
        [{ name: 'Você', isBot: false, level: 'medium' }, ...[1, 2, 3].map((i) => ({ name: 'B' + i, isBot: true }))],
        { level }
      );
      g.startRound();
      g.turn = k % 4;
      let passos = 0;
      while (g.phase !== 'over' && passos++ < 5000) {
        const i = g.turn;
        let card = Bot.chooseCard(g, i);
        if (!card) { const c = g.draw(i); card = g.phase === 'drawn' ? c : null; }
        if (card) g.play(i, Bot.group(g, i, card), isWild(card) ? Bot.chooseColor(g, i) : undefined, {});
      }
      if (g.winner === 0) v++;
    }
    return v / N;
  };
  const facil = taxa('easy');
  const mal = taxa('evil');
  confere(facil > mal + 0.08, `dificuldade: Fácil (${(facil * 100).toFixed(0)}%) devia ser bem mais fácil que Mal-mal (${(mal * 100).toFixed(0)}%)`);
  confere(Object.keys(BOT_LEVELS).join() === 'easy,medium,hard,evil', 'os 4 níveis existem');
  console.log(`dificuldade: você ganha ${(facil * 100).toFixed(0)}% no Fácil e ${(mal * 100).toFixed(0)}% no Mal-mal`);
}

// 3d) Online: anfitrião + convidados com jogo espelho
{
  const sala = require('./sala.js');
  const { applyView, makeRemoteGame, realIndex } = sala;
  // Igual à rede: tudo viaja como TEXTO e chega como cópia.
  const fio = (x) => JSON.parse(JSON.stringify(x));
  const viewFor = (g, s) => fio(sala.viewFor(g, s));
  const eventsFor = (g, s, evs) => fio(sala.eventsFor(g, s, evs));
  let jogos = 0;
  let acoes = 0;
  for (const rules of [{}, TODAS]) {
    for (let n = 2; n <= 4; n++) {
      for (let k = 0; k < 40; k++) {
        const g = new UnoGame(Array.from({ length: n }, (_, i) => ({ name: 'P' + i, isBot: i === 0 })), { rules, mode: k % 2 ? 'chaos' : 'normal' });
        g.startRound();
        let enviado = null;
        const espelhos = [null];
        for (let s = 1; s < n; s++) espelhos.push(makeRemoteGame(viewFor(g, s), (a) => (enviado = fio(a))));
        let passos = 0;
        while (g.phase !== 'over' && passos++ < 6000) {
          const i = g.turn;
          if (i === 0) {
            // anfitrião (aqui, um bot)
            let card = Bot.chooseCard(g, 0);
            if (!card) { const c = g.draw(0); card = g.phase === 'drawn' ? c : null; }
            if (card) g.play(0, Bot.group(g, 0, card), isWild(card) ? Bot.chooseColor(g, 0) : undefined, {});
          } else {
            // convidado: decide olhando SÓ o espelho, manda a ação, o anfitrião aplica
            const e = espelhos[i];
            let card = Bot.chooseCard(e, 0);
            if (!card) {
              e.draw(0);
              confere(enviado.type === 'draw', 'online: espelho mandou comprar');
              g.draw(i);
              if (g.phase === 'drawn') {
                applyView(e, viewFor(g, i));
                card = e.drawnCard;
                confere(card && game_has(g, i, card.id), 'online: carta comprada aparece no espelho');
              }
            }
            if (card) {
              const ids = Bot.group(e, 0, card);
              const swapView = card.value === '1' && g.rules.one ? Bot.chooseSwap(e, 0, e.players[0].hand.length - ids.length) : null;
              e.play(0, ids, isWild(card) ? Bot.chooseColor(e, 0) : undefined, { swapWith: swapView });
              const a = enviado;
              confere(g.canPlayGroup(i, a.ids), 'online: o que o espelho achou que vale, vale no jogo de verdade');
              const swap = a.swapWith === null ? null : realIndex(n, i, a.swapWith);
              g.play(i, a.ids, a.color, { swapWith: swap });
            }
          }
          acoes++;
          const evs = g.takeEvents();
          for (let s = 1; s < n; s++) {
            const mine = eventsFor(g, s, evs);
            for (const ev of mine) {
              if (ev.type === 'draw' && ev.player !== 0) confere(ev.cards.every((c) => c.value === 'hidden'), 'online: compra dos outros chega escondida');
            }
            applyView(espelhos[s], viewFor(g, s));
            const e = espelhos[s];
            confere((e.turn === 0) === (g.turn === s), 'online: de quem é a vez bate');
            confere(e.players.every((p, v) => p.hand.length === g.players[realIndex(n, s, v)].hand.length), 'online: quantidade de cartas bate');
            if (g.phase !== 'over') {
              for (const c of e.players[0].hand) confere(e.canPlay(0, c) === g.canPlay(s, c), 'online: espelho e jogo concordam no que dá pra jogar');
            }
                      }
        }
        confere(g.phase === 'over', 'online: partida terminou');
        jogos++;
      }
    }
  }
  // ninguém recebe a mão dos outros
  const g = new UnoGame([{ name: 'A' }, { name: 'B' }, { name: 'C' }], {});
  g.startRound();
  const v = JSON.stringify(viewFor(g, 1));
  confere(g.players[0].hand.every((c) => !v.includes(`"id":${c.id},`)), 'online: a visão do B não tem as cartas do A');
  console.log(`online: ${jogos} partidas com convidados, ${acoes} ações conferidas`);
}
function game_has(g, i, id) {
  return g.players[i].hand.some((c) => c.id === id);
}

// 4) Modo treino: joga cada roteiro de lição no motor, do começo ao fim.
{
  const { LESSONS, buildLessonGame, pickIds, checkStep, codeOf } = require('./treino.js');
  for (const lesson of LESSONS) {
    const tag = `lição ${lesson.id}:`;
    try {
      const g = buildLessonGame(lesson);
      if (lesson.setup) {
        const TOTAL = totalCartas(g);
        lesson.steps.forEach((st, n) => {
          const where = `${tag} passo ${n + 1}`;
          if (st.bot !== undefined) {
            const i = st.bot;
            if (st.draw) {
              confere(g.turn === i, `${where}: não é a vez do bot ${i}`);
              g.draw(i);
              if (g.phase === 'drawn') g.pass(i);
            } else {
              const codes = [].concat(st.play || st.cut);
              const ids = pickIds(g.players[i].hand, codes);
              if (st.cut) g.cut(i, ids, st.color, { swapWith: st.swapWith ?? null });
              else {
                confere(g.turn === i, `${where}: não é a vez do bot ${i} (é de ${g.turn})`);
                g.play(i, ids, st.color, { swapWith: st.swapWith ?? null });
              }
              if (!st.forgetUno && g.players[i].hand.length === 1) g.callUno(i);
              if (st.forgetUno) confere(g.unoWindow === i, `${where}: bot devia estar vulnerável`);
            }
          } else if (st.do) {
            if (st.do === 'play' || st.do === 'cut') {
              const codes = st.cards || [[].concat(st.card).find((c) => g.players[0].hand.some((x) => codeOf(x) === c))];
              const ids = pickIds(g.players[0].hand, codes);
              const cards = g.findCards(0, ids);
              const action = { type: 'play', cards, cutting: st.do === 'cut', color: st.color, swapWith: st.swapWith };
              confere(checkStep(st, action) === null, `${where}: a própria resposta não passa no checkStep`);
              if (st.do === 'cut') {
                confere(g.turn !== 0 && g.canCutGroup(0, ids), `${where}: não dá pra cortar aqui`);
                g.cut(0, ids, st.color || 'red', { swapWith: st.swapWith ?? null });
              } else {
                confere(g.turn === 0, `${where}: não é a sua vez`);
                g.play(0, ids, st.color || (cards.at(-1).color ? undefined : 'red'), { swapWith: st.swapWith ?? null });
              }
              // jogada ERRADA de propósito tem que ser recusada
              confere(checkStep(st, { type: 'draw' }) === 'wrong', `${where}: comprar devia ser errado`);
            } else if (st.do === 'draw') {
              confere(g.turn === 0 && g.phase === 'play', `${where}: não dá pra comprar`);
              g.draw(0);
            } else if (st.do === 'uno') {
              confere(g.callUno(0), `${where}: UNO não valeu (mão ${g.players[0].hand.map(codeOf)})`);
            } else if (st.do === 'catch') {
              confere(g.catchUno(0), `${where}: não tinha ninguém pra pegar`);
            } else if (st.do === 'pass') {
              g.pass(0);
            }
          }
          confere(totalCartas(g) === TOTAL, `${where}: cartas sumiram`);
        });
        confere(g.phase === 'over' && g.winner === 0, `${tag} roteiro devia terminar com você ganhando`);
      } else {
        // partida livre: bots jogam por você até alguém ganhar
        let passos = 0;
        while (g.phase !== 'over' && passos++ < 3000) {
          const i = g.turn;
          const card = Bot.chooseCard(g, i);
          if (card) g.play(i, Bot.group(g, i, card), isWild(card) ? Bot.chooseColor(g, i) : undefined, {});
          else { g.draw(i); if (g.phase === 'drawn') g.pass(i); }
        }
        confere(g.phase === 'over', `${tag} partida livre não terminou`);
      }
    } catch (e) {
      confere(false, `${tag} ${e.message}`);
    }
  }
  console.log(`${LESSONS.length} lições do modo treino conferidas`);
}

console.log(`${rodadas} rodadas, ${jogadas} jogadas simuladas`, JSON.stringify({ cut: visto.cut, multi: visto.multi, freeze: visto.freeze }));
console.log(falhas === 0 ? 'TUDO CERTO ✔' : `${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
