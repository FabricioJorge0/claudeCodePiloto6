// Banco da API com node:sqlite (embutido no Node, sem dependência externa).
// SQLite é INTERINO no servidor (ADR-011): a interface deste módulo é pequena para que
// a troca por PostgreSQL + PostGIS (ADR-005) não afete as regras de sincronização.

import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

import { HASH_INICIAL, hashEncadeado, verificarCadeia } from '../../public/js/dominio/integridade.js';

// Migrações numeradas. Nunca editar uma migração já publicada: criar a próxima.
export const MIGRACOES = [
  {
    versao: 1,
    sql: `
      CREATE TABLE entidades (
        tipo TEXT NOT NULL,
        id TEXT NOT NULL,
        versao INTEGER NOT NULL CHECK (versao >= 1),
        dados TEXT NOT NULL,
        criado_por TEXT NOT NULL,
        dispositivo_id TEXT NOT NULL,
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL,
        excluido_em TEXT,
        PRIMARY KEY (tipo, id)
      );

      CREATE TABLE operacoes_recebidas (
        op_id TEXT PRIMARY KEY,
        dispositivo_id TEXT NOT NULL,
        recebida_em TEXT NOT NULL,
        resultado TEXT NOT NULL
      );

      CREATE TABLE blocos_numeracao (
        tipo TEXT NOT NULL,
        inicio INTEGER NOT NULL,
        fim INTEGER NOT NULL,
        dispositivo_id TEXT NOT NULL,
        reservado_por TEXT NOT NULL,
        reservado_em TEXT NOT NULL,
        inutilizado_em TEXT,
        PRIMARY KEY (tipo, inicio),
        CHECK (inicio >= 1 AND fim >= inicio)
      );

      CREATE TABLE numeros_usados (
        tipo TEXT NOT NULL,
        numero INTEGER NOT NULL,
        documento_id TEXT NOT NULL UNIQUE,
        dispositivo_id TEXT NOT NULL,
        PRIMARY KEY (tipo, numero)
      );

      CREATE TABLE auditoria (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        em TEXT NOT NULL,
        ator TEXT NOT NULL,
        dispositivo_id TEXT,
        acao TEXT NOT NULL,
        entidade TEXT,
        entidade_id TEXT,
        dados TEXT NOT NULL,
        hash_anterior TEXT NOT NULL,
        hash TEXT NOT NULL
      );

      -- Trilha de auditoria somente inclusão; exclusão física proibida nas tabelas de fatos
      CREATE TRIGGER auditoria_sem_update BEFORE UPDATE ON auditoria
        BEGIN SELECT RAISE(ABORT, 'auditoria é somente inclusão'); END;
      CREATE TRIGGER auditoria_sem_delete BEFORE DELETE ON auditoria
        BEGIN SELECT RAISE(ABORT, 'auditoria é somente inclusão'); END;
      CREATE TRIGGER entidades_sem_delete BEFORE DELETE ON entidades
        BEGIN SELECT RAISE(ABORT, 'use exclusão lógica'); END;
      CREATE TRIGGER numeros_sem_delete BEFORE DELETE ON numeros_usados
        BEGIN SELECT RAISE(ABORT, 'número usado não pode ser liberado'); END;
      CREATE TRIGGER operacoes_sem_delete BEFORE DELETE ON operacoes_recebidas
        BEGIN SELECT RAISE(ABORT, 'registro de idempotência não pode ser apagado'); END;
    `
  }
];

export function sha256Texto(texto) {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

function versaoAtual(db) {
  db.exec('CREATE TABLE IF NOT EXISTS esquema (versao INTEGER NOT NULL)');
  const linha = db.prepare('SELECT versao FROM esquema').get();
  if (!linha) {
    db.prepare('INSERT INTO esquema (versao) VALUES (0)').run();
    return 0;
  }
  return linha.versao;
}

export function migrar(db, migracoes = MIGRACOES) {
  const atual = versaoAtual(db);
  const ultima = migracoes.at(-1)?.versao ?? 0;
  if (atual > ultima) {
    throw new Error(`Banco na versão ${atual}, mais nova que esta aplicação (${ultima}). Atualize a aplicação.`);
  }
  for (const { versao, sql } of migracoes) {
    if (versao <= atual) continue;
    transacao(db, () => {
      db.exec(sql);
      db.prepare('UPDATE esquema SET versao = ?').run(versao);
    });
  }
  return versaoAtual(db);
}

export function transacao(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

// caminho ':memory:' nos testes; arquivo em DB_PATH na execução
export function abrirBanco(caminho = ':memory:') {
  const db = new DatabaseSync(caminho);
  if (caminho !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrar(db);
  return db;
}

// ---------------------------------------------------------------- Auditoria encadeada

function registroAuditavel({ em, ator, dispositivoId, acao, entidade, entidadeId, dados }) {
  return {
    em, ator, dispositivoId: dispositivoId ?? null, acao, entidade: entidade ?? null, entidadeId: entidadeId ?? null, dados
  };
}

// Deve ser chamada dentro de uma transação (o hash depende do último registro)
export function registrarAuditoria(db, evento) {
  const registro = registroAuditavel(evento);
  const ultimo = db.prepare('SELECT hash FROM auditoria ORDER BY seq DESC LIMIT 1').get();
  const hashAnterior = ultimo?.hash ?? HASH_INICIAL;
  const hash = hashEncadeado(hashAnterior, registro, sha256Texto);
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO auditoria (em, ator, dispositivo_id, acao, entidade, entidade_id, dados, hash_anterior, hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    registro.em, registro.ator, registro.dispositivoId, registro.acao,
    registro.entidade, registro.entidadeId, JSON.stringify(registro.dados), hashAnterior, hash
  );
  return { seq: Number(lastInsertRowid), hash };
}

export function verificarAuditoria(db) {
  const linhas = db.prepare('SELECT * FROM auditoria ORDER BY seq').all();
  const itens = linhas.map((l) => ({
    registro: registroAuditavel({
      em: l.em, ator: l.ator, dispositivoId: l.dispositivo_id, acao: l.acao,
      entidade: l.entidade, entidadeId: l.entidade_id, dados: JSON.parse(l.dados)
    }),
    hashAnterior: l.hash_anterior,
    hash: l.hash
  }));
  const resultado = verificarCadeia(itens, sha256Texto);
  return {
    ...resultado,
    primeiraFalha: resultado.primeiraFalha === null ? null : linhas[resultado.primeiraFalha].seq
  };
}
