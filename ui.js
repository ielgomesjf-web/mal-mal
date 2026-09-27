// =============================================================
//  ui.js — a TELA. Lê o estado do motor (uno.js), desenha,
//  anima e faz os bots jogarem com um tempinho de "pensar".
// =============================================================

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BOTS = [
  { name: 'Ana', avatar: '🦊' },
  { name: 'Beto', avatar: '🐼' },
  { name: 'Caio', avatar: '🐸' },
];
// Onde cada adversário senta, na ordem do sentido horário a partir de você.
const SEATS = { 1: ['top'], 2: ['left', 'right'], 3: ['left', 'top', 'right'] };
const SYMBOL = { skip: '⊘', reverse: '⇄', draw2: '+2', wild: '', wild4: '+4', freeze: '❄' };
const COLOR_ORDER = { red: 0, yellow: 1, green: 2, blue: 3, null: 4 };
const VALUE_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2', 'wild', 'wild4', 'freeze'];

// As regras da casa, na ordem em que aparecem na tela inicial.
const RULE_INFO = [
  { key: 'stacking', title: '+2 e +4 acumulam', desc: 'Rebata um +2 com +2 (ou +4) e o próximo compra tudo' },
  { key: 'nine', title: '9 — o anterior compra', desc: 'Quem jogou antes de você compra 1 carta' },
  { key: 'zero', title: '0 — todo mundo passa a mão', desc: 'Cada mão vai pro próximo jogador' },
  { key: 'one', title: '1 — trocar de mão', desc: 'Você escolhe se troca de mão com alguém' },
  { key: 'multi', title: 'Empilhar', desc: 'Jogue várias do mesmo número — arraste pra montar a pilha' },
  { key: 'cut', title: 'Cortar', desc: 'Carta IGUAL à da mesa (cor e número)? Jogue fora da vez e roube a vez' },
  { key: 'freeze', title: 'Estaca Zero ❄', desc: 'Carta especial: quem está de UNO compra 6 (volta pras 7)' },
];

// O que cada dificuldade faz, em palavras (aparece na tela inicial).
const LEVEL_HELP = {
  easy: 'Bots distraídos: jogam qualquer carta e vivem esquecendo o UNO.',
  medium: 'Bots normais: jogam direitinho, mas às vezes vacilam.',
  hard: 'Bots espertos: lembram quem não tem qual cor, fogem da cor de quem tá de UNO e quase nunca vacilam.',
  evil: '😈 Os bots ESPIAM sua mão, se juntam contra você, reagem rápido e nunca perdoam um UNO esquecido.',
};

let game = null;
let sessionId = 0; // muda quando sai/recomeça, pra parar bots de uma partida velha
let highlightId = null; // carta que você acabou de comprar
let tray = []; // ids das cartas na sua pilha (empilhar), na ordem em que vão ser jogadas
let botsRunning = false;
let roundShown = false;
// Modo treino: quando tem lição rodando, o professor (treino-ui.js) vive aqui.
// coach.scripted = true → os bots seguem o roteiro e só vale a jogada que a lição pede.
let coach = null;
const coaching = () => coach && coach.scripted;
const botCfg = () => BOT_LEVELS[(game && game.level) || 'medium'];
const settings = loadSettings();

// ---------------- configurações salvas ----------------
function loadSettings() {
  const def = { name: 'Você', opponents: 3, target: 250, mode: 'normal', chaosTarget: 5, level: 'medium', sound: true, rules: { ...RULES } };
  try {
    const saved = JSON.parse(localStorage.getItem('uno-settings') || '{}');
    const s = { ...def, ...saved, rules: { ...RULES, ...(saved.rules || {}) } };
    if (saved.stacking) s.rules.stacking = true; // da versão antiga
    delete s.stacking;
    return s;
  } catch {
    return def;
  }
}
function saveSettings() {
  try {
    localStorage.setItem('uno-settings', JSON.stringify(settings));
  } catch {}
}

// ---------------- "cadeado" ----------------
// Só uma coisa mexe no jogo por vez (você, um bot, uma animação).
// Quem chega enquanto está ocupado espera na fila e depois confere se a jogada ainda vale.
let lockChain = Promise.resolve();
function withLock(fn) {
  const run = lockChain.then(fn);
  lockChain = run.catch((e) => console.error(e));
  return run;
}

// ---------------- som (gerado na hora, sem arquivo) ----------------
let audio = null;
function tone(freq, dur = 0.08, type = 'triangle', when = 0, vol = 0.15) {
  if (!settings.sound) return;
  try {
    audio = audio || new AudioContext();
    const t = audio.currentTime + when;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch {}
}
const sfx = {
  play: () => tone(520, 0.07),
  draw: () => tone(300, 0.06, 'sine'),
  error: () => tone(140, 0.15, 'square', 0, 0.08),
  uno: () => { tone(660, 0.12, 'square', 0, 0.1); tone(880, 0.2, 'square', 0.12, 0.1); },
  skip: () => tone(220, 0.15, 'sawtooth', 0, 0.08),
  cut: () => { tone(1200, 0.05, 'square', 0, 0.08); tone(700, 0.1, 'square', 0.05, 0.08); },
  swap: () => [400, 500, 600].forEach((f, i) => tone(f, 0.08, 'triangle', i * 0.06)),
  freeze: () => [1400, 1100, 800, 500].forEach((f, i) => tone(f, 0.12, 'sine', i * 0.07, 0.12)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', i * 0.12)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.22, 'sine', i * 0.15)),
};

// ---------------- desenho das cartas ----------------
function cardHTML(card, extra = '', style = '') {
  const sym = card.value in SYMBOL ? SYMBOL[card.value] : card.value;
  const num = card.value === '6' || card.value === '9' ? `<span class="u">${sym}</span>` : sym;
  const color = card.color || 'black';
  return `<div class="card c-${color} v-${card.value} ${extra}" data-id="${card.id}" style="${style}">
    <div class="face">
      <span class="corner tl">${num}</span>
      <span class="oval"><span class="sym">${num}</span></span>
      <span class="corner br">${num}</span>
    </div></div>`;
}
const backHTML = () =>
  '<div class="card back"><div class="face"><span class="oval"><span class="sym">MAL<br>MAL</span></span></div></div>';

function sortHand(hand) {
  return [...hand].sort(
    (a, b) =>
      COLOR_ORDER[a.color] - COLOR_ORDER[b.color] || VALUE_ORDER.indexOf(a.value) - VALUE_ORDER.indexOf(b.value)
  );
}

const nameOf = (i) => (i === 0 ? 'Você' : game.players[i].name);
const seatOf = (i) => SEATS[game.players.length - 1][i - 1];
const elOfPlayer = (i) => (i === 0 ? $('#hand') : $('#slot-' + seatOf(i) + ' .opp'));
const myHand = () => game.players[0].hand;

// A pilha só guarda cartas que ainda estão na sua mão (a mão pode ter trocado!).
function cleanTray() {
  const ids = new Set(myHand().map((c) => c.id));
  tray = tray.filter((id) => ids.has(id));
}

function trayStatus() {
  if (!tray.length) return { ok: false, cut: false };
  if (game.turn === 0) return { ok: game.canPlayGroup(0, tray), cut: false };
  const cut = game.canCutGroup(0, tray);
  return { ok: cut, cut };
}

// ---------------- render: redesenha tudo a partir do estado ----------------
function render() {
  if (!game) return;
  cleanTray();
  const over = game.phase === 'over';
  const myTurn = !over && game.turn === 0;
  const me = game.players[0];

  // adversários
  for (const seat of ['top', 'left', 'right']) $('#slot-' + seat).innerHTML = '';
  game.players.forEach((p, i) => {
    if (i === 0) return;
    const shown = Math.min(p.hand.length, 10);
    const uno = p.hand.length === 1 && p.saidUno ? '<span class="badge-uno">UNO!</span>' : '';
    $('#slot-' + seatOf(i)).innerHTML = `
      <div class="opp ${!over && game.turn === i ? 'turn' : ''}">
        <div class="opp-head"><span class="avatar">${p.avatar}</span>
          <span>${p.name} <span class="opp-score">${scoreText(i)}</span></span></div>
        <div class="fan">${backHTML().repeat(shown)}</div>
        <span class="count">${p.hand.length}</span>${uno}
      </div>`;
  });

  // mesa
  document.documentElement.style.setProperty('--cur', `var(--${game.currentColor})`);
  $('#dir').classList.toggle('ccw', game.direction === -1);
  const pile = game.discard.slice(-3);
  $('#discard').innerHTML = pile
    .map((c, k) => {
      const rot = ((c.id * 37) % 24) - 12; // inclinação "aleatória" mas fixa por carta
      const isTop = k === pile.length - 1;
      return cardHTML(c, isTop && !c.color ? 'chosen' : '', `transform: rotate(${rot}deg)`);
    })
    .join('');
  $('#pending').classList.toggle('hidden', !game.pendingDraw);
  $('#pending').textContent = '+' + game.pendingDraw;

  // sua mão (sem as cartas que estão na pilha)
  const inTray = new Set(tray);
  const playable = myTurn ? new Set(game.playableCards(0).map((c) => c.id)) : new Set();
  const cuttable = !myTurn && !over ? new Set(me.hand.filter((c) => game.canCut(0, c)).map((c) => c.id)) : new Set();
  const dragging = drag && drag.started ? drag.id : null;
  const hints = coach ? coachHints() : { ids: new Set(), targets: [] };
  $('#hand').innerHTML = sortHand(me.hand.filter((c) => !inTray.has(c.id)))
    .map((c, i) => {
      const cls = [
        playable.has(c.id) ? 'playable' : myTurn ? 'dim' : '',
        cuttable.has(c.id) ? 'cut' : '',
        c.id === highlightId ? 'new' : '',
        c.id === dragging ? 'dragging' : '',
        hints.ids.has(c.id) ? 'hint' : '',
      ].join(' ');
      return cardHTML(c, cls, `--i:${i}`);
    })
    .join('');
  layoutHand();

  // pilha (empilhar)
  const trayEl = $('#tray');
  trayEl.classList.toggle('hidden', !game.rules.multi || over);
  trayEl.classList.toggle('has', tray.length > 0);
  const tCards = game.findCards(0, tray);
  trayEl.querySelector('.tray-cards').innerHTML = tCards
    .map((c, k) => {
      const label = tCards.length > 1 && k === tCards.length - 1 ? 'topo' : String(k + 1);
      return cardHTML(c, c.id === dragging ? 'dragging' : '').replace('<div class="face">', `<span class="ord">${label}</span><div class="face">`);
    })
    .join('');
  const ts = trayStatus();
  trayEl.classList.toggle('bad', tray.length > 0 && !ts.ok);
  $('#btn-tray-play').classList.toggle('hidden', !tray.length);
  $('#btn-tray-play').disabled = !ts.ok;
  $('#btn-tray-play').textContent = ts.cut ? 'Cortar ✂' : 'Jogar pilha';
  $('#btn-tray-clear').classList.toggle('hidden', !tray.length);

  $('#me').classList.toggle('turn', myTurn);
  $('#me-name').textContent = settings.name || 'Você';
  $('#me-score').innerHTML = scoreText(0);
  $('#round-label').textContent = coach
    ? `Treino · ${coach.lesson.title}`
    : (isChaos() ? `🌪 Caótico · ${game.batidasTotal} de ${game.chaosTarget} batidas` : `Rodada ${game.round} · até ${game.target}`) +
      ` · ${botCfg().name}`;
  $('#round-label').classList.toggle('chaos', !!isChaos());

  // botões
  $('#btn-uno').classList.toggle('hidden', over || me.hand.length > 2 || me.saidUno);
  $('#btn-pass').classList.toggle('hidden', !(myTurn && game.phase === 'drawn'));
  $('#btn-catch').classList.toggle('hidden', over || game.unoWindow === null || game.unoWindow === 0);
  $('#deck').classList.toggle('pulse', myTurn && game.phase === 'play' && playable.size === 0 && !tray.length);
  for (const sel of ['#deck', '#btn-uno', '#btn-catch', '#btn-pass', '#tray']) $(sel).classList.toggle('hint', hints.targets.includes(sel));
  $('#table').classList.toggle('lesson', !!coach);

  // mensagem
  let msg = '';
  if (myTurn) {
    if (game.pendingDraw) msg = `Rebata com +${game.top.value === 'draw2' ? '2 ou +4' : '4'} ou compre ${game.pendingDraw}`;
    else if (game.phase === 'drawn') msg = 'Jogue a carta que comprou ou passe';
    else msg = playable.size ? 'Sua vez!' : 'Sem jogada — compre do monte';
  } else if (!over) {
    // (na lição com roteiro quem dá as instruções é a Coruja, pra não falarem coisas diferentes)
    msg = cuttable.size && !coaching() ? 'Você pode CORTAR! ✂ Clique na carta brilhando' : `${game.current.name} está pensando…`;
  }
  $('#status').textContent = msg;
  $('#status').classList.toggle('cut-msg', !myTurn && cuttable.size > 0 && !coaching());
}

const isChaos = () => game && game.mode === 'chaos';
// No normal mostra pontos; no caótico, quantas vezes a pessoa bateu.
function scoreText(i) {
  return isChaos() ? `<span class="batidas">🌪 ${game.batidas[i]}</span>` : `${game.scores[i]} pts`;
}

// Aperta as cartas quando a mão fica grande.
function layoutHand() {
  const hand = $('#hand');
  const n = hand.children.length;
  if (n < 2) return;
  const cw = hand.children[0].offsetWidth;
  const free = hand.clientWidth - 20 - n * cw;
  hand.style.setProperty('--gap', Math.min(6, free / (n - 1)) + 'px');
}
window.addEventListener('resize', layoutHand);

// ---------------- animações ----------------
function center(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// Cria uma carta "fantasma" e voa com ela de um lugar pro outro.
async function fly(fromRect, toRect, html, duration = 380) {
  const el = document.createElement('div');
  el.className = 'flyer';
  el.innerHTML = html;
  document.body.append(el);
  const card = el.firstElementChild;
  const a = center(fromRect);
  const b = center(toRect);
  el.style.left = a.x - card.offsetWidth / 2 + 'px';
  el.style.top = a.y - card.offsetHeight / 2 + 'px';
  const spin = (Math.random() - 0.5) * 30;
  try {
    await el.animate(
      [
        { transform: 'translate(0,0) scale(1)' },
        { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) rotate(${spin}deg) scale(1)` },
      ],
      { duration, easing: 'cubic-bezier(.2,.7,.3,1)' }
    ).finished;
  } catch {}
  el.remove();
}

// Voa as cartas jogadas, uma atrás da outra, até a mesa.
async function flyToDiscard(fromFor, cards) {
  const to = $('#discard').getBoundingClientRect();
  await Promise.all(
    cards.map((c, k) =>
      sleep(k * 110).then(() => {
        const from = fromFor(c);
        return from ? fly(from, to, cardHTML(c), 360) : null;
      })
    )
  );
}

async function animateDraw(playerIdx, cards) {
  const from = $('#deck').getBoundingClientRect();
  const target = elOfPlayer(playerIdx);
  if (!target) return;
  const to = target.getBoundingClientRect();
  const flights = cards.slice(0, 6).map((c, k) =>
    sleep(k * 90).then(() => fly(from, to, playerIdx === 0 ? cardHTML(c) : backHTML(), 340))
  );
  await Promise.all(flights);
}

// Mão inteira indo de um jogador pro outro (regras do 0 e do 1).
async function animateHands(pairs) {
  const flights = [];
  for (const [a, b] of pairs) {
    const ea = elOfPlayer(a);
    const eb = elOfPlayer(b);
    if (!ea || !eb) continue;
    for (let k = 0; k < 3; k++) {
      flights.push(sleep(k * 70).then(() => fly(ea.getBoundingClientRect(), eb.getBoundingClientRect(), backHTML(), 520)));
    }
  }
  await Promise.all(flights);
}

function toast(text) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  const box = $('#toasts');
  // No máximo 3 avisos ao mesmo tempo — senão cobrem os jogadores de cima.
  while (box.children.length >= 3) box.firstElementChild.remove();
  box.append(t);
  setTimeout(() => t.remove(), 2500);
}

function bubble(playerIdx, text) {
  const target = playerIdx === 0 ? $('#me') : elOfPlayer(playerIdx);
  if (!target) return;
  const r = target.getBoundingClientRect();
  const b = document.createElement('div');
  b.className = 'bubble';
  b.textContent = text;
  b.style.left = r.left + r.width / 2 + 'px';
  b.style.top = r.top + (playerIdx === 0 ? 0 : r.height / 2) + 'px';
  document.body.append(b);
  setTimeout(() => b.remove(), 1400);
}

function shake(el) {
  sfx.error();
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth; // reinicia a animação
  el.classList.add('shake');
}

function confetti() {
  const colors = ['#e3262f', '#f5c400', '#2fa84f', '#1f6fd1', '#fff'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = Math.random() * 100 + 'vw';
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = 1.8 + Math.random() * 1.8 + 's';
    c.style.animationDelay = Math.random() * 0.6 + 's';
    document.body.append(c);
    setTimeout(() => c.remove(), 4500);
  }
}

// ---------------- eventos do motor viram efeitos na tela ----------------
async function handleEvents() {
  const evs = game.takeEvents();
  if (isHost()) netSync(evs); // online: o anfitrião conta pra todo mundo o que aconteceu
  for (const ev of evs) {
    switch (ev.type) {
      case 'play':
        sfx.play();
        if (ev.cards.length > 1) toast(`${nameOf(ev.player)} empilhou ${ev.cards.length} cartas!`);
        if (!ev.card.color) toast(`${nameOf(ev.player)} escolheu ${COLOR_NAMES[ev.color]}`);
        break;
      case 'draw':
        if (!ev.cards.length) break;
        sfx.draw();
        if (ev.cards.length > 1) toast(`${nameOf(ev.player)} comprou ${ev.cards.length} cartas`);
        await animateDraw(ev.player, ev.cards);
        render();
        break;
      case 'skip':
        sfx.skip();
        toast(ev.player === 0 ? 'Você perdeu a vez' : `${nameOf(ev.player)} perdeu a vez`);
        break;
      case 'reverse':
        toast('Sentido invertido!');
        break;
      case 'uno':
        sfx.uno();
        bubble(ev.player, 'UNO!');
        break;
      case 'caught':
        sfx.error();
        toast(
          ev.player === 0
            ? `${nameOf(ev.by)} te pegou sem UNO! +2`
            : ev.by === 0
            ? `Você pegou ${nameOf(ev.player)} sem UNO! +2`
            : `${nameOf(ev.by)} pegou ${nameOf(ev.player)} sem UNO! +2`
        );
        break;
      case 'cut':
        sfx.cut();
        bubble(ev.player, 'CORTOU! ✂');
        toast(ev.player === 0 ? `Você cortou ${nameOf(ev.from)}!` : `${nameOf(ev.player)} cortou ${ev.from === 0 ? 'você' : nameOf(ev.from)}!`);
        break;
      case 'nine':
        toast(`9! ${ev.player === 0 ? 'Você (anterior) compra' : `${nameOf(ev.player)} (anterior) compra`} ${ev.count}`);
        break;
      case 'rotate': {
        sfx.swap();
        toast('0! Todo mundo passa a mão ⟳');
        const n = game.players.length;
        await animateHands(game.players.map((p, i) => [i, (((i + ev.direction) % n) + n) % n]));
        render();
        break;
      }
      case 'swap':
        sfx.swap();
        toast(`${nameOf(ev.player)} trocou de mão com ${ev.with === 0 ? 'você' : nameOf(ev.with)}!`);
        await animateHands([[ev.player, ev.with], [ev.with, ev.player]]);
        render();
        break;
      case 'freeze':
        sfx.freeze();
        if (ev.player === null) toast(`❄ Balde de água fria… mas ninguém estava de UNO`);
        else {
          bubble(ev.player, '🥶 +6');
          toast(`❄ Balde de água fria! ${ev.player === 0 ? 'Você volta' : `${nameOf(ev.player)} volta`} pra estaca zero`);
        }
        break;
      case 'batida': {
        sfx.win();
        bubble(ev.player, 'BATEU! 🌪');
        const left = game.chaosTarget - ev.total;
        const who = ev.player === 0 ? 'Você bateu' : `${nameOf(ev.player)} bateu`;
        toast(`${who}! (${ev.count}ª vez) ${left > 0 ? `— compra 7 e continua. Faltam ${left}` : '— ÚLTIMA BATIDA!'}`);
        render();
        await sleep(700);
        break;
      }
      case 'reshuffle':
        toast('Monte acabou — embaralhando a mesa');
        break;
    }
  }
}

// ---------------- suas jogadas ----------------
// ids: uma carta ou uma pilha. Serve pra jogar na sua vez E pra cortar.
function humanPlay(ids) {
  const session = sessionId;
  return withLock(async () => {
    if (!game || game.phase === 'over' || session !== sessionId) return;
    const cutting = game.turn !== 0;
    const ok = cutting ? game.canCutGroup(0, ids) : game.canPlayGroup(0, ids);
    if (!ok) return shake(ids.length === 1 ? $(`#hand [data-id="${ids[0]}"]`) : $('#tray'));

    const cards = game.findCards(0, ids);
    if (!coachGate({ type: 'play', cards, cutting })) return;
    const last = cards[cards.length - 1];
    let color;
    if (isWild(last)) {
      color = await pickColor();
      if (!color || session !== sessionId) return;
    }
    let swapWith = null;
    if (last.value === '1' && game.rules.one && myHand().length > ids.length) {
      swapWith = await pickSwap(myHand().length - ids.length);
      if (session !== sessionId) return;
    }
    const action = { type: 'play', cards, cutting, color, swapWith };
    if (!coachGate(action)) return;

    const handRect = $('#hand').getBoundingClientRect();
    const rects = new Map(cards.map((c) => {
      const el = document.querySelector(`#hand [data-id="${c.id}"], #tray [data-id="${c.id}"]`);
      const r = el ? el.getBoundingClientRect() : handRect;
      if (el) el.style.visibility = 'hidden';
      return [c, r];
    }));
    await flyToDiscard((c) => rects.get(c), cards);

    highlightId = null;
    tray = tray.filter((id) => !ids.includes(id));
    if (cutting) game.cut(0, ids, color, { swapWith });
    else game.play(0, ids, color, { swapWith });
    render();
    await handleEvents();
    render();
    coachAfter(action);
  }).then(afterAction);
}

function onCardTap(id, from) {
  if (!game || game.phase === 'over') return;
  if (from === 'tray') {
    // clicar numa carta da pilha devolve pra mão
    tray = tray.filter((x) => x !== id);
    return render();
  }
  const card = myHand().find((c) => c.id === id);
  const el = $(`#hand [data-id="${id}"]`);
  if (!card) return;
  const ok = game.turn === 0 ? game.canPlay(0, card) : game.canCut(0, card);
  if (!ok) return shake(el);
  humanPlay([id]);
}

$('#deck').addEventListener('click', () =>
  withLock(async () => {
    if (!game || game.turn !== 0 || game.phase !== 'play') return shake($('#deck'));
    if (!coachGate({ type: 'draw' })) return;
    tray = [];
    const card = game.draw(0);
    await handleEvents();
    highlightId = game.phase === 'drawn' && card ? card.id : null;
    render();
    coachAfter({ type: 'draw' });
  }).then(afterAction)
);

$('#btn-pass').addEventListener('click', () =>
  withLock(async () => {
    if (!game || game.turn !== 0 || game.phase !== 'drawn') return;
    if (!coachGate({ type: 'pass' })) return;
    highlightId = null;
    game.pass(0);
    await handleEvents();
    render();
    coachAfter({ type: 'pass' });
  }).then(afterAction)
);

$('#btn-uno').addEventListener('click', () =>
  withLock(async () => {
    if (!game || !coachGate({ type: 'uno' })) return;
    if (game.callUno(0)) {
      await handleEvents();
      coachAfter({ type: 'uno' });
    }
    render();
  })
);

$('#btn-catch').addEventListener('click', () =>
  withLock(async () => {
    if (!game || game.unoWindow === null || game.unoWindow === 0 || !coachGate({ type: 'catch' })) return;
    if (game.catchUno(0)) {
      await handleEvents();
      coachAfter({ type: 'catch' });
    }
    render();
  })
);

$('#btn-tray-play').addEventListener('click', () => {
  if (tray.length) humanPlay([...tray]);
});
$('#btn-tray-clear').addEventListener('click', () => {
  tray = [];
  render();
});

// Janela aberta agora (cor ou troca). Sair da partida fecha ela à força,
// senão o cadeado ficaria esperando uma resposta que nunca vem.
let closeModal = null;
function ask(modal, pick) {
  return new Promise((resolve) => {
    const done = (v) => {
      modal.classList.add('hidden');
      modal.onclick = null;
      closeModal = null;
      resolve(v);
    };
    closeModal = () => done(null);
    modal.classList.remove('hidden');
    modal.onclick = (e) => {
      const v = pick(e);
      if (v !== undefined) done(v);
    };
  });
}

function pickColor() {
  const modal = $('#modal-color');
  return ask(modal, (e) => {
    const btn = e.target.closest('[data-color]');
    if (!btn && e.target !== modal) return undefined;
    return btn && btn.dataset.color ? btn.dataset.color : null;
  });
}

// Regra do 1: com quem trocar de mão? (null = não trocar)
function pickSwap(myCardsLeft) {
  return new Promise((resolve) => {
    const modal = $('#modal-swap');
    $('#swap-options').innerHTML = game.players
      .map((p, i) =>
        i === 0 ? '' : `<button data-swap="${i}"><span>${p.avatar} ${p.name}</span><span>${p.hand.length} carta${p.hand.length === 1 ? '' : 's'}</span></button>`
      )
      .join('');
    modal.querySelector('.sub').textContent = `Você jogou 1 e vai ficar com ${myCardsLeft} carta${myCardsLeft === 1 ? '' : 's'}. Quer trocar?`;
    resolve(
      ask(modal, (e) => {
        const btn = e.target.closest('[data-swap]');
        if (!btn) return undefined;
        return btn.dataset.swap === '' ? null : Number(btn.dataset.swap);
      })
    );
  });
}

function afterAction() {
  if (!game) return;
  if (game.phase === 'over') showRoundOver();
  else if (coaching()) return; // no roteiro, quem move os bots é o professor
  else if (wakeBots) wakeBots(); // o laço já existe, só estava cochilando
  else runBots();
}

// Cochilo que dá pra interromper: quando você joga, o laço acorda na hora.
let wakeBots = null;
function nap(ms) {
  return new Promise((r) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      wakeBots = null;
      r();
    }
    wakeBots = done;
  });
}

// ---------------- arrastar cartas (empilhar) ----------------
// Tocar = jogar. Arrastar pra bandeja = montar pilha. Arrastar pra mesa = jogar.
let drag = null;

document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('#hand .card, #tray .card');
  if (!el || !game || e.button > 0) return;
  drag = { id: Number(el.dataset.id), el, from: el.closest('#tray') ? 'tray' : 'hand', x: e.clientX, y: e.clientY, started: false };
});

document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.started) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
    drag.started = true;
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'flyer drag';
    drag.ghost.innerHTML = drag.el.outerHTML;
    drag.ghost.firstElementChild.classList.remove('playable', 'dim', 'cut', 'new');
    drag.ghost.firstElementChild.style.cssText = '';
    document.body.append(drag.ghost);
    drag.el.classList.add('dragging');
    document.body.classList.add('dragging-on');
  }
  const g = drag.ghost.firstElementChild;
  drag.ghost.style.left = e.clientX - g.offsetWidth / 2 + 'px';
  drag.ghost.style.top = e.clientY - g.offsetHeight / 2 + 'px';
  const zone = zoneAt(e.clientX, e.clientY);
  $('#tray').classList.toggle('drop-hover', zone === 'tray');
  $('#discard').classList.toggle('drop-hover', zone === 'discard');
});

document.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.started) return onCardTap(d.id, d.from);
  endDrag(d);
  const zone = zoneAt(e.clientX, e.clientY);
  if (zone === 'tray') addToTray(d.id, e.clientX);
  else if (zone === 'discard') {
    if (d.from === 'tray') humanPlay([...tray]);
    else humanPlay([d.id]);
  } else if (d.from === 'tray') tray = tray.filter((x) => x !== d.id); // largou fora: volta pra mão
  render();
});

document.addEventListener('pointercancel', () => {
  if (drag && drag.started) endDrag(drag);
  drag = null;
  render();
});

function endDrag(d) {
  d.ghost.remove();
  document.body.classList.remove('dragging-on');
  $('#tray').classList.remove('drop-hover');
  $('#discard').classList.remove('drop-hover');
}

function zoneAt(x, y) {
  const inside = (el, pad = 0) => {
    if (!el || el.offsetParent === null) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
  };
  if (game && game.rules.multi && inside($('#tray'), 16)) return 'tray';
  if (inside($('#discard'), 30)) return 'discard';
  return null;
}

function addToTray(id, x) {
  const card = myHand().find((c) => c.id === id);
  if (!card) return;
  const rest = tray.filter((t) => t !== id);
  const first = game.findCards(0, rest)[0];
  // Só números, e todos iguais.
  if (!isNumber(card) || (first && first.value !== card.value)) {
    toast('Na pilha só entram cartas do MESMO número');
    return shake($('#tray'));
  }
  // Onde soltou? Conta quantas cartas da pilha ficam à esquerda.
  const els = [...document.querySelectorAll('#tray .tray-cards .card')].filter((el) => Number(el.dataset.id) !== id);
  const pos = els.filter((el) => center(el.getBoundingClientRect()).x < x).length;
  rest.splice(pos, 0, id);
  tray = rest;
}

// ---------------- vez dos bots ----------------
// Um laço só, que roda enquanto for vez de bot. Ele "pensa" FORA do cadeado,
// então você pode apertar UNO, Pegou! ou cortar enquanto o bot pensa.
async function runBots() {
  if (botsRunning || !game || coaching() || isGuest()) return; // convidado não mexe nos bots
  botsRunning = true;
  const session = sessionId;
  const alive = () => session === sessionId && game && game.phase !== 'over';
  let triedOnHumanTurn = -1;

  try {
    while (alive()) {
      const stamp = game.moves;

      if (!game.current.isBot) {
        // Sua vez. Os bots só podem te CORTAR — e tentam uma vez só por jogada.
        if (!game.rules.cut || triedOnHumanTurn === stamp) break;
        triedOnHumanTurn = stamp;
        if (!botsThatCanCut().length) break;
        await nap(botCfg().think[0] * 1.6 + Math.random() * 1400);
        await withLock(async () => {
          if (alive() && game.moves === stamp) await tryBotCut(botCfg().cut);
        });
        continue;
      }

      render();
      const [t, extra] = botCfg().think;
      await sleep(t + Math.random() * extra); // "pensando" — e é a sua chance de agir!
      if (!alive()) break;
      await withLock(async () => {
        if (!alive() || game.moves !== stamp) return; // alguém cortou no meio: recomeça
        if (await tryBotCut(botCfg().cut * 0.7)) return;
        await botTurn(game.turn);
      });
    }
  } finally {
    if (session === sessionId) {
      botsRunning = false;
      wakeBots = null;
    }
  }
  if (session !== sessionId || !game) return;
  render();
  if (game.phase === 'over') showRoundOver();
}

function botsThatCanCut() {
  return game.players.map((p, i) => i).filter((i) => game.players[i].isBot && i !== game.turn && Bot.findCut(game, i));
}

async function tryBotCut(chance) {
  if (!game.rules.cut) return false;
  for (const k of botsThatCanCut()) {
    if (Math.random() > chance) continue;
    const card = Bot.findCut(game, k);
    const ids = Bot.group(game, k, card);
    const left = game.players[k].hand.length - ids.length;
    const swapWith = card.value === '1' ? Bot.chooseSwap(game, k, left) : null;
    await flyToDiscard(() => elOfPlayer(k).getBoundingClientRect(), game.findCards(k, ids));
    game.cut(k, ids, undefined, { swapWith });
    await afterBotPlay(k);
    return true;
  }
  return false;
}

async function botTurn(i) {
  const bot = game.players[i];

  // Alguém esqueceu o UNO? O bot pode pegar.
  if (game.unoWindow !== null && game.unoWindow !== i && Math.random() < botCfg().catch) {
    game.catchUno(i);
    await handleEvents();
    render();
    await sleep(500);
  }

  let card = Bot.chooseCard(game, i);
  if (!card) {
    game.draw(i);
    await handleEvents();
    render();
    if (game.phase !== 'drawn') return;
    await sleep(450);
    card = game.drawnCard;
  }
  const ids = Bot.group(game, i, card);
  const cards = game.findCards(i, ids);
  const last = cards[cards.length - 1];
  const color = last.color ? undefined : Bot.chooseColor(game, i);
  const swapWith = last.value === '1' && game.rules.one ? Bot.chooseSwap(game, i, bot.hand.length - ids.length) : null;
  await flyToDiscard(() => elOfPlayer(i).getBoundingClientRect(), cards);
  game.play(i, ids, color, { swapWith });
  await afterBotPlay(i);
}

async function afterBotPlay(i, forgetUno = false) {
  render();
  await handleEvents();
  const bot = game.players[i];
  // Bots às vezes esquecem de gritar UNO (15%) — aí é com você: Pegou!
  // (No roteiro de uma lição, eles só esquecem quando a lição manda.)
  const calls = coaching() ? !forgetUno : Math.random() >= botCfg().forget;
  if (game.phase !== 'over' && bot.hand.length === 1 && !bot.saidUno && calls) {
    game.callUno(i);
    await handleEvents();
  }
  render();
}

// ---------------- fim de rodada ----------------
async function showRoundOver() {
  if (roundShown) return;
  roundShown = true;
  await sleep(600);
  if (coach) return coachRoundOver();
  if (isChaos()) return showChaosOver();
  const w = game.winner;
  const win = w === 0;
  win ? (sfx.win(), confetti()) : sfx.lose();

  $('#round-title').textContent = game.gameOver
    ? win ? '🏆 Você é o campeão!' : `🏆 ${nameOf(w)} é campeão!`
    : win ? 'Você venceu a rodada! 🎉' : `${nameOf(w)} venceu a rodada`;
  $('#round-points').textContent = `+${game.roundPoints} pontos`;

  const rows = game.players
    .map((p, i) => ({ name: i === 0 ? settings.name || 'Você' : `${p.avatar} ${p.name}`, score: game.scores[i], i }))
    .sort((a, b) => b.score - a.score);
  $('#scoreboard').innerHTML = rows
    .map(
      (r) => `<li class="${r.i === w ? 'win' : ''}"><span>${r.name}</span><span>${r.score}</span>
      <span class="bar"><i style="width:${Math.min(100, (r.score / game.target) * 100)}%"></i></span></li>`
    )
    .join('');
  $('#btn-next').textContent = game.gameOver ? 'Jogar de novo' : 'Próxima rodada';
  lockNextForGuest();
  $('#modal-round').classList.remove('hidden');
}

// Fim do caótico: placar de batidas.
function showChaosOver() {
  const ws = game.winners;
  const win = ws.includes(0);
  win ? (sfx.win(), confetti()) : sfx.lose();
  const names = ws.map((i) => (i === 0 ? 'você' : nameOf(i)));
  $('#round-title').textContent =
    ws.length > 1 ? `🌪 Empate! ${names.join(' e ')}` : win ? '🌪 Você venceu o Caótico!' : `🌪 ${nameOf(ws[0])} venceu o Caótico!`;
  const most = Math.max(...game.batidas);
  const tied = game.batidas.filter((b) => b === most).length > 1;
  $('#round-points').textContent =
    `${game.batidasTotal} batidas no total` + (tied && ws.length === 1 ? ' · desempate: menos cartas na mão' : '');
  const rows = game.players
    .map((p, i) => ({ name: i === 0 ? settings.name || 'Você' : `${p.avatar} ${p.name}`, b: game.batidas[i], cards: p.hand.length, i }))
    .sort((a, b) => b.b - a.b || a.cards - b.cards);
  $('#scoreboard').innerHTML = rows
    .map(
      (r) => `<li class="${ws.includes(r.i) ? 'win' : ''}"><span>${r.name}</span><span>🌪 ${r.b} · ${r.cards} carta${r.cards === 1 ? '' : 's'}</span>
      <span class="bar"><i style="width:${most ? (r.b / most) * 100 : 0}%"></i></span></li>`
    )
    .join('');
  $('#btn-next').textContent = 'Jogar de novo';
  lockNextForGuest();
  $('#modal-round').classList.remove('hidden');
}

$('#btn-next').addEventListener('click', () => {
  if (isGuest()) return; // online, quem começa a próxima é o anfitrião
  $('#modal-round').classList.add('hidden');
  if (game.gameOver) startGame();
  else startRound();
});

// ---------------- começar ----------------
// Os dois esperam o cadeado: se um bot estava no meio de uma animação,
// ele termina no jogo VELHO antes do novo começar.
async function startGame() {
  sessionId++;
  await withLock(() => {
    let players = [{ name: settings.name || 'Você', isBot: false }];
    for (let i = 0; i < settings.opponents; i++) players.push({ ...BOTS[i], isBot: true });
    if (isHost()) players = hostPlayers(); // online: quem está na sala
    game = new UnoGame(players, {
      rules: settings.rules,
      target: settings.target,
      mode: settings.mode,
      chaosTarget: settings.chaosTarget,
      level: settings.level,
    });
    coach = null;
    $('#table').classList.remove('lesson');
    $('#coach').classList.add('hidden');
    $('#start').classList.add('hidden');
    $('#table').classList.remove('hidden');
  });
  startRound();
}

async function startRound() {
  let session;
  await withLock(() => {
    sessionId++;
    session = sessionId;
    botsRunning = false;
    wakeBots = null;
    roundShown = false;
    highlightId = null;
    tray = [];
    game.startRound();
    game.takeEvents();
    $('#hand').classList.add('deal');
    render();
    if (isHost()) netSync([]);
  });
  setTimeout(() => $('#hand').classList.remove('deal'), 1000);
  toast(game.turn === 0 ? 'Você começa!' : `${game.current.name} começa`);
  await sleep(900);
  if (session === sessionId) runBots();
}

// ---------------- tela inicial ----------------
function setupSeg(id, key) {
  const seg = $(id);
  const val = (b) => (isNaN(b.dataset.v) ? b.dataset.v : Number(b.dataset.v));
  for (const b of seg.children) b.classList.toggle('on', val(b) === settings[key]);
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings[key] = val(b);
    for (const x of seg.children) x.classList.toggle('on', x === b);
    showModeFields();
  });
}
// Caótico troca "pontos pra vencer" por "batidas pra acabar".
function showModeFields() {
  $('#level-help').textContent = LEVEL_HELP[settings.level];
  const chaos = settings.mode === 'chaos';
  $('#field-target').classList.toggle('hidden', chaos);
  $('#field-chaos').classList.toggle('hidden', !chaos);
  $('#chaos-help').classList.toggle('hidden', !chaos);
}
setupSeg('#opt-mode', 'mode');
setupSeg('#opt-opponents', 'opponents');
setupSeg('#opt-target', 'target');
setupSeg('#opt-chaos', 'chaosTarget');
setupSeg('#opt-level', 'level');
showModeFields();
$('#opt-name').value = settings.name;
$('#btn-sound').textContent = settings.sound ? '🔊' : '🔇';

$('#opt-rules').innerHTML = RULE_INFO.map(
  (r) => `<label class="rule"><span>${r.title}</span><small>${r.desc}</small>
    <input type="checkbox" data-rule="${r.key}" ${settings.rules[r.key] ? 'checked' : ''} /><span class="switch"></span></label>`
).join('');
$('#opt-rules').addEventListener('change', (e) => {
  const key = e.target.dataset.rule;
  if (key) settings.rules[key] = e.target.checked;
  showHouseCount();
});
// O botão da tela inicial mostra quantas regras estão ligadas.
function showHouseCount() {
  const on = RULE_INFO.filter((r) => settings.rules[r.key]).length;
  $('#house-count').textContent = on ? `${on} ligada${on === 1 ? '' : 's'}` : 'clássico';
}
showHouseCount();
$('#btn-house').addEventListener('click', () => $('#modal-house').classList.remove('hidden'));
$('#modal-house [data-close]').addEventListener('click', () => {
  $('#modal-house').classList.add('hidden');
  saveSettings();
});

function showRules() {
  const active = game ? game.rules : settings.rules;
  $('#rules-house').innerHTML = RULE_INFO.map(
    (r) => `<li class="${active[r.key] ? '' : 'off'}"><b>${r.title}</b> ${active[r.key] ? '' : '(desligada)'} — ${r.desc}.</li>`
  ).join('');
  $('#modal-rules').classList.remove('hidden');
}

$('#btn-play').addEventListener('click', () => {
  settings.name = $('#opt-name').value.trim() || 'Você';
  saveSettings();
  startGame();
});
$('#btn-rules').addEventListener('click', showRules);
$('#btn-rules-game').addEventListener('click', showRules);
$('#modal-rules [data-close]').addEventListener('click', () => $('#modal-rules').classList.add('hidden'));

$('#btn-sound').addEventListener('click', () => {
  settings.sound = !settings.sound;
  $('#btn-sound').textContent = settings.sound ? '🔊' : '🔇';
  saveSettings();
});
$('#btn-quit').addEventListener('click', () => {
  if (!confirm(coach ? 'Sair da lição?' : net ? 'Sair da sala?' : 'Sair da partida?')) return;
  if (net) closeNet();
  sessionId++;
  if (closeModal) closeModal();
  const backTo = coach ? '#training' : '#start';
  withLock(() => {
    botsRunning = false;
    wakeBots = null;
    game = null;
    coach = null;
    tray = [];
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    $('#table').classList.add('hidden');
    $('#table').classList.remove('lesson');
    if (backTo === '#training') showTraining();
    else $('#start').classList.remove('hidden');
  });
});
