// =============================================================
//  treino-ui.js — o Modo treino na tela: o menu de lições,
//  a caixa do professor e quem executa o roteiro da lição.
//  (As lições em si estão em treino.js.)
// =============================================================

// ---------------- progresso salvo ----------------
const PROGRESS_KEY = 'uno-treino';
function loadProgress() {
  try {
    return new Set(JSON.parse(localStorage.getItem(PROGRESS_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify([...progress]));
  } catch {}
}
let progress = loadProgress();
let lastLesson = 0; // pra os botões da janela de fim de lição

// Lição abre quando a anterior foi completada.
const isUnlocked = (idx) => idx === 0 || progress.has(LESSONS[idx - 1].id);

// ---------------- menu do treino ----------------
function showTraining() {
  $('#start').classList.add('hidden');
  $('#table').classList.add('hidden');
  $('#training').classList.remove('hidden');
  let k = 0;
  $('#train-list').innerHTML = CHAPTERS.map(
    (ch, c) => `
    <div class="chapter">
      <h2><span class="ch-num">${c + 1}</span>${ch.title}</h2>
      <div class="lessons">${ch.lessons
        .map((l) => {
          const idx = k++;
          const done = progress.has(l.id);
          const open = isUnlocked(idx);
          return `<button class="lesson-btn ${done ? 'done' : ''}" data-idx="${idx}" ${open ? '' : 'disabled'}>
            <span class="l-num">${!open ? '🔒' : done ? '✓' : idx + 1}</span><span>${l.title}</span></button>`;
        })
        .join('')}</div>
    </div>`
  ).join('');
  $('#train-count').textContent = `${progress.size} de ${LESSONS.length} lições`;
}

$('#train-list').addEventListener('click', (e) => {
  const b = e.target.closest('.lesson-btn');
  if (b && !b.disabled) startLesson(Number(b.dataset.idx));
});
$('#btn-training').addEventListener('click', showTraining);
$('#btn-train-back').addEventListener('click', () => {
  $('#training').classList.add('hidden');
  $('#start').classList.remove('hidden');
});

// ---------------- a caixa do professor ----------------
function coachSay(text, withButton = false) {
  if (!coach) return;
  coach.text = text;
  $('#coach').classList.remove('hidden', 'oops');
  $('#coach-text').textContent = text;
  $('#coach-next').classList.toggle('hidden', !withButton);
}

// Errou: o professor avisa, e depois de um tempo volta pra instrução.
function coachOops(text) {
  const box = $('#coach');
  const step = coach.stepNo;
  $('#coach-text').textContent = text;
  box.classList.remove('oops');
  void box.offsetWidth; // reinicia a animação de tremer
  box.classList.add('oops');
  sfx.error();
  setTimeout(() => {
    if (coach && coach.stepNo === step && coach.text) {
      $('#coach-text').textContent = coach.text;
      box.classList.remove('oops');
    }
  }, 3800);
}

$('#coach-next').addEventListener('click', () => {
  if (coach && coach.next) {
    const go = coach.next;
    coach.next = null;
    $('#coach-next').classList.add('hidden');
    go();
  }
});

// ---------------- ganchos que o ui.js chama ----------------

// Essa jogada pode? (no roteiro, só a que a lição pede)
function coachGate(action) {
  if (!coaching()) return true;
  const st = coach.expect;
  const why = checkStep(st, action);
  if (!why) return true;
  if (!st) coachOops(coach.next ? 'Clique em Continuar ▸ primeiro.' : 'Espera um pouquinho… 🦉');
  else if (why === 'wrongColor') coachOops(st.wrongColor || 'Não foi essa cor que eu pedi!');
  else coachOops(st.wrong || defaultWrong(st));
  return false;
}

function defaultWrong(st) {
  switch (st.do) {
    case 'draw': return 'Clique no MONTE pra comprar uma carta!';
    case 'uno': return 'Aperte o botão UNO! primeiro 😉';
    case 'catch': return 'Aperte o PEGOU! antes que ela jogue de novo!';
    case 'pass': return 'Aperte Passar.';
    default: return st.point === false ? 'Hmm… pensa de novo! 🤔' : 'Não é essa! Procure a carta com a setinha 👇';
  }
}

// A jogada certa aconteceu: o roteiro anda.
function coachAfter(action) {
  if (!coaching() || !coach.expect || checkStep(coach.expect, action)) return;
  coach.expect = null;
  const go = coach.resolve;
  coach.resolve = null;
  if (go) go();
}

// O que brilhar na tela pra ajudar (cartas com setinha, monte, botões).
function coachHints() {
  const none = { ids: new Set(), targets: [] };
  if (!coaching() || !coach.expect || coach.expect.point === false || !game) return none;
  const st = coach.expect;
  const targets = { draw: ['#deck'], uno: ['#btn-uno'], catch: ['#btn-catch'], pass: ['#btn-pass'] }[st.do] || [];
  if (st.do !== 'play' && st.do !== 'cut') return { ids: new Set(), targets };
  const codes = st.cards || [].concat(st.card);
  const ids = new Set(game.players[0].hand.filter((c) => codes.includes(codeOf(c))).map((c) => c.id));
  return { ids, targets: st.cards ? ['#tray'] : [] };
}

// ---------------- rodar a lição ----------------
async function startLesson(idx) {
  const lesson = LESSONS[idx];
  lastLesson = idx;
  if (closeModal) closeModal();
  sessionId++;
  let session;
  await withLock(() => {
    sessionId++;
    session = sessionId;
    game = buildLessonGame(lesson);
    coach = { lesson, scripted: true, expect: null, resolve: null, next: null, text: '', stepNo: 0 };
    botsRunning = false;
    wakeBots = null;
    roundShown = false;
    highlightId = null;
    tray = [];
    document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
    $('#training').classList.add('hidden');
    $('#start').classList.add('hidden');
    $('#table').classList.remove('hidden');
    coachSay('');
    $('#hand').classList.add('deal');
    render();
    setTimeout(() => $('#hand').classList.remove('deal'), 1000);
  });

  const alive = () => coach && session === sessionId;
  await sleep(700);

  for (const st of lesson.steps) {
    if (!alive()) return;
    coach.stepNo++;

    if (st.free) {
      // Daqui pra frente é partida normal, com bots de verdade.
      coach.scripted = false;
      coachSay(st.say);
      render();
      runBots();
      return; // o fim da rodada chama coachRoundOver
    }

    if (st.bot !== undefined) {
      coachSay(st.say || '…');
      await sleep(st.say ? 1700 : 1000);
      if (!alive()) return;
      await scriptedBot(st);
      continue;
    }

    if (st.do) {
      // Espera VOCÊ fazer a jogada que a lição pede.
      coach.expect = st;
      coachSay(st.say || (st.do === 'play' ? 'Sua vez! 🤔' : '…'));
      render();
      await new Promise((r) => (coach.resolve = r));
      continue;
    }

    // Só fala: espera o "Continuar".
    coachSay(st.say, true);
    render();
    await new Promise((r) => (coach.next = r));
  }
}

// Bot faz exatamente o que o roteiro manda.
function scriptedBot(st) {
  return withLock(async () => {
    if (!game || !coach) return;
    const i = st.bot;
    if (st.draw) {
      game.draw(i);
      await handleEvents();
      render();
      if (game.phase === 'drawn') {
        await sleep(400);
        game.pass(i);
        await handleEvents();
      }
      render();
      return;
    }
    const ids = pickIds(game.players[i].hand, [].concat(st.play || st.cut));
    const cards = game.findCards(i, ids);
    await flyToDiscard(() => elOfPlayer(i).getBoundingClientRect(), cards);
    const extra = { swapWith: st.swapWith ?? null };
    if (st.cut) game.cut(i, ids, st.color, extra);
    else game.play(i, ids, st.color, extra);
    await afterBotPlay(i, st.forgetUno);
  });
}

// ---------------- fim da lição ----------------
function coachRoundOver() {
  const lesson = coach.lesson;
  const won = game.winner === 0;
  const lastOfChapter = lastLesson + 1 === LESSONS.length || LESSONS[lastLesson + 1].chapter !== lesson.chapter;
  if (won) {
    progress.add(lesson.id);
    saveProgress();
    sfx.win();
    confetti();
  } else sfx.lose();

  $('#lesson-title').textContent = !won
    ? `${nameOf(game.winner)} ganhou dessa vez…`
    : lastLesson + 1 === LESSONS.length ? 'Treino completo! 🏆'
    : lastOfChapter ? 'Capítulo completo! 🏅'
    : 'Lição completa! ⭐';
  $('#lesson-text').textContent = won ? lesson.done : 'Sem problema — treino é pra isso. Bora de novo?';
  $('#btn-lesson-next').classList.toggle('hidden', !won || lastLesson + 1 >= LESSONS.length);
  $('#btn-lesson-retry').classList.toggle('hidden', won);
  $('#modal-lesson').classList.remove('hidden');
  coachSay(won ? '🦉 Mandou bem!' : '🦉 Quase!');
}

$('#btn-lesson-next').addEventListener('click', () => startLesson(lastLesson + 1));
$('#btn-lesson-retry').addEventListener('click', () => startLesson(lastLesson));
$('#btn-lesson-menu').addEventListener('click', () => {
  sessionId++;
  withLock(() => {
    game = null;
    coach = null;
    $('#modal-lesson').classList.add('hidden');
    $('#table').classList.remove('lesson');
    showTraining();
  });
});
