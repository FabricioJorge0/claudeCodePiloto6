// Reserva e inutilização de blocos de numeração (seção 3.7 do plano e ADR-004).

import {
  TAMANHO_BLOCO_MAXIMO, TAMANHO_BLOCO_PADRAO, tipoDocumentoValido
} from '../../public/js/dominio/talonario.js';
import { registrarAuditoria, transacao } from './banco.js';

export class ErroTalonario extends Error {}

function paraBloco(linha) {
  return {
    tipo: linha.tipo,
    inicio: linha.inicio,
    fim: linha.fim,
    dispositivoId: linha.dispositivo_id,
    reservadoEm: linha.reservado_em,
    inutilizadoEm: linha.inutilizado_em
  };
}

export function reservarBloco(db, { tipo, tamanho = TAMANHO_BLOCO_PADRAO }, contexto, { agora = () => new Date().toISOString() } = {}) {
  if (!tipoDocumentoValido(tipo)) throw new ErroTalonario('Tipo de documento inválido');
  if (!Number.isSafeInteger(tamanho) || tamanho < 1 || tamanho > TAMANHO_BLOCO_MAXIMO) {
    throw new ErroTalonario(`Tamanho do bloco deve ser de 1 a ${TAMANHO_BLOCO_MAXIMO}`);
  }
  const em = agora();
  // BEGIN IMMEDIATE serializa as reservas: dois aparelhos nunca recebem a mesma faixa
  return transacao(db, () => {
    const { ultimo } = db.prepare('SELECT COALESCE(MAX(fim), 0) AS ultimo FROM blocos_numeracao WHERE tipo = ?').get(tipo);
    const inicio = ultimo + 1;
    const fim = ultimo + tamanho;
    db.prepare(`
      INSERT INTO blocos_numeracao (tipo, inicio, fim, dispositivo_id, reservado_por, reservado_em)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(tipo, inicio, fim, contexto.dispositivoId, contexto.ator, em);
    registrarAuditoria(db, {
      em, ator: contexto.ator, dispositivoId: contexto.dispositivoId,
      acao: 'talonario.reservar', entidade: 'bloco', entidadeId: `${tipo}:${inicio}`, dados: { tipo, inicio, fim }
    });
    return paraBloco(db.prepare('SELECT * FROM blocos_numeracao WHERE tipo = ? AND inicio = ?').get(tipo, inicio));
  });
}

export function listarBlocos(db, dispositivoId) {
  return db.prepare('SELECT * FROM blocos_numeracao WHERE dispositivo_id = ? ORDER BY tipo, inicio')
    .all(dispositivoId).map(paraBloco);
}

// Aparelho perdido ou trocado: números não usados ficam inutilizados para sempre
export function inutilizarBlocos(db, { dispositivoId, motivo }, contexto, { agora = () => new Date().toISOString() } = {}) {
  if (typeof motivo !== 'string' || motivo.trim().length < 5) throw new ErroTalonario('Motivo com pelo menos 5 caracteres é obrigatório');
  const em = agora();
  return transacao(db, () => {
    const { changes } = db.prepare(`
      UPDATE blocos_numeracao SET inutilizado_em = ? WHERE dispositivo_id = ? AND inutilizado_em IS NULL
    `).run(em, dispositivoId);
    registrarAuditoria(db, {
      em, ator: contexto.ator, dispositivoId: contexto.dispositivoId,
      acao: 'talonario.inutilizar', entidade: 'dispositivo', entidadeId: dispositivoId,
      dados: { motivo: motivo.trim(), blocos: Number(changes) }
    });
    return { blocosInutilizados: Number(changes) };
  });
}
