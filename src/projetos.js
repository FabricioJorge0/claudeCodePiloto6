// Regras de negócio puras (sem I/O), fáceis de testar isoladamente.

export const STATUS_VALIDOS = ['planejamento', 'em_execucao', 'atrasado', 'concluido'];

export const ROTULOS_STATUS = {
  planejamento: 'Planejamento',
  em_execucao: 'Em execução',
  atrasado: 'Atrasado',
  concluido: 'Concluído'
};

export function statusValido(status) {
  return STATUS_VALIDOS.includes(status);
}

export function listarProjetos(projetos, { status } = {}) {
  if (status === undefined || status === null || status === '') {
    return [...projetos];
  }
  if (!statusValido(status)) {
    throw new RangeError(`Status inválido: ${status}`);
  }
  return projetos.filter((p) => p.status === status);
}

export function buscarProjeto(projetos, id) {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) {
    return null;
  }
  return projetos.find((p) => p.id === numero) ?? null;
}

export function resumoPorStatus(projetos) {
  const porStatus = Object.fromEntries(STATUS_VALIDOS.map((s) => [s, 0]));
  let orcamentoTotal = 0;
  for (const p of projetos) {
    if (p.status in porStatus) {
      porStatus[p.status] += 1;
    }
    orcamentoTotal += p.orcamento;
  }
  return { total: projetos.length, porStatus, orcamentoTotal };
}
