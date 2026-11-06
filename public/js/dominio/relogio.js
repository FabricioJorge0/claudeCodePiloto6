// Divergência de data/hora entre o aparelho e o servidor (seção 6.4 do plano).
// Registros com desvio acima do limite são MARCADOS para a conferência, nunca corrigidos em silêncio.

export const LIMITE_DESVIO_PADRAO_MS = 5 * 60 * 1000;

const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

// Data e hora ISO 8601 com fuso explícito (Z ou ±hh:mm). Sem fuso, a hora é ambígua.
export function dataHoraValida(texto) {
  return typeof texto === 'string' && ISO_COM_FUSO.test(texto) && !Number.isNaN(Date.parse(texto));
}

// desvioMs > 0: o relógio do aparelho está atrasado em relação ao servidor
export function avaliarRelogio({ horaAparelho, horaServidor, limiteMs = LIMITE_DESVIO_PADRAO_MS }) {
  if (!dataHoraValida(horaAparelho) || !dataHoraValida(horaServidor)) {
    return { desvioMs: null, divergente: true, motivo: 'Hora do aparelho ausente ou inválida' };
  }
  const desvioMs = Date.parse(horaServidor) - Date.parse(horaAparelho);
  const divergente = Math.abs(desvioMs) > limiteMs;
  return {
    desvioMs,
    divergente,
    motivo: divergente ? `Relógio do aparelho difere ${Math.round(Math.abs(desvioMs) / 1000)} s do servidor` : null
  };
}
