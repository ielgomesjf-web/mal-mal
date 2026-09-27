// =============================================================
//  rede.js — MULTIPLAYER entre aparelhos.
//
//  Um aparelho é o ANFITRIÃO: ele roda o jogo de verdade (o motor
//  e os bots) e é o juiz. Os outros são CONVIDADOS: mandam "quero
//  jogar tal carta" e recebem de volta o que aparece na tela deles
//  (o que cada um vê é montado em sala.js).
//
//  A conexão é direta entre os aparelhos (WebRTC, pela biblioteca
//  PeerJS). O servidor gratuito do PeerJS só serve pra um achar o
//  outro pelo código da sala — as jogadas não passam por ele.
// =============================================================

const PEER_PREFIX = 'uno-malmal-sala-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O e 1/I, que confundem
const HUMAN_AVATARS = ['😎', '🤠', '🥳', '🤓'];

let net = null; // { role: 'host' | 'guest', peer, code, ... }
const isHost = () => !!net && net.role === 'host';
const isGuest = () => !!net && net.role === 'guest';

// ---------------- telas ----------------
function showOnline() {
  for (const id of ['#start', '#table', '#training']) $(id).classList.add('hidden');
  $('#online').classList.remove('hidden');
  $('#online-home').classList.toggle('hidden', !!net);
  $('#online-lobby').classList.toggle('hidden', !net);
}

function onlineStatus(text, bad = false) {
  $('#online-status').textContent = text;
  $('#online-status').classList.toggle('bad', bad);
}

$('#btn-online').addEventListener('click', () => {
  onlineStatus('');
  showOnline();
});
// Nome também dá pra mudar aqui (quem chega pelo link da sala nem passa pela tela inicial).
$('#online-name').value = settings.name === 'Você' ? '' : settings.name;
$('#online-name').addEventListener('input', () => {
  settings.name = $('#online-name').value.trim() || 'Você';
  $('#opt-name').value = settings.name;
  saveSettings();
});
$('#btn-online-back').addEventListener('click', () => {
  if (net && !confirm('Sair da sala?')) return;
  closeNet();
  $('#online').classList.add('hidden');
  $('#start').classList.remove('hidden');
});

// A biblioteca de rede só é baixada quando alguém vai jogar online.
function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
    s.onload = ok;
    s.onerror = () => fail(new Error('Não consegui carregar a parte online. Tem internet?'));
    document.head.append(s);
  });
}

function openPeer(id) {
  return new Promise((ok, fail) => {
    const peer = id ? new Peer(id) : new Peer();
    peer.on('open', () => ok(peer));
    peer.on('error', (e) => fail(e));
  });
}

const myName = () => {
  const n = (settings.name || '').trim();
  return !n || n === 'Você' ? 'Jogador' : n;
};

// ================================================================
//  ANFITRIÃO
// ================================================================
$('#btn-create').addEventListener('click', createRoom);

async function createRoom() {
  onlineStatus('Criando a sala…');
  try {
    await loadPeerJS();
    let peer = null;
    let code = '';
    for (let tries = 0; !peer && tries < 6; tries++) {
      code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      try {
        peer = await openPeer(PEER_PREFIX + code);
      } catch (e) {
        if (e.type !== 'unavailable-id') throw e; // código já em uso: tenta outro
      }
    }
    if (!peer) throw new Error('Não consegui criar a sala. Tenta de novo?');
    net = { role: 'host', peer, code, started: false, seats: [{ kind: 'host', name: myName(), avatar: HUMAN_AVATARS[0] }] };
    peer.on('connection', hostAccept);
    peer.on('disconnected', () => peer.reconnect()); // caiu só o "apresentador": as conexões seguem
    peer.on('error', (e) => console.warn('rede:', e.type));
    onlineStatus('');
    showOnline();
    renderLobby();
  } catch (e) {
    onlineStatus(e.message || 'Algo deu errado na rede.', true);
  }
}

function hostAccept(conn) {
  conn.on('data', (msg) => hostReceive(conn, msg));
  conn.on('close', () => hostLost(conn));
  conn.on('error', () => hostLost(conn));
}

function hostReceive(conn, msg) {
  if (!isHost() || !msg) return;
  if (msg.t === 'hello') {
    const refuse = net.started ? 'O jogo já começou 😕' : net.seats.length >= 4 ? 'A sala está cheia (4 jogadores).' : null;
    if (refuse) {
      conn.send({ t: 'refuse', msg: refuse });
      setTimeout(() => conn.close(), 500);
      return;
    }
    let name = String(msg.name || 'Jogador').slice(0, 14);
    const taken = (n) => net.seats.some((s) => s.name === n);
    for (let k = 2; taken(name); k++) name = `${String(msg.name).slice(0, 11)} ${k}`;
    const used = net.seats.map((s) => s.avatar);
    net.seats.push({ kind: 'human', name, avatar: HUMAN_AVATARS.find((a) => !used.includes(a)) || '🙂', conn });
    renderLobby();
    toast(`${name} entrou na sala!`);
    return;
  }
  if (msg.t === 'act') {
    const idx = net.seats.findIndex((s) => s.conn === conn);
    if (idx > 0) hostAct(idx, msg.a || {});
  }
}

// Alguém saiu: na sala de espera, libera o lugar; no meio do jogo, um bot assume.
function hostLost(conn) {
  if (!isHost() || conn._gone) return;
  conn._gone = true;
  const idx = net.seats.findIndex((s) => s.conn === conn);
  if (idx < 0) return;
  const seat = net.seats[idx];
  if (!net.started) {
    net.seats.splice(idx, 1);
    renderLobby();
    return;
  }
  seat.kind = 'bot';
  seat.conn = null;
  withLock(async () => {
    if (!game || !game.players[idx]) return;
    const p = game.players[idx];
    p.isBot = true;
    p.name = `${p.name} 🤖`;
    toast(`${seat.name} saiu — um bot assumiu o lugar`);
    netSync([]);
    render();
  }).then(afterAction);
}

// Monta a sala de espera (anfitrião) e conta pra todo mundo quem está nela.
function renderLobby(seats = net.seats, you = 0) {
  const host = isHost();
  $('#room-code').textContent = net.code || '';
  $('#btn-copy-link').classList.toggle('hidden', !host);
  $('#host-controls').classList.toggle('hidden', !host);
  $('#guest-wait').classList.toggle('hidden', host);
  const rows = seats.map((s, i) => {
    const tag = s.kind === 'host' ? 'anfitrião' : s.kind === 'bot' ? 'bot' : 'online';
    const me = i === you ? ' (você)' : '';
    const kick = host && i > 0 ? `<button data-kick="${i}" title="Tirar">✕</button>` : '';
    return `<li><span>${s.avatar}</span><span>${escapeHTML(s.name)}${me}</span><span class="tag">${tag}</span>${kick}</li>`;
  });
  for (let i = seats.length; i < 4; i++) rows.push('<li class="empty">— lugar vazio —</li>');
  $('#seat-list').innerHTML = rows.join('');
  if (host) {
    $('#btn-add-bot').disabled = seats.length >= 4;
    $('#btn-online-start').disabled = seats.length < 2;
    $('#lobby-summary').textContent = summary();
    net.seats.forEach((s, i) => {
      if (s.conn) s.conn.send({ t: 'lobby', seats: net.seats.map(({ kind, name, avatar }) => ({ kind, name, avatar })), you: i, summary: summary() });
    });
  }
}

function summary() {
  const on = RULE_INFO.filter((r) => settings.rules[r.key]).length;
  const modo = settings.mode === 'chaos' ? `Caótico (${settings.chaosTarget} batidas)` : `Normal (até ${settings.target})`;
  return `${modo} · bots: ${BOT_LEVELS[settings.level].name} · ${on} regra${on === 1 ? '' : 's'} da casa`;
}

const escapeHTML = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

$('#seat-list').addEventListener('click', (e) => {
  const b = e.target.closest('[data-kick]');
  if (!b || !isHost() || net.started) return;
  const seat = net.seats[Number(b.dataset.kick)];
  if (seat.conn) {
    seat.conn._gone = true;
    seat.conn.send({ t: 'refuse', msg: 'O anfitrião tirou você da sala.' });
    setTimeout(() => seat.conn.close(), 300);
  }
  net.seats.splice(Number(b.dataset.kick), 1);
  renderLobby();
});

$('#btn-add-bot').addEventListener('click', () => {
  if (!isHost() || net.seats.length >= 4) return;
  const bot = BOTS.find((b) => !net.seats.some((s) => s.name === b.name));
  net.seats.push({ kind: 'bot', name: bot.name, avatar: bot.avatar });
  renderLobby();
});

$('#btn-copy-link').addEventListener('click', async () => {
  const link = `${location.origin}${location.pathname}?sala=${net.code}`;
  try {
    await navigator.clipboard.writeText(link);
    onlineStatus('Link copiado! Manda pros seus amigos 📨');
  } catch {
    onlineStatus(link);
  }
});

$('#btn-online-start').addEventListener('click', () => {
  if (!isHost() || net.seats.length < 2) return;
  net.started = true;
  $('#online').classList.add('hidden');
  startGame();
});

// Os jogadores do jogo, na ordem das cadeiras (o anfitrião é sempre o 0).
function hostPlayers() {
  return net.seats.map((s) => ({ name: s.name, avatar: s.avatar, isBot: s.kind === 'bot' }));
}

// Manda pra cada convidado a mesa vista do lugar dele + o que acabou de acontecer.
function netSync(events) {
  if (!isHost() || !game) return;
  net.seats.forEach((s, i) => {
    if (!s.conn || !s.conn.open) return;
    try {
      s.conn.send({ t: 'state', view: viewFor(game, i), events: eventsFor(game, i, events) });
    } catch (e) {
      console.warn('rede: não consegui mandar', e);
    }
  });
}

// Um convidado fez uma jogada: o anfitrião confere e aplica no jogo de verdade.
function hostAct(idx, a) {
  withLock(async () => {
    if (!game || game.phase === 'over' || !game.players[idx] || game.players[idx].isBot) return;
    const n = game.players.length;
    let did = false;
    if (a.type === 'play') {
      const ids = Array.isArray(a.ids) ? a.ids : [];
      const ok = a.cutting ? game.canCutGroup(idx, ids) : game.canPlayGroup(idx, ids);
      const cards = ok ? game.findCards(idx, ids) : [];
      const last = cards[cards.length - 1];
      const color = last && isWild(last) ? (COLORS.includes(a.color) ? a.color : null) : undefined;
      if (ok && color !== null) {
        const swapWith = Number.isInteger(a.swapWith) ? realIndex(n, idx, a.swapWith) : null;
        await flyToDiscard(() => elOfPlayer(idx).getBoundingClientRect(), cards);
        if (a.cutting) game.cut(idx, ids, color, { swapWith });
        else game.play(idx, ids, color, { swapWith });
        did = true;
      }
    } else if (a.type === 'draw' && game.turn === idx && game.phase === 'play') {
      game.draw(idx);
      did = true;
    } else if (a.type === 'pass' && game.turn === idx && game.phase === 'drawn') {
      game.pass(idx);
      did = true;
    } else if (a.type === 'uno') {
      did = game.callUno(idx);
    } else if (a.type === 'catch' && game.unoWindow !== null && game.unoWindow !== idx) {
      did = game.catchUno(idx);
    }
    render();
    if (did) await handleEvents();
    else netSync([]); // jogada recusada: devolve a mesa certa pra ele
    render();
  }).then(afterAction);
}

// ================================================================
//  CONVIDADO
// ================================================================
$('#btn-join').addEventListener('click', () => joinRoom($('#join-code').value));
$('#join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom($('#join-code').value);
});

async function joinRoom(raw) {
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 4) return onlineStatus('O código tem 4 letras/números.', true);
  onlineStatus('Procurando a sala…');
  try {
    await loadPeerJS();
    const peer = await openPeer(null);
    const conn = peer.connect(PEER_PREFIX + code, { reliable: true });
    net = { role: 'guest', peer, conn, code, you: 0 };
    const timer = setTimeout(() => {
      if (isGuest() && !conn.open) failJoin('Não achei essa sala. Confere o código?');
    }, 12000);
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') failJoin('Não achei essa sala. Confere o código?');
    });
    conn.on('open', () => {
      clearTimeout(timer);
      conn.send({ t: 'hello', name: myName() });
      onlineStatus('Entrou! 🎉');
    });
    conn.on('data', guestReceive);
    conn.on('close', () => guestLost('A conexão com o anfitrião caiu.'));
  } catch (e) {
    failJoin(e.message || 'Algo deu errado na rede.');
  }
}

function failJoin(text) {
  closeNet();
  showOnline();
  onlineStatus(text, true);
}

function guestReceive(msg) {
  if (!isGuest() || !msg) return;
  if (msg.t === 'lobby') {
    net.you = msg.you;
    showOnline();
    renderLobby(msg.seats, msg.you);
    $('#lobby-summary').textContent = msg.summary;
  } else if (msg.t === 'refuse') {
    net.conn._gone = true;
    failJoin(msg.msg);
  } else if (msg.t === 'bye') {
    guestLost('O anfitrião fechou a sala.');
  } else if (msg.t === 'state') {
    guestState(msg.view, msg.events || []);
  }
}

function guestLost(text) {
  if (!isGuest() || net.conn._gone) return;
  net.conn._gone = true;
  closeNet();
  sessionId++;
  game = null;
  document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
  showOnline();
  onlineStatus(text, true);
}

// Chegou a mesa nova do anfitrião.
function guestState(view, events) {
  withLock(async () => {
    if (!isGuest()) return;
    const fresh = !game || !game.remote;
    const newRound = fresh || view.round !== game.round;
    // Primeiro as cartas dos outros voam pra mesa; depois a mesa muda.
    if (!fresh) {
      for (const ev of events) {
        if (ev.type === 'play' && ev.player !== 0) {
          const seatEl = elOfPlayer(ev.player);
          if (seatEl) await flyToDiscard(() => seatEl.getBoundingClientRect(), ev.cards);
        }
      }
    }
    if (fresh) {
      sessionId++;
      coach = null;
      game = makeRemoteGame(view, (a) => net.conn.open && net.conn.send({ t: 'act', a }));
      $('#online').classList.add('hidden');
      $('#start').classList.add('hidden');
      $('#table').classList.remove('hidden', 'lesson');
      $('#coach').classList.add('hidden');
    } else {
      applyView(game, view);
    }
    if (newRound) {
      tray = [];
      roundShown = false;
      $('#modal-round').classList.add('hidden');
      $('#hand').classList.add('deal');
      setTimeout(() => $('#hand').classList.remove('deal'), 1000);
    }
    // Rodada rolando (inclusive um jogo novo que também começa na rodada 1): tira o placar da tela.
    if (game.phase !== 'over') {
      roundShown = false;
      $('#modal-round').classList.add('hidden');
    }
    highlightId = view.drawnId;
    game.events.push(...events);
    render();
    await handleEvents();
    render();
  }).then(() => {
    if (game && game.remote && game.phase === 'over') showRoundOver();
  });
}

// Convidado espera o anfitrião começar a próxima rodada.
function lockNextForGuest() {
  const b = $('#btn-next');
  b.disabled = isGuest();
  if (isGuest()) b.textContent = 'Esperando o anfitrião… ⏳';
}

// ================================================================
//  sair
// ================================================================
function closeNet() {
  if (!net) return;
  const old = net;
  net = null;
  try {
    if (old.role === 'host') {
      for (const s of old.seats) {
        if (s.conn && s.conn.open) {
          s.conn._gone = true;
          s.conn.send({ t: 'bye' });
        }
      }
    } else if (old.conn) old.conn._gone = true;
    setTimeout(() => old.peer.destroy(), 300);
  } catch {}
}

// Link com ?sala=CODIGO: já abre a tela de entrar com o código preenchido.
{
  const code = new URLSearchParams(location.search).get('sala');
  if (code) {
    $('#join-code').value = code.toUpperCase().slice(0, 4);
    showOnline();
    onlineStatus('Escreve seu nome e aperta Entrar!');
  }
}
