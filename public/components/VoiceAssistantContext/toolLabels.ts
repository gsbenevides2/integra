/** What the chat shows while a tool runs. */
export const TOOL_ACTIVITY: Record<string, string> = {
  gerar_imagem: "Gerando imagem…",
  ver_camera: "Olhando a câmera…",
  listar_cameras: "Procurando câmeras…",
  listar_dispositivos: "Consultando a casa…",
  controlar_dispositivo: "Ajustando o dispositivo…",
  controlar_varios_dispositivos: "Ajustando os dispositivos…",
  listar_cenas: "Consultando as cenas…",
  aplicar_cena: "Aplicando a cena…",
  ler_sensores: "Lendo os sensores…",
  status_servidor: "Verificando o servidor…",
  status_plataformas: "Verificando as plataformas…",
  status_linhas_trem: "Consultando as linhas de trem…",
  status_roteador: "Verificando o roteador…",
  dispositivos_conectados: "Vendo quem está na rede…",
  agenda: "Consultando a agenda…",
  listar_rotinas: "Consultando as rotinas…",
  executar_rotina: "Executando a rotina…",
};

export function toolActivity(tool: string): string {
  return TOOL_ACTIVITY[tool] ?? "Trabalhando nisso…";
}
