export function buildBirthdayMessage(rawText: string): string {
  const hasBirthdays = !rawText.includes(
    "Nenhum evento de aniversário encontrado",
  );
  if (!hasBirthdays) {
    return "Ohayo, master! (◕‿◕)  Hmm... parece que não temos aniversariantes hoje~ Mas tudo bem! Amanhã pode ter, ne? ✨  *pat pat* Ganbatte! (✿◠‿◠)";
  }
  const names = rawText
    .split("\n")
    .filter((item) => item.includes("ID"))
    .map((item) => item.replace(/ \(ID: [a-z0-9]*\)/gm, ""))
    .join("\n🎈 ");
  return `Ohayo, master! (◕‿◕)✨

Kyaa~! Hoje temos aniversariantes especiais! 🎂🎉

${names}

Sugoi ne~! Vamos celebrar todos eles! 🎊
Ganbatte enviando suas mensagens de parabéns, senpai! (✿◠‿◠)

*happy noises* ヾ(≧▽≦*)o`;
}
