# Mal-mal! 😈

Um jogo de cartas no estilo "combine a cor ou o número" feito em **HTML, CSS e JavaScript**. Roda direto no navegador, sem instalar nada, e dá pra **jogar online com os amigos**.

*A "match the color or number" card game made with HTML, CSS and JavaScript. Runs right in your browser, and you can play online with friends.*

## 🎮 Jogar / Play

👉 **https://ielgomesjf-web.github.io/mal-mal/**

Ou baixe a pasta e abra o **`index.html`** no navegador. *Or download it and open `index.html`.*

## 🌐 Jogar online / Online

1. Um jogador aperta **Jogar online → Criar sala** e recebe um código de 4 letras.
2. Os amigos apertam **Jogar online**, digitam o código e **Entrar** (ou abrem o link da sala).
3. Quem criou a sala pode completar os lugares com bots e aperta **Começar**.

Até 4 jogadores. Se alguém sair no meio, um bot assume o lugar.
*Up to 4 players. If someone leaves mid-game, a bot takes their seat.*

## ✨ O que tem no jogo / Features

- **Carta especial Estaca Zero ❄**: quem está com 1 carta compra 6 e volta pro começo
- **Regras da casa** (liga/desliga cada uma): +2/+4 acumulam, 9 faz o anterior comprar, 0 gira as mãos, 1 troca de mão, empilhar cartas do mesmo número, cortar a vez
- **Modo Caótico 🌪**: zerou a mão? Compra 7 e continua. Ganha quem bater mais vezes
- **4 dificuldades**: Fácil, Médio, Difícil e **Mal-mal 😈** (os bots espiam sua mão!)
- **Modo treino 🎓**: 12 lições com a Coruja 🦉, do básico às manhas
- Bots que esquecem de gritar "UNO!" — e o botão **Pegou!** pra fazer eles comprarem 2

## 🧪 Testes / Tests

```
node teste.js
```

Simula milhares de partidas só com bots e confere as regras, as 12 lições do treino e o modo online.

---

Feito por **ielgomesjf-web**. Projeto de fã, sem ligação com nenhuma marca de jogo de cartas.
*Fan project, not affiliated with any card game brand.*
