export function concatUrlAndResolveTrallingSlash(
  baseUrl: string,
  path: string,
): string {
  const url = new URL(path, baseUrl);
  return url.toString().replace(/\/$/, "");
}
