// Regras de negócio puras (sem DOM e sem localStorage).
// Rodam no navegador e também no Node, nos testes automatizados.

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

function dataIsoValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

function textoValido(valor, min, max) {
  return typeof valor === 'string' && valor.trim().length >= min && valor.trim().length <= max;
}

export function validarProjeto(dados) {
  const erros = [];
  if (!dados || typeof dados !== 'object') {
    return { valido: false, erros: ['Dados do projeto ausentes'] };
  }
  if (!textoValido(dados.nome, 3, 120)) erros.push('Nome deve ter entre 3 e 120 caracteres');
  if (!textoValido(dados.municipio, 2, 80)) erros.push('Município deve ter entre 2 e 80 caracteres');
  if (!textoValido(dados.responsavel, 2, 80)) erros.push('Responsável deve ter entre 2 e 80 caracteres');
  if (!statusValido(dados.status)) erros.push('Status inválido');
  if (!dataIsoValida(dados.prazo)) erros.push('Prazo deve ser uma data válida (AAAA-MM-DD)');
  if (typeof dados.orcamento !== 'number' || !Number.isFinite(dados.orcamento) || dados.orcamento < 0) {
    erros.push('Orçamento deve ser um número maior ou igual a zero');
  }
  if (!Number.isInteger(dados.progresso) || dados.progresso < 0 || dados.progresso > 100) {
    erros.push('Progresso deve ser um inteiro entre 0 e 100');
  }
  return { valido: erros.length === 0, erros };
}

// Campo vazio vira NaN (e falha na validação) em vez de virar 0
function paraNumero(valor) {
  if (valor === '' || valor === null || valor === undefined) return NaN;
  return Number(valor);
}

export function normalizarProjeto(dados) {
  return {
    nome: String(dados.nome ?? '').trim(),
    municipio: String(dados.municipio ?? '').trim(),
    responsavel: String(dados.responsavel ?? '').trim(),
    status: dados.status,
    prazo: dados.prazo,
    orcamento: paraNumero(dados.orcamento),
    progresso: paraNumero(dados.progresso)
  };
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

function vazio(valor) {
  return valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '');
}

function valorMonetario(valor, nome) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) {
    throw new RangeError(`${nome} inválido: ${valor}`);
  }
  return numero;
}

// Combina todos os filtros da tela. Filtro vazio é ignorado; valor inválido lança RangeError.
// Prazo: intervalo inclusivo (AAAA-MM-DD). Município e equipe: correspondência exata.
export function filtrarProjetos(projetos, filtros = {}) {
  const { status, prazoDe, prazoAte, municipio, responsavel, orcamentoMin, orcamentoMax } = filtros;
  let resultado = listarProjetos(projetos, { status });

  for (const [nome, valor] of [['Prazo inicial', prazoDe], ['Prazo final', prazoAte]]) {
    if (!vazio(valor) && !dataIsoValida(valor)) throw new RangeError(`${nome} inválido: ${valor}`);
  }
  if (!vazio(prazoDe)) resultado = resultado.filter((p) => p.prazo >= prazoDe);
  if (!vazio(prazoAte)) resultado = resultado.filter((p) => p.prazo <= prazoAte);

  if (!vazio(municipio)) resultado = resultado.filter((p) => p.municipio === municipio.trim());
  if (!vazio(responsavel)) resultado = resultado.filter((p) => p.responsavel === responsavel.trim());

  if (!vazio(orcamentoMin)) {
    const minimo = valorMonetario(orcamentoMin, 'Orçamento mínimo');
    resultado = resultado.filter((p) => p.orcamento >= minimo);
  }
  if (!vazio(orcamentoMax)) {
    const maximo = valorMonetario(orcamentoMax, 'Orçamento máximo');
    resultado = resultado.filter((p) => p.orcamento <= maximo);
  }
  return resultado;
}

// Valores distintos cadastrados, em ordem alfabética, para preencher os filtros
export function opcoesDeFiltro(projetos) {
  const ordenar = (valores) => [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return {
    municipios: ordenar(projetos.map((p) => p.municipio)),
    equipes: ordenar(projetos.map((p) => p.responsavel))
  };
}

export function buscarProjeto(projetos, id) {
  const numero = Number(id);
  if (!Number.isInteger(numero) || numero <= 0) {
    return null;
  }
  return projetos.find((p) => p.id === numero) ?? null;
}

export function proximoId(projetos) {
  return projetos.reduce((maior, p) => Math.max(maior, p.id), 0) + 1;
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
