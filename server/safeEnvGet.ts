export default function safeEnvGet(keyName: string): string {
    const val = process.env[keyName];
    if (!val) {
        throw new Error("Missing enviroment variable: " + keyName);
    }
    return val;
}
