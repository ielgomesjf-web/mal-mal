// =============================================================
//  treino.js — as LIÇÕES do Modo treino, escritas como dados.
//  Cada lição monta uma mesa combinada (quem tem o quê) e segue
//  um roteiro de passos. Como é só dado, o teste.js consegue
//  jogar cada roteiro no Node e garantir que ele funciona.
//
//  Cartas em código curto:  r5 = 5 vermelho, gS = bloqueio verde,
//  bR = inverter azul, y+2 = +2 amarelo, W = coringa, W4 = +4,
//  Z = Estaca Zero.  (r/y/g/b = red/yellow/green/blue)
//
//  Passos:
//   { say }                      professor fala; espera "Continuar"
//   { do: 'play', card, say }    espera VOCÊ jogar essa carta
//        card: 'r2' ou ['g7','g8'] (qualquer uma delas)
//        cards: ['r9','b9']      várias de uma vez (empilhar)
//        top: 'r7'               qual tem que ficar em cima da pilha
//        color: 'green'          cor que tem que escolher no coringa
//   { do: 'cut' | 'draw' | 'uno' | 'catch' | 'pass', say }
//        point: false            não aponta a carta (você pensa sozinho)
//        wrong / wrongColor      o que o professor diz se errar
//   { bot: 1, play: 'g2' }       bot joga isso (ou draw: true, cut: 'y3')
//        forgetUno: true         bot "esquece" de gritar UNO
//   { free: true, say }          daqui pra frente é partida normal
// =============================================================

// No navegador o motor já está carregado (uno.js); no Node (teste), importa.
const MOTOR = typeof module !== 'undefined' ? require('./uno.js') : { UnoGame, shuffle, createDeck };

const COACH = { name: 'Coruja', avatar: '🦉' };
const BOT_AVATAR = { Ana: '🦊', Beto: '🐼', Caio: '🐸' };

const CHAPTERS = [
  {
    title: 'Bem-vindo! Vamos aprender a jogar?',
    lessons: [
      {
        id: 'b1',
        title: 'Cor ou número',
        bots: ['Ana'],
        setup: { top: 'r5', turn: 0, hands: [['r2', 'b8', 'g4', 'y2'], ['g2', 'y9', 'b5', 'g8', 'r3', 'r6']], deck: ['y5'] },
        steps: [
          { say: 'Oi! Eu sou a Coruja 🦉 e vou te ensinar a jogar Mal-mal! O objetivo é simples: ficar sem NENHUMA carta na mão!' },
          { say: 'Olha a carta no meio da mesa: um 5 VERMELHO. Você pode jogar uma carta da mesma COR ou do mesmo NÚMERO.' },
          { do: 'play', card: 'r2', say: 'Vamos pela cor: jogue o 2 vermelho 👇' },
          { bot: 1, play: 'g2' },
          { say: 'Viu? A Ana jogou um 2 VERDE em cima do 2 vermelho. Mesmo NÚMERO também vale!' },
          { do: 'play', card: 'y2', say: 'Agora você: jogue pelo NÚMERO. Tem um 2 aí na sua mão…' },
          { bot: 1, play: 'y9' },
          { do: 'draw', say: 'Hmm… 9 amarelo. Você não tem amarelo nem 9. Quando não tem jogada, clique no MONTE pra comprar uma carta.' },
          { do: 'play', card: 'y5', say: 'Sorte! Você comprou um 5 amarelo, e ele serve. Pode jogar agora mesmo!' },
          { bot: 1, play: 'b5' },
          { do: 'uno', say: 'Você está com 2 cartas. Quando for ficar com 1, tem que gritar UNO! Aperte o botão UNO! agora.' },
          { do: 'play', card: 'b8', say: 'Isso! Agora jogue o 8 azul.' },
          { bot: 1, play: 'g8' },
          { do: 'play', card: 'g4', say: 'Última carta! O 4 verde combina com o 8 verde. Joga e ganha!' },
        ],
        done: 'Você já sabe o principal: cor ou número, comprar quando não tem jogada, e gritar UNO!',
      },
      {
        id: 'b2',
        title: 'Cartas de ação',
        bots: ['Ana', 'Beto'],
        setup: {
          top: 'b4',
          turn: 0,
          hands: [['bS', 'bR', 'b+2', 'b7'], ['b9', 'b3', 'r1', 'r2', 'y3'], ['b1', 'b6', 'y7', 'y8', 'r5']],
        },
        steps: [
          { say: 'Algumas cartas fazem coisas especiais! Hoje você tem 3 delas: Bloqueio ⊘, Inverter ⇄ e +2.' },
          { do: 'play', card: 'bS', say: '⊘ BLOQUEIO: o próximo jogador perde a vez. O próximo é a Ana… tchau, Ana! Jogue o Bloqueio 👇' },
          { bot: 2, play: 'b1', say: 'A Ana foi pulada, então agora é o Beto.' },
          { do: 'play', card: 'bR', say: '⇄ INVERTER: muda o sentido do jogo. Jogue e olha as setas no meio da mesa!' },
          { bot: 2, play: 'b6', say: 'Agora o jogo anda ao contrário: depois de você vem o Beto, e depois a Ana.' },
          { bot: 1, play: 'b9' },
          { do: 'uno', say: 'Você vai ficar com 1 carta… já sabe o que fazer! 😉' },
          { do: 'play', card: 'b+2', say: '+2: o próximo compra 2 cartas E perde a vez. E o próximo agora é o Beto!' },
          { bot: 1, play: 'b3', say: 'O Beto comprou 2 e ficou sem jogar. Vez da Ana.' },
          { do: 'play', card: 'b7', say: 'Fecha com o 7 azul!' },
        ],
        done: 'Bloqueio pula, Inverter vira o sentido, +2 faz comprar. Anotado!',
      },
      {
        id: 'b3',
        title: 'Coringas',
        bots: ['Ana'],
        setup: { top: 'r3', turn: 0, hands: [['W', 'g5', 'g8', 'W4'], ['g1', 'y5', 'r7', 'r8', 'b2', 'b4']] },
        steps: [
          { say: 'As cartas pretas são CORINGAS: servem em cima de QUALQUER carta. E quem joga escolhe a nova cor!' },
          {
            do: 'play', card: 'W', color: 'green',
            say: 'Você não tem vermelho nem 3. Jogue o Coringa e escolha VERDE — a cor que você mais tem.',
            wrongColor: 'Escolha o VERDE: são as cartas que você tem na mão!',
          },
          { bot: 1, play: 'g1' },
          { say: 'Viu que o +4 ficou apagado? Ele só pode ser jogado quando você NÃO tem a cor da mesa. Você tem verde, então ainda não dá.' },
          { do: 'play', card: 'g5', say: 'Siga no verde: jogue o 5 verde.' },
          { bot: 1, play: 'y5' },
          { do: 'uno', say: 'Olha: amarelo na mesa e você sem amarelo. O +4 acendeu! Mas antes… UNO!' },
          {
            do: 'play', card: 'W4', color: 'green',
            say: 'Jogue o +4 e escolha VERDE. A Ana compra 4 e ainda perde a vez!',
            wrongColor: 'Escolha VERDE — sua última carta é verde!',
          },
          { do: 'play', card: 'g8', say: 'Sua vez de novo. Termina!' },
        ],
        done: 'Coringa escolhe a cor. O +4 escolhe a cor, faz comprar 4 — e só vale quando você não tem a cor da mesa.',
      },
      {
        id: 'b4',
        title: 'UNO! e Pegou!',
        bots: ['Ana'],
        setup: { top: 'y4', turn: 1, hands: [['y7', 'g7', 'g3'], ['y2', 'g2']], deck: ['r7', 'b6'] },
        steps: [
          { say: 'Lembra do UNO? Se alguém fica com 1 carta e ESQUECE de gritar, você pode pegar! Aí a pessoa compra 2.' },
          { bot: 1, play: 'y2', forgetUno: true },
          { do: 'catch', say: 'A Ana ficou com 1 carta e NÃO gritou UNO! Aperte PEGOU! rápido 👆' },
          { say: 'Hahaha! A Ana comprou 2. Mas cuidado: se VOCÊ esquecer, os outros também te pegam.' },
          { do: 'play', card: 'y7', say: 'Sua vez: jogue o 7 amarelo.' },
          { bot: 1, play: 'r7' },
          { do: 'uno', say: '2 cartas… você sabe! 😄' },
          { do: 'play', card: 'g7', say: 'Agora o 7 verde.' },
          { bot: 1, play: 'g2' },
          { do: 'play', card: 'g3', say: 'Última!' },
        ],
        done: 'Fique de olho: o botão PEGOU! aparece quando alguém esquece o UNO.',
      },
    ],
  },
  {
    title: 'Agora, vamos aprender a... jogar... mal-mal -_o',
    lessons: [
      {
        id: 'm1',
        title: 'Cortar',
        bots: ['Ana', 'Beto'],
        rules: { cut: true },
        setup: {
          top: 'r6',
          turn: 0,
          hands: [['r3', 'y3', 'b7', 'y9'], ['y3', 'y5', 'b9', 'g1', 'g2'], ['b5', 'y9', 'r1', 'r2', 'r7']],
        },
        steps: [
          { say: 'Primeira manha: CORTAR. Se você tiver uma carta IGUALZINHA à da mesa — mesma cor E mesmo número — pode jogar FORA da sua vez!' },
          { do: 'play', card: 'r3', say: 'Comece jogando o 3 vermelho.' },
          { bot: 1, play: 'y3' },
          { do: 'cut', card: 'y3', say: 'Olha isso! A Ana jogou 3 AMARELO… e você tem um igualzinho! Era a vez do Beto, mas CORTA: clique no 3 amarelo brilhando 👇' },
          { say: 'Roubou a vez do Beto! 😈 Depois de cortar, o jogo continua a partir de VOCÊ — a próxima é a Ana.' },
          { bot: 1, play: 'y5' },
          { bot: 2, play: 'b5' },
          { do: 'uno', say: 'Duas cartas. Você sabe o que fazer…' },
          { do: 'play', card: 'b7', say: 'Jogue o 7 azul.' },
          { bot: 1, play: 'b9' },
          { say: 'A Ana jogou 9 azul. Você tem um 9 amarelo… mas pra cortar tem que ser IGUALZINHA. Cor diferente não vale — espera.' },
          { bot: 2, play: 'y9' },
          { do: 'play', card: 'y9', say: 'O Beto jogou 9 amarelo — igual ao seu! Agora é sua vez normal mesmo. Termina!' },
        ],
        done: 'Cortar rouba a vez de quem ia jogar. Mas só com carta IGUALZINHA!',
      },
      {
        id: 'm2',
        title: 'Trocar a cor na cara',
        bots: ['Ana', 'Beto'],
        rules: { cut: true, multi: true },
        setup: {
          top: 'g4',
          turn: 1,
          hands: [['g7', 'r7', 'r9', 'b9'], ['g7', 'g5', 'g8', 'g6'], ['r2', 'y1', 'y4', 'b3']],
          deck: ['g1'],
        },
        steps: [
          { say: 'Manha nº 2: juntar CORTAR com EMPILHAR pra trocar a cor bem na cara de alguém. Dei uma espiada 👀: a Ana só tem cartas VERDES.' },
          { bot: 1, play: 'g7' },
          {
            do: 'cut', cards: ['g7', 'r7'], top: 'r7',
            say: 'A Ana jogou 7 verde e você tem um igual! Mas não corta ainda: arraste o 7 VERDE e depois o 7 VERMELHO pra bandeja (o vermelho por último, no topo) e aperte Cortar ✂',
            wrong: 'Quase! Na bandeja: primeiro o 7 verde, depois o 7 vermelho (ele fica no topo e muda a cor).',
          },
          { bot: 1, draw: true, say: 'Agora a mesa ficou VERMELHA… e a Ana só tem verde!' },
          { say: 'Hahaha, a Ana teve que comprar! -_o Isso é jogar mal-mal.' },
          { bot: 2, play: 'r2' },
          {
            do: 'play', cards: ['r9', 'b9'],
            say: 'Pra fechar: você tem dois 9. Coloque os dois na bandeja (o 9 vermelho primeiro, porque a mesa é vermelha) e GANHE de uma vez!',
            wrong: 'Coloque os DOIS 9 na bandeja — o vermelho primeiro — e aperte Jogar pilha.',
          },
        ],
        done: 'Cortar + empilhar = trocar a cor na hora que o outro ia jogar. Maldade pura! -_o',
      },
      {
        id: 'm3',
        title: 'Estaca Zero ❄',
        bots: ['Ana'],
        rules: { freeze: true },
        setup: {
          top: 'b5',
          turn: 1,
          hands: [['Z', 'y7', 'y9'], ['b1', 'g2']],
          deck: ['y4', 'r1', 'r3', 'g6', 'b8', 'b2', 'r5'],
        },
        steps: [
          { say: 'E agora a carta mais malvada do jogo: a ESTACA ZERO ❄ — o balde de água fria! Quem estiver de UNO compra 6 e volta pras 7 cartas.' },
          { bot: 1, play: 'b1' },
          { say: 'A Ana gritou UNO! Ela tá a uma carta de ganhar…' },
          {
            do: 'play', card: 'Z', color: 'yellow',
            say: 'Hora do balde! Jogue a Estaca Zero e escolha AMARELO (a cor que você tem).',
            wrongColor: 'Escolha AMARELO — suas cartas são amarelas!',
          },
          { say: '🥶 Balde de água fria! A Ana voltou pra estaca zero: 7 cartas.' },
          { bot: 1, play: 'y4' },
          { do: 'uno', say: 'Você tá com 2…' },
          { do: 'play', card: 'y7', say: 'Jogue o 7 amarelo.' },
          { bot: 1, draw: true },
          { do: 'play', card: 'y9', say: 'A Ana não tinha amarelo. Termina!' },
        ],
        done: 'Dica: guarde a Estaca Zero pra quando alguém estiver de UNO. Se ninguém estiver, ela vira só um coringa.',
      },
      {
        id: 'm4',
        title: 'Maldades do 0 e do 9',
        bots: ['Ana', 'Beto'],
        rules: { zero: true, nine: true, one: true },
        setup: {
          top: 'r5',
          turn: 0,
          hands: [['r0', 'r7', 'b1', 'b2', 'y6', 'g3', 'g4'], ['r2', 'y5', 'g5', 'b5'], ['r9', 'g9']],
          deck: ['y9', 'b7'],
        },
        steps: [
          { say: 'Com as regras do 0 e do 9 dá pra fazer MUITA maldade. Olha só: você tem 7 cartas e o Beto só 2.' },
          { do: 'play', card: 'r0', say: 'O 0 faz TODO MUNDO passar a mão pro próximo. E quem passa pra você é o Beto! Jogue o 0 vermelho.' },
          { say: 'Trocou tudo! Agora VOCÊ tem as 2 cartas do Beto, e a Ana ficou com o seu montão. 😈' },
          { bot: 1, play: 'r7' },
          { bot: 2, play: 'r2' },
          { do: 'uno', say: 'Você tá com 2 cartas…' },
          { do: 'play', card: 'r9', say: 'Agora o 9: com essa regra, o jogador ANTERIOR (quem jogou antes de você) compra 1. Tchau, Beto!' },
          { bot: 1, draw: true },
          { bot: 2, play: 'y9' },
          { do: 'play', card: 'g9', say: 'Fecha com o 9 verde!' },
        ],
        done: 'E o 1? Ele deixa você TROCAR de mão com quem quiser. Manha: troque com quem tem MENOS cartas.',
      },
    ],
  },
  {
    title: 'E agora o principal: jogar com inteligência.',
    lessons: [
      {
        id: 'i1',
        title: 'Guarde o coringa',
        bots: ['Ana'],
        setup: { top: 'b5', turn: 0, hands: [['W', 'b2', 'g7', 'g8'], ['y2', 'g1', 'g4', 'r9', 'r3']] },
        steps: [
          { say: 'Agora é com você: eu NÃO vou mais apontar a carta. Pense antes de jogar! 🤔' },
          {
            do: 'play', card: 'b2', point: false, say: 'Qual carta você joga agora?',
            wrong: 'Hmm, você tem uma carta azul! Guarde o CORINGA: ele salva quando NADA mais servir.',
          },
          { bot: 1, play: 'y2' },
          {
            do: 'play', card: 'W', color: 'green', point: false, say: 'E agora?',
            wrong: 'Nada combina com o 2 amarelo… é HORA do coringa!',
            wrongColor: 'Escolha a cor que você MAIS tem na mão.',
          },
          { bot: 1, play: 'g1' },
          { do: 'uno', point: false, say: 'Boa! Continue…', wrong: 'Você vai ficar com 1 carta… esqueceu de alguma coisa? 😉' },
          { do: 'play', card: ['g7', 'g8'], point: false },
          { bot: 1, play: 'g4' },
          { do: 'play', card: ['g7', 'g8'], point: false, say: 'Última!' },
        ],
        done: 'Coringa é trunfo: guarde pro final. E quando usar, escolha a cor que você MAIS tem.',
      },
      {
        id: 'i2',
        title: '+2 em quem tá de UNO',
        bots: ['Ana'],
        setup: { top: 'b6', turn: 0, hands: [['b+2', 'b3', 'b4'], ['b8']], deck: ['r1', 'g2'] },
        steps: [
          { say: 'A Ana está de UNO! Se ela tiver uma carta que sirva, ganha na próxima jogada.' },
          {
            do: 'play', card: 'b+2', point: false, say: 'O que você faz?',
            wrong: 'Se você jogar isso, a Ana pode ganhar! Use o +2 nela: ela compra 2 e ainda perde a vez.',
          },
          { say: 'Isso! A Ana tinha um 8 azul — ia ganhar! Agora ela tem 3 cartas e a vez voltou pra você.' },
          { do: 'uno', point: false, say: 'Continue…', wrong: 'Esqueceu de alguma coisa? 😉' },
          { do: 'play', card: ['b3', 'b4'], point: false },
          { bot: 1, play: 'b8' },
          { do: 'play', card: ['b3', 'b4'], point: false, say: 'Termina!' },
        ],
        done: 'Quando o próximo está quase ganhando: +2, Bloqueio e +4 são suas armas!',
      },
      {
        id: 'i3',
        title: 'Fuja da cor dela',
        bots: ['Ana'],
        setup: { top: 'r4', turn: 1, hands: [['r2', 'g5', 'g2'], ['r5', 'r8']], deck: ['y1', 'b1'] },
        steps: [
          { say: 'A Ana está jogando no VERMELHO… e vai ficar de UNO. Preste atenção!' },
          { bot: 1, play: 'r5' },
          {
            do: 'play', card: 'g5', point: false, say: 'A Ana está de UNO e adora vermelho. Qual você joga?',
            wrong: 'Se a mesa continuar VERMELHA, a Ana pode ganhar! Use o mesmo NÚMERO pra mudar a cor.',
          },
          { bot: 1, draw: true, say: 'A Ana não tinha verde. Teve que comprar!' },
          { do: 'uno', point: false, say: 'Boa!', wrong: 'Esqueceu de alguma coisa? 😉' },
          { do: 'play', card: 'g2', point: false },
          { bot: 1, draw: true },
          { do: 'play', card: 'r2', point: false, say: 'Termina!' },
        ],
        done: 'Se alguém está de UNO numa cor, fuja dela: mude a cor com o mesmo número.',
      },
      {
        id: 'i4',
        title: 'Prova final 🎓',
        bots: ['Ana', 'Beto'],
        rules: { cut: true, freeze: true },
        setup: null, // partida de verdade, cartas embaralhadas
        steps: [
          { say: 'PROVA FINAL! 🎓 Uma rodada de verdade contra a Ana e o Beto. Use tudo: guarde coringas, ataque quem tá de UNO, corte na hora certa… e não esqueça do UNO!' },
          { free: true, say: 'Boa sorte! Eu fico só olhando 👀' },
        ],
        done: 'VOCÊ É UM MESTRE DO MAL-MAL! 🏆',
      },
    ],
  },
];

const LESSONS = CHAPTERS.flatMap((ch, c) => ch.lessons.map((l) => ({ ...l, chapter: c })));

// ---------- cartas em código curto ----------
const CODE_COLOR = { r: 'red', y: 'yellow', g: 'green', b: 'blue' };
const CODE_VALUE = { S: 'skip', R: 'reverse', '+2': 'draw2' };

function parseCard(code, id) {
  if (code === 'W') return { id, color: null, value: 'wild' };
  if (code === 'W4') return { id, color: null, value: 'wild4' };
  if (code === 'Z') return { id, color: null, value: 'freeze' };
  const color = CODE_COLOR[code[0]];
  const rest = code.slice(1);
  if (!color) throw new Error('Carta inválida: ' + code);
  return { id, color, value: CODE_VALUE[rest] || rest };
}

function codeOf(card) {
  if (card.value === 'wild') return 'W';
  if (card.value === 'wild4') return 'W4';
  if (card.value === 'freeze') return 'Z';
  const v = { skip: 'S', reverse: 'R', draw2: '+2' }[card.value] || card.value;
  return card.color[0] + v;
}

// Acha na mão os ids das cartas pedidas (sem usar a mesma carta duas vezes).
function pickIds(hand, codes) {
  const used = new Set();
  return [].concat(codes).map((code) => {
    const c = hand.find((x) => !used.has(x.id) && codeOf(x) === code);
    if (!c) throw new Error('Carta não está na mão: ' + code);
    used.add(c.id);
    return c.id;
  });
}

// Monta o jogo da lição: mesa combinada, ou embaralhada se não tiver setup.
function buildLessonGame(lesson, rng = Math.random) {
  const players = [{ name: 'Você', isBot: false }].concat(
    lesson.bots.map((name) => ({ name, avatar: BOT_AVATAR[name], isBot: true }))
  );
  const game = new MOTOR.UnoGame(players, { rules: lesson.rules || {}, target: 9999 }, rng);
  game.startRound();
  const s = lesson.setup;
  if (s) {
    let id = 5000; // ids longe dos do baralho normal
    const mk = (code) => parseCard(code, id++);
    game.players.forEach((p, i) => {
      p.hand = (s.hands[i] || []).map(mk);
      p.saidUno = i > 0 && p.hand.length === 1; // bot que começa com 1 carta já gritou
    });
    const top = mk(s.top);
    game.discard = [top];
    game.currentColor = s.color || top.color;
    // Monte: as cartas combinadas saem primeiro; embaixo, um baralho qualquer.
    game.drawPile = MOTOR.shuffle(MOTOR.createDeck(game.rules), rng);
    for (const code of [...(s.deck || [])].reverse()) game.drawPile.push(mk(code));
    game.turn = s.turn || 0;
    game.direction = 1;
    game.pendingDraw = 0;
    game.phase = 'play';
    game.drawnCard = null;
    game.unoWindow = null;
  }
  game.takeEvents();
  return game;
}

// A ação do jogador bate com o passo da lição?
// Devolve null se sim, ou o motivo: 'wrong' | 'wrongColor' | 'wrongSwap'.
// Ação: { type: 'play', cards, cutting, color, swapWith } ou { type: 'draw' | 'uno' | 'catch' | 'pass' }
function checkStep(step, action) {
  if (!step || !step.do) return 'wrong';
  if (step.do === 'play' || step.do === 'cut') {
    if (action.type !== 'play' || (step.do === 'cut') !== !!action.cutting) return 'wrong';
    const codes = action.cards.map(codeOf);
    if (step.cards) {
      if ([...codes].sort().join() !== [...step.cards].sort().join()) return 'wrong';
    } else if (codes.length !== 1 || ![].concat(step.card).includes(codes[0])) {
      return 'wrong';
    }
    if (step.top && codes[codes.length - 1] !== step.top) return 'wrong';
    if (step.color && action.color !== undefined && action.color !== step.color) return 'wrongColor';
    if (step.swapWith !== undefined && action.swapWith !== undefined && action.swapWith !== step.swapWith) return 'wrongSwap';
    return null;
  }
  return action.type === step.do ? null : 'wrong';
}

if (typeof module !== 'undefined') {
  module.exports = { CHAPTERS, LESSONS, COACH, parseCard, codeOf, pickIds, buildLessonGame, checkStep };
}
