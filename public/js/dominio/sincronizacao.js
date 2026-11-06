// Contrato da sincronização offline (seção 5 do plano), compartilhado entre o
// aparelho (outbox) e a API. Funções puras: sem rede, sem banco, sem DOM.

import { uuidValido } from './ids.js';
import { dataHoraValida } from './relogio.js';
import {
  validarDocumentoFiscalizacao, validarEvidencia, validarPessoa, validarVistoria
} from './fiscalizacao.js';

export const VERSAO_ESQUEMA = 1;
// A API aceita a versão atual e a anterior (N-1); hoje só existe a 1
export const VERSOES_ESQUEMA_ACEITAS = [1];
export const MAX_OPERACOES_LOTE = 50;

// Política por tipo de dado (seção 5.3): o que cada entidade aceita
export const POLITICAS = {
  vistoria: { tipos: ['criar', 'atualizar', 'excluir'], validar: validarVistoria },
  pessoa: { tipos: ['criar', 'atualizar'], validar: validarPessoa },
  evidencia: { tipos: ['criar'], validar: validarEvidencia },           // somente inclusão
  documento: { tipos: ['criar', 'cancelar'], validar: validarDocumentoFiscalizacao } // imutável
};

export const SITUACOES = ['aceita', 'rejeitada', 'conflito', 'adiada'];

// Ordem causal dentro do lote: quem é referenciado vai antes de quem referencia
const PRIORIDADE = { pessoa: 0, vistoria: 1, documento: 2, evidencia: 3 };

export function validarOperacao(op) {
  const erros = [];
  if (!op || typeof op !== 'object' || Array.isArray(op)) return { valida: false, erros: ['Operação ausente'] };
  if (!uuidValido(op.opId)) erros.push('opId deve ser um UUID');
  if (!uuidValido(op.entidadeId)) erros.push('entidadeId deve ser um UUID');
  if (!VERSOES_ESQUEMA_ACEITAS.includes(op.versaoEsquema)) erros.push(`Versão de esquema não suportada: ${op.versaoEsquema}`);
  if (!dataHoraValida(op.criadaEm)) erros.push('criadaEm deve ter data, hora e fuso');

  const politica = POLITICAS[op.entidade];
  if (!politica) {
    erros.push(`Entidade desconhecida: ${op.entidade}`);
    return { valida: false, erros };
  }
  if (!politica.tipos.includes(op.tipo)) {
    erros.push(`Operação "${op.tipo}" não permitida para ${op.entidade}`);
    return { valida: false, erros };
  }

  const payload = op.payload;
  if (op.tipo === 'criar') {
    erros.push(...politica.validar(payload).erros);
  } else if (op.tipo === 'atualizar') {
    if (!Number.isSafeInteger(op.versaoBase) || op.versaoBase < 1) erros.push('versaoBase é obrigatória ao atualizar');
    erros.push(...politica.validar(payload, { parcial: true }).erros);
  } else if (op.tipo === 'excluir' || op.tipo === 'cancelar') {
    if (!payload || typeof payload.motivo !== 'string' || payload.motivo.trim().length < 5) {
      erros.push('Motivo com pelo menos 5 caracteres é obrigatório');
    }
  }
  return { valida: erros.length === 0, erros };
}

export function validarLote(lote) {
  const erros = [];
  if (!lote || typeof lote !== 'object') return { valido: false, erros: ['Lote ausente'] };
  if (!dataHoraValida(lote.horaAparelho)) erros.push('horaAparelho deve ter data, hora e fuso');
  if (!Array.isArray(lote.operacoes) || lote.operacoes.length === 0) {
    erros.push('O lote deve ter ao menos uma operação');
  } else if (lote.operacoes.length > MAX_OPERACOES_LOTE) {
    erros.push(`O lote deve ter no máximo ${MAX_OPERACOES_LOTE} operações`);
  } else {
    const ids = lote.operacoes.map((o) => o?.opId);
    if (new Set(ids).size !== ids.length) erros.push('opId repetido no mesmo lote');
  }
  return { valido: erros.length === 0, erros };
}

// ---------------------------------------------------------------- Outbox (aparelho)

export function criarOperacao({ opId, entidade, entidadeId, tipo, payload, versaoBase, criadaEm }) {
  const op = { opId, entidade, entidadeId, tipo, versaoEsquema: VERSAO_ESQUEMA, criadaEm, payload };
  if (versaoBase !== undefined) op.versaoBase = versaoBase;
  return op;
}

// Escolhe o próximo lote: ordem de criação, com desempate pela ordem causal
export function selecionarLote(pendentes, maximo = MAX_OPERACOES_LOTE) {
  return [...pendentes]
    .sort((a, b) => (a.criadaEm < b.criadaEm ? -1 : a.criadaEm > b.criadaEm ? 1
      : (PRIORIDADE[a.entidade] ?? 9) - (PRIORIDADE[b.entidade] ?? 9)))
    .slice(0, maximo);
}

// Aplica a resposta da API à outbox. Só sai da outbox o que o servidor confirmou
// (aceita, inclusive duplicada) ou recusou de forma definitiva (vai para quarentena).
// "adiada" e operações sem resposta continuam pendentes para a próxima tentativa.
export function aplicarResultados(pendentes, resultados) {
  const porOp = new Map((resultados ?? []).map((r) => [r.opId, r]));
  const restantes = [];
  const confirmadas = [];
  const quarentena = [];
  for (const op of pendentes) {
    const r = porOp.get(op.opId);
    if (!r || r.situacao === 'adiada' || !SITUACOES.includes(r.situacao)) restantes.push(op);
    else if (r.situacao === 'aceita') confirmadas.push({ op, resultado: r });
    else quarentena.push({ op, resultado: r });
  }
  return { restantes, confirmadas, quarentena };
}
