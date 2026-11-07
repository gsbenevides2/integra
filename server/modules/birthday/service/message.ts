export function buildBirthdayMessage(titles: string[]): string {
  if (titles.length === 0) {
    return "Ohayo, master! (◕‿◕)  Hmm... parece que não temos aniversariantes hoje~ Mas tudo bem! Amanhã pode ter, ne? ✨  *pat pat* Ganbatte! (✿◠‿◠)";
  }
  const names = titles.join("\n🎈 ");
  return `Ohayo, master! (◕‿◕)✨

Kyaa~! Hoje temos aniversariantes especiais! 🎂🎉

${names}

Sugoi ne~! Vamos celebrar todos eles! 🎊
Ganbatte enviando suas mensagens de parabéns, senpai! (✿◠‿◠)

*happy noises* ヾ(≧▽≦*)o`;
}
