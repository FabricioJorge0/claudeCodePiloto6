// Recebimento de lotes da outbox do aparelho (seção 5 do plano e ADR-003).
// Cada operação é aplicada em sua própria transação, junto com o registro de
// idempotência e a auditoria: ou tudo é gravado, ou nada é.

import { validarTransicao, ESTADOS_EDITAVEIS_EM_CAMPO } from '../../public/js/dominio/estados.js';
import { uuidValido } from '../../public/js/dominio/ids.js';
import { avaliarRelogio } from '../../public/js/dominio/relogio.js';
import { POLITICAS, validarLote, validarOperacao } from '../../public/js/dominio/sincronizacao.js';
import { registrarAuditoria, transacao } from './banco.js';

// Erro de regra de negócio que vira resultado da operação (não é falha do servidor)
class Recusa extends Error {
  constructor(situacao, motivo) {
    super(motivo);
    this.situacao = situacao;
  }
}

const rejeitar = (motivo) => new Recusa('rejeitada', motivo);
const conflito = (motivo) => new Recusa('conflito', motivo);
// Adiada: a dependência ainda não chegou; NÃO é gravada, o aparelho reenvia depois
const adiar = (motivo) => new Recusa('adiada', motivo);

function buscarEntidade(db, tipo, id) {
  const linha = db.prepare('SELECT * FROM entidades WHERE tipo = ? AND id = ?').get(tipo, id);
  if (!linha) return null;
  return { ...linha, dados: JSON.parse(linha.dados) };
}

function exigirReferencia(db, tipo, id, descricao) {
  const ref = buscarEntidade(db, tipo, id);
  if (!ref) throw adiar(`${descricao} ainda não recebida`);
  if (ref.excluido_em) throw rejeitar(`${descricao} foi excluída`);
  return ref;
}

function inserirEntidade(db, op, contexto, dados) {
  db.prepare(`
    INSERT INTO entidades (tipo, id, versao, dados, criado_por, dispositivo_id, criado_em, atualizado_em)
    VALUES (?, ?, 1, ?, ?, ?, ?, ?)
  `).run(op.entidade, op.entidadeId, JSON.stringify(dados), contexto.ator, contexto.dispositivoId, contexto.agora, contexto.agora);
  return 1;
}

function regravarEntidade(db, atual, dados, contexto, { excluidoEm = atual.excluido_em } = {}) {
  const versao = atual.versao + 1;
  db.prepare(`
    UPDATE entidades SET versao = ?, dados = ?, atualizado_em = ?, excluido_em = ?
    WHERE tipo = ? AND id = ? AND versao = ?
  `).run(versao, JSON.stringify(dados), contexto.agora, excluidoEm, atual.tipo, atual.id, atual.versao);
  return versao;
}

function exigirDono(atual, contexto) {
  if (atual.dispositivo_id !== contexto.dispositivoId || atual.criado_por !== contexto.ator) {
    throw conflito('Registro pertence a outro fiscal ou aparelho');
  }
}

function consumirNumero(db, op, contexto) {
  const { tipo, numero } = op.payload;
  const bloco = db.prepare(`
    SELECT * FROM blocos_numeracao WHERE tipo = ? AND dispositivo_id = ? AND ? BETWEEN inicio AND fim
  `).get(tipo, contexto.dispositivoId, numero);
  if (!bloco) throw rejeitar(`Número ${numero} não pertence a um bloco reservado para este aparelho`);
  if (bloco.inutilizado_em) throw rejeitar(`Número ${numero} pertence a um bloco inutilizado`);
  const usado = db.prepare('SELECT documento_id FROM numeros_usados WHERE tipo = ? AND numero = ?').get(tipo, numero);
  if (usado) throw conflito(`Número ${numero} já usado em outro documento`);
  db.prepare('INSERT INTO numeros_usados (tipo, numero, documento_id, dispositivo_id) VALUES (?, ?, ?, ?)')
    .run(tipo, numero, op.entidadeId, contexto.dispositivoId);
}

// Aplica uma operação já validada. Devolve a nova versão da entidade.
function aplicar(db, op, contexto) {
  const atual = buscarEntidade(db, op.entidade, op.entidadeId);

  switch (op.tipo) {
    case 'criar': {
      if (atual) throw conflito('Registro já existe com este identificador');
      if (op.entidade === 'vistoria' && op.payload.estado !== 'rascunho' && op.payload.estado !== 'concluida_campo') {
        throw rejeitar('Vistoria nova deve estar em rascunho ou concluída em campo');
      }
      if (op.entidade === 'evidencia') exigirReferencia(db, 'vistoria', op.payload.vistoriaId, 'Vistoria da evidência');
      if (op.entidade === 'documento') {
        exigirReferencia(db, 'vistoria', op.payload.vistoriaId, 'Vistoria do documento');
        exigirReferencia(db, 'pessoa', op.payload.pessoaId, 'Pessoa do documento');
        consumirNumero(db, op, contexto);
      }
      return inserirEntidade(db, op, contexto, op.payload);
    }

    case 'atualizar': {
      if (!atual) throw adiar('Registro ainda não recebido');
      if (atual.excluido_em) throw conflito('Registro foi excluído');
      if (atual.versao !== op.versaoBase) {
        throw conflito(`Versão desatualizada: o aparelho editou a versão ${op.versaoBase}, o servidor está na ${atual.versao}`);
      }
      if (op.entidade === 'vistoria') {
        exigirDono(atual, contexto);
        const de = atual.dados.estado;
        const para = op.payload.estado ?? de;
        if (!ESTADOS_EDITAVEIS_EM_CAMPO.includes(de)) throw conflito(`Vistoria em "${de}" não pode ser editada pelo aparelho`);
        const transicao = validarTransicao(de, para, contexto.perfil);
        if (!transicao.valida) throw conflito(transicao.motivo);
      }
      return regravarEntidade(db, atual, { ...atual.dados, ...op.payload }, contexto);
    }

    case 'excluir': {
      if (!atual) throw adiar('Registro ainda não recebido');
      if (atual.excluido_em) throw conflito('Registro já excluído');
      exigirDono(atual, contexto);
      if (atual.dados.estado !== 'rascunho') throw conflito('Só vistorias em rascunho podem ser excluídas; use o cancelamento');
      const dados = { ...atual.dados, exclusao: { motivo: op.payload.motivo.trim(), por: contexto.ator } };
      return regravarEntidade(db, atual, dados, contexto, { excluidoEm: contexto.agora });
    }

    case 'cancelar': {
      if (!atual) throw adiar('Documento ainda não recebido');
      if (atual.dados.cancelamento) throw conflito('Documento já cancelado');
      // O documento continua imutável: o cancelamento é acrescentado, o número não é liberado
      const dados = {
        ...atual.dados,
        cancelamento: { motivo: op.payload.motivo.trim(), por: contexto.ator, em: contexto.agora }
      };
      return regravarEntidade(db, atual, dados, contexto);
    }

    default:
      throw rejeitar(`Operação desconhecida: ${op.tipo}`);
  }
}

function resultadoGravado(db, opId) {
  const linha = db.prepare('SELECT dispositivo_id, resultado FROM operacoes_recebidas WHERE op_id = ?').get(opId);
  return linha ? { dispositivoId: linha.dispositivo_id, resultado: JSON.parse(linha.resultado) } : null;
}

function gravarResultado(db, op, contexto, resultado) {
  db.prepare('INSERT INTO operacoes_recebidas (op_id, dispositivo_id, recebida_em, resultado) VALUES (?, ?, ?, ?)')
    .run(op.opId, contexto.dispositivoId, contexto.agora, JSON.stringify(resultado));
}

function processarOperacao(db, op, contexto) {
  const anterior = resultadoGravado(db, op?.opId);
  if (anterior) {
    if (anterior.dispositivoId !== contexto.dispositivoId) {
      return { opId: op.opId, situacao: 'rejeitada', motivo: 'opId já usado por outro aparelho' };
    }
    return { ...anterior.resultado, duplicada: true };
  }

  const { valida, erros } = validarOperacao(op);
  if (!valida) {
    const resultado = { opId: op?.opId ?? null, situacao: 'rejeitada', motivo: erros.join('; ') };
    // Operação sem opId válido não pode ser registrada para idempotência
    if (uuidValido(op?.opId)) {
      transacao(db, () => gravarResultado(db, op, contexto, resultado));
    }
    return resultado;
  }

  try {
    return transacao(db, () => {
      const versao = aplicar(db, op, contexto);
      const resultado = { opId: op.opId, situacao: 'aceita', versao };
      const { seq } = registrarAuditoria(db, {
        em: contexto.agora,
        ator: contexto.ator,
        dispositivoId: contexto.dispositivoId,
        acao: `${op.entidade}.${op.tipo}`,
        entidade: op.entidade,
        entidadeId: op.entidadeId,
        dados: {
          opId: op.opId, versao, payload: op.payload, criadaEm: op.criadaEm,
          relogio: contexto.relogio, perfil: contexto.perfil
        }
      });
      gravarResultado(db, op, contexto, { ...resultado, seq });
      return { ...resultado, seq };
    });
  } catch (erro) {
    if (!(erro instanceof Recusa)) throw erro;
    const resultado = { opId: op.opId, situacao: erro.situacao, motivo: erro.message };
    if (erro.situacao !== 'adiada') {
      transacao(db, () => {
        registrarAuditoria(db, {
          em: contexto.agora, ator: contexto.ator, dispositivoId: contexto.dispositivoId,
          acao: `${op.entidade}.${op.tipo}.recusada`, entidade: op.entidade, entidadeId: op.entidadeId,
          dados: { opId: op.opId, situacao: erro.situacao, motivo: erro.message }
        });
        gravarResultado(db, op, contexto, resultado);
      });
    }
    return resultado;
  }
}

// contexto: { ator, perfil, dispositivoId }; relogio injetável para os testes
export function processarLote(db, lote, contexto, { agora = () => new Date().toISOString() } = {}) {
  const { valido, erros } = validarLote(lote);
  if (!valido) return { ok: false, erros };

  const recebidoEm = agora();
  const relogio = avaliarRelogio({ horaAparelho: lote.horaAparelho, horaServidor: recebidoEm });
  const ctx = { ...contexto, agora: recebidoEm, relogio };
  const resultados = lote.operacoes.map((op) => processarOperacao(db, op, ctx));
  return { ok: true, recebidoEm, relogio, resultados };
}

// Alterações desde um cursor (seq da auditoria). O fiscal só recebe o que ele criou;
// conferente, gestor e auditor recebem tudo. Permissões finas: ADR-008.
export function listarAlteracoes(db, { desde = 0, limite = 200 }, contexto) {
  const veTudo = ['conferente', 'gestor', 'auditor'].includes(contexto.perfil);
  const eventos = db.prepare(`
    SELECT a.seq, a.entidade, a.entidade_id FROM auditoria a
    JOIN entidades e ON e.tipo = a.entidade AND e.id = a.entidade_id
    WHERE a.seq > ? AND a.acao NOT LIKE '%.recusada' AND (? OR e.criado_por = ?)
    ORDER BY a.seq LIMIT ?
  `).all(desde, veTudo ? 1 : 0, contexto.ator, limite + 1);

  const temMais = eventos.length > limite;
  const pagina = eventos.slice(0, limite);
  const vistos = new Map();
  for (const { seq, entidade, entidade_id: id } of pagina) vistos.set(`${entidade}:${id}`, { seq, entidade, id });

  const alteracoes = [...vistos.values()].map(({ seq, entidade, id }) => {
    const e = buscarEntidade(db, entidade, id);
    return { seq, entidade, id, versao: e.versao, dados: e.dados, excluidoEm: e.excluido_em, atualizadoEm: e.atualizado_em };
  });
  return { alteracoes, cursor: pagina.at(-1)?.seq ?? desde, temMais };
}

export { POLITICAS };
