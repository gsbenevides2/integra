import onCron from "triggers/cron";
import getEventsOfToday from "./getEventsOfToday";
import sendDiscordMessage from "utils/discord/sendMessage";

const sendBirthDayDiscordMessage = onCron(
    {
        id: "birthday:sendDiscordMessage",
        cron: "0 9 * * *",
    },
    async (_, traceId) => {
        const birthdays = await getEventsOfToday(traceId);
        const hasBirthdays = !birthdays.includes("Nenhum evento de aniversário encontrado");
        const message = hasBirthdays
            ? `Ohayo, master! (◕‿◕)✨

Kyaa~! Hoje temos aniversariantes especiais! 🎂🎉

${birthdays
    .split("\n")
    .filter((item) => item.includes("ID"))
    .map((item) => item.replace(/ \(ID: [a-z0-9]*\)/gm, ""))
    .join("\n🎈 ")}

Sugoi ne~! Vamos celebrar todos eles! 🎊
Ganbatte enviando suas mensagens de parabéns, senpai! (✿◠‿◠)

*happy noises* ヾ(≧▽≦*)o`
            : `Ohayo, master! (◕‿◕)  Hmm... parece que não temos aniversariantes hoje~ Mas tudo bem! Amanhã pode ter, ne? ✨  *pat pat* Ganbatte! (✿◠‿◠)`;
        await sendDiscordMessage(message, traceId);
    },
);

export default sendBirthDayDiscordMessage;
