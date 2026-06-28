export function generateMessage(
    body: string,
    event_user_email: string,
    event_user_username: string,
) {
    const jsonPayload = JSON.parse(
        body
            .replace("login_failed: ", "")
            .replaceAll("'", '"')
            .replaceAll("None", "null")
            .replaceAll("True", "true")
            .replaceAll("False", "false"),
    );

    let message =
        "✨ Oi Gui! Aqui é a Bene-Chan (⋈◍＞◡＜◍)。vim te avisar que uma tentativa de acesso ao SSO foi feita por alguém não autorizado.";
    message += `\n\n🧾 Detalhes da sessão:`;

    message += "\n- 🔐 Tipo de Login: ";
    if (jsonPayload?.stage?.model_name === "passwordstage") {
        message += "Usuário e Senha inválidos";
    } else if (jsonPayload?.stage?.model_name === "authenticatorvalidatestage") {
        message += "Código de autenticação TOTP inválido";
    } else if (jsonPayload?.source?.includes("Google")) {
        message += "Login social com Google";
    } else if (jsonPayload?.source?.includes("Discord")) {
        message += "Login social com Discord";
    } else {
        message += "Desconhecido";
    }

    const ip = jsonPayload?.asn?.network?.split("/")?.at(0) ?? "Desconhecido";
    message += `\n-📍 IP: ${ip}`;

    const email = jsonPayload?.oauth_userinfo?.email ?? event_user_email ?? "Desconhecido";
    message += `\n- ✉️ Email: ${email}`;

    const username =
        jsonPayload?.oauth_userinfo?.username ??
        jsonPayload?.username ??
        event_user_username ??
        "Desconhecido";
    message += `\n- 👤 Username: ${username}`;

    const name = jsonPayload?.oauth_userinfo?.name ?? "Desconhecido";
    message += `\n- 🏷️ Nome: ${name}`;

    const city = jsonPayload?.geo?.city ?? "Desconhecido";
    message += `\n- 🏙️ Cidade: ${city}`;

    const country = jsonPayload?.geo?.country ?? "Desconhecido";
    message += `\n- 🌍 País: ${country}`;

    const lat = jsonPayload?.geo?.lat ?? "Desconhecido";
    const long = jsonPayload?.geo?.long ?? "Desconhecido";
    message += `\n- 📍 Latitude: ${lat} | Longitude: ${long}`;

    const asn = jsonPayload?.asn?.asn ?? "Desconhecido";
    message += `\n- 📡 ASN: ${asn}`;

    const asn_name = jsonPayload?.asn?.as_org ?? "Desconhecido";
    message += `\n- 📡 ASN Name: ${asn_name}`;

    const userAgent = jsonPayload?.http_request?.user_agent ?? "Desconhecido";
    message += `\n- 💻 User Agent: ${userAgent}`;

    message += `\n\n⚠️ Recomendo checar a conta e revisar as configurações de segurança do SSO, tá? Ganbatte! ~`;

    return message;
}
