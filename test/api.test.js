import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { apiDoAmbiente, criarServidor } from '../src/server.js';
import { abrirBanco, migrar, registrarAuditoria, transacao, verificarAuditoria } from '../src/api/banco.js';
import { criarApi, criarAutenticador, LIMITE_CORPO_BYTES } from '../src/api/rotas.js';
import { uuidv7 } from '../public/js/dominio/ids.js';
import { criarOperacao } from '../public/js/dominio/sincronizacao.js';

// Dados FICTÍCIOS. Tokens só para teste.
const TOKENS = {
  fiscalA: 'token-fiscal-a-0000000001',
  fiscalB: 'token-fiscal-b-0000000002',
  conferente: 'token-conferente-000000003',
  auditor: 'token-auditor-00000000004',
  admin: 'token-admin-0000000000005'
};
const CREDENCIAIS = {
  [TOKENS.fiscalA]: { ator: 'fiscal.a', perfil: 'fiscal' },
  [TOKENS.fiscalB]: { ator: 'fiscal.b', perfil: 'fiscal' },
  [TOKENS.conferente]: { ator: 'conferente.c', perfil: 'conferente' },
  [TOKENS.auditor]: { ator: 'auditor.d', perfil: 'auditor' },
  [TOKENS.admin]: { ator: 'admin.e', perfil: 'administrador' }
};
const APARELHO_A = '0190a000-0000-7000-8000-00000000000a';
const APARELHO_B = '0190a000-0000-7000-8000-00000000000b';
const CPF_EXEMPLO = '123.456.789-09';
const HASH = 'b'.repeat(64);

let agoraServidor = '2026-11-06T12:00:00.000Z';
let db;
let servidor;
let base;
const errosRegistrados = [];

beforeEach(() => {
  agoraServidor = '2026-11-06T12:00:00.000Z';
});

before(async () => {
  db = abrirBanco(':memory:');
  const api = criarApi({
    db, credenciais: CREDENCIAIS, agora: () => agoraServidor, registrarErro: (m) => errosRegistrados.push(m)
  });
  servidor = criarServidor({ api });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

after(() => new Promise((ok) => servidor.close(ok)));

async function chamar(metodo, caminho, { token = TOKENS.fiscalA, aparelho = APARELHO_A, corpo, cabecalhos = {} } = {}) {
  const headers = { ...cabecalhos };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (aparelho) headers['X-Dispositivo-Id'] = aparelho;
  if (corpo !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${caminho}`, {
    method: metodo, headers, body: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo))
  });
  const texto = await res.text();
  return { status: res.status, headers: res.headers, corpo: texto ? JSON.parse(texto) : null };
}

const hora = '2026-11-06T11:59:00Z';

function opVistoria(extra = {}) {
  return criarOperacao({
    opId: uuidv7(), entidade: 'vistoria', entidadeId: uuidv7(), tipo: 'criar', criadaEm: hora,
    payload: { estado: 'rascunho', iniciadaEm: hora, descricao: 'Vistoria fictícia', latitude: -15.6, longitude: -56.1, precisaoM: 6 },
    ...extra
  });
}

function opPessoa() {
  return criarOperacao({
    opId: uuidv7(), entidade: 'pessoa', entidadeId: uuidv7(), tipo: 'criar', criadaEm: hora,
    payload: { nome: 'Pessoa Fictícia', documento: CPF_EXEMPLO }
  });
}

function opEvidencia(vistoriaId) {
  return criarOperacao({
    opId: uuidv7(), entidade: 'evidencia', entidadeId: uuidv7(), tipo: 'criar', criadaEm: hora,
    payload: {
      vistoriaId, tipoMidia: 'foto', sha256: HASH, tamanhoBytes: 1024, capturadaEm: hora,
      localizacaoSimulada: false, latitude: -15.6, longitude: -56.1, precisaoM: 4
    }
  });
}

function opDocumento({ vistoriaId, pessoaId, numero, tipo = 'auto_infracao' }) {
  return criarOperacao({
    opId: uuidv7(), entidade: 'documento', entidadeId: uuidv7(), tipo: 'criar', criadaEm: hora,
    payload: { tipo, numero, vistoriaId, pessoaId, lavradoEm: hora, sha256Conteudo: HASH }
  });
}

const enviarLote = (operacoes, opcoes = {}) =>
  chamar('POST', '/api/sync/lote', { corpo: { horaAparelho: hora, operacoes }, ...opcoes });

describe('API: autenticação, perfis e limites', () => {
  test('sem token responde 401 com WWW-Authenticate e cabeçalhos de segurança', async () => {
    const res = await chamar('GET', '/api/sync/alteracoes', { token: null });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  });

  test('token desconhecido responde 401', async () => {
    assert.equal((await chamar('GET', '/api/sync/alteracoes', { token: 'token-invalido-xxxxxxxx' })).status, 401);
  });

  test('perfil sem permissão responde 403', async () => {
    assert.equal((await enviarLote([opVistoria()], { token: TOKENS.conferente })).status, 403);
    assert.equal((await chamar('GET', '/api/auditoria/verificacao', { token: TOKENS.fiscalA })).status, 403);
  });

  test('X-Dispositivo-Id ausente ou inválido responde 400', async () => {
    assert.equal((await chamar('GET', '/api/sync/alteracoes', { aparelho: null })).status, 400);
    assert.equal((await chamar('GET', '/api/sync/alteracoes', { aparelho: 'celular-1' })).status, 400);
  });

  test('rota inexistente 404; método errado 405 com Allow', async () => {
    assert.equal((await chamar('GET', '/api/nada')).status, 404);
    const res = await chamar('DELETE', '/api/sync/lote');
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST');
  });

  test('Content-Type diferente de JSON responde 415; JSON inválido 400; corpo grande 413', async () => {
    assert.equal((await chamar('POST', '/api/sync/lote', { corpo: 'x=1', cabecalhos: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await chamar('POST', '/api/sync/lote', { corpo: '{quebrado' })).status, 400);
    const grande = JSON.stringify({ horaAparelho: hora, operacoes: [], lixo: 'x'.repeat(LIMITE_CORPO_BYTES) });
    assert.equal((await chamar('POST', '/api/sync/lote', { corpo: grande })).status, 413);
  });

  test('lote inválido responde 400 com a lista de erros', async () => {
    const res = await enviarLote([]);
    assert.equal(res.status, 400);
    assert.match(res.corpo.erros[0], /ao menos uma operação/);
  });

  test('autenticador recusa credenciais mal configuradas', () => {
    assert.throws(() => criarAutenticador({ curto: { ator: 'x', perfil: 'fiscal' } }), /16 caracteres/);
    assert.throws(() => criarAutenticador({ 'token-valido-0000000': { ator: 'x', perfil: 'chefe' } }), /Credencial inválida/);
  });
});

describe('API: sincronização idempotente', () => {
  test('lote aceito; reenvio do mesmo lote não duplica (duplicada: true)', async () => {
    const vistoria = opVistoria();
    const evidencia = opEvidencia(vistoria.entidadeId);
    const primeira = await enviarLote([vistoria, evidencia]);
    assert.equal(primeira.status, 200);
    assert.deepEqual(primeira.corpo.resultados.map((r) => r.situacao), ['aceita', 'aceita']);
    assert.equal(primeira.corpo.relogio.divergente, false);

    const segunda = await enviarLote([vistoria, evidencia]);
    assert.deepEqual(segunda.corpo.resultados.map((r) => [r.situacao, r.duplicada]), [['aceita', true], ['aceita', true]]);
    const { n } = db.prepare("SELECT COUNT(*) AS n FROM entidades WHERE id IN (?, ?)").get(vistoria.entidadeId, evidencia.entidadeId);
    assert.equal(n, 2);
  });

  test('mesmo opId enviado por outro aparelho é rejeitado', async () => {
    const op = opVistoria();
    await enviarLote([op]);
    const res = await enviarLote([op], { token: TOKENS.fiscalB, aparelho: APARELHO_B });
    assert.equal(res.corpo.resultados[0].situacao, 'rejeitada');
  });

  test('evidência antes da vistoria fica "adiada" e é aceita depois', async () => {
    const vistoria = opVistoria();
    const evidencia = opEvidencia(vistoria.entidadeId);
    const antes = await enviarLote([evidencia]);
    assert.equal(antes.corpo.resultados[0].situacao, 'adiada');
    await enviarLote([vistoria]);
    const depois = await enviarLote([evidencia]);
    assert.equal(depois.corpo.resultados[0].situacao, 'aceita');
    assert.equal(depois.corpo.resultados[0].duplicada, undefined);
  });

  test('operação inválida é rejeitada com motivo, sem afetar as outras do lote', async () => {
    const boa = opVistoria();
    const ruim = opVistoria({ payload: { estado: 'rascunho' } });
    const res = await enviarLote([ruim, boa]);
    assert.equal(res.corpo.resultados[0].situacao, 'rejeitada');
    assert.match(res.corpo.resultados[0].motivo, /Descrição/);
    assert.equal(res.corpo.resultados[1].situacao, 'aceita');
  });

  test('desvio de relógio do aparelho é marcado na resposta e na auditoria', async () => {
    const res = await chamar('POST', '/api/sync/lote', {
      corpo: { horaAparelho: '2026-11-06T10:00:00Z', operacoes: [opVistoria()] }
    });
    assert.equal(res.corpo.relogio.divergente, true);
    assert.equal(res.corpo.relogio.desvioMs, 7_200_000);
    const ultima = db.prepare('SELECT dados FROM auditoria ORDER BY seq DESC LIMIT 1').get();
    assert.equal(JSON.parse(ultima.dados).relogio.divergente, true);
  });
});

describe('API: política de conflitos', () => {
  test('atualizar com versaoBase desatualizada gera conflito', async () => {
    const criar = opVistoria();
    await enviarLote([criar]);
    const atualizar = (versaoBase, descricao) => criarOperacao({
      opId: uuidv7(), entidade: 'vistoria', entidadeId: criar.entidadeId, tipo: 'atualizar', criadaEm: hora,
      versaoBase, payload: { descricao }
    });
    const ok = await enviarLote([atualizar(1, 'Primeira edição')]);
    assert.deepEqual([ok.corpo.resultados[0].situacao, ok.corpo.resultados[0].versao], ['aceita', 2]);
    const velha = await enviarLote([atualizar(1, 'Edição sobre versão antiga')]);
    assert.equal(velha.corpo.resultados[0].situacao, 'conflito');
    assert.match(velha.corpo.resultados[0].motivo, /versão 1, o servidor está na 2/);
  });

  test('outro fiscal não edita o rascunho alheio', async () => {
    const criar = opVistoria();
    await enviarLote([criar]);
    const res = await enviarLote([criarOperacao({
      opId: uuidv7(), entidade: 'vistoria', entidadeId: criar.entidadeId, tipo: 'atualizar', criadaEm: hora,
      versaoBase: 1, payload: { descricao: 'Tentativa alheia' }
    })], { token: TOKENS.fiscalB, aparelho: APARELHO_B });
    assert.equal(res.corpo.resultados[0].situacao, 'conflito');
  });

  test('transição de estado inválida para o fiscal gera conflito', async () => {
    const criar = opVistoria();
    await enviarLote([criar]);
    const res = await enviarLote([criarOperacao({
      opId: uuidv7(), entidade: 'vistoria', entidadeId: criar.entidadeId, tipo: 'atualizar', criadaEm: hora,
      versaoBase: 1, payload: { estado: 'homologada' }
    })]);
    assert.equal(res.corpo.resultados[0].situacao, 'conflito');
  });

  test('exclusão lógica de rascunho, com motivo; a linha continua no banco', async () => {
    const criar = opVistoria();
    await enviarLote([criar]);
    const res = await enviarLote([criarOperacao({
      opId: uuidv7(), entidade: 'vistoria', entidadeId: criar.entidadeId, tipo: 'excluir', criadaEm: hora,
      payload: { motivo: 'Aberta por engano' }
    })]);
    assert.equal(res.corpo.resultados[0].situacao, 'aceita');
    const linha = db.prepare("SELECT excluido_em, dados FROM entidades WHERE id = ?").get(criar.entidadeId);
    assert.ok(linha.excluido_em);
    assert.equal(JSON.parse(linha.dados).exclusao.motivo, 'Aberta por engano');
  });

  test('evidência é somente inclusão: criar de novo o mesmo id gera conflito', async () => {
    const vistoria = opVistoria();
    const evidencia = opEvidencia(vistoria.entidadeId);
    await enviarLote([vistoria, evidencia]);
    const repetida = { ...evidencia, opId: uuidv7() };
    assert.equal((await enviarLote([repetida])).corpo.resultados[0].situacao, 'conflito');
  });
});

describe('API: talonário e documentos', () => {
  async function prepararDocumento(aparelho = APARELHO_A, token = TOKENS.fiscalA) {
    const vistoria = opVistoria();
    const pessoa = opPessoa();
    await enviarLote([pessoa, vistoria], { aparelho, token });
    return { vistoriaId: vistoria.entidadeId, pessoaId: pessoa.entidadeId };
  }

  test('dois aparelhos recebem faixas diferentes e sem sobreposição', async () => {
    const a = await chamar('POST', '/api/talonario/blocos', { corpo: { tipo: 'notificacao', tamanho: 10 } });
    const b = await chamar('POST', '/api/talonario/blocos', {
      corpo: { tipo: 'notificacao', tamanho: 10 }, token: TOKENS.fiscalB, aparelho: APARELHO_B
    });
    assert.equal(a.status, 201);
    assert.deepEqual([a.corpo.inicio, a.corpo.fim, b.corpo.inicio, b.corpo.fim], [1, 10, 11, 20]);
    const lista = await chamar('GET', '/api/talonario/blocos');
    assert.ok(lista.corpo.blocos.every((bl) => bl.dispositivoId === APARELHO_A));
  });

  test('reserva com tipo ou tamanho inválido responde 400', async () => {
    assert.equal((await chamar('POST', '/api/talonario/blocos', { corpo: { tipo: 'multa' } })).status, 400);
    assert.equal((await chamar('POST', '/api/talonario/blocos', { corpo: { tipo: 'notificacao', tamanho: 9999 } })).status, 400);
  });

  test('documento com número do bloco do aparelho é aceito; número repetido gera conflito', async () => {
    const bloco = (await chamar('POST', '/api/talonario/blocos', { corpo: { tipo: 'auto_infracao', tamanho: 5 } })).corpo;
    const refs = await prepararDocumento();
    const doc = opDocumento({ ...refs, numero: bloco.inicio });
    assert.equal((await enviarLote([doc])).corpo.resultados[0].situacao, 'aceita');

    const outro = opDocumento({ ...refs, numero: bloco.inicio });
    const res = await enviarLote([outro]);
    assert.equal(res.corpo.resultados[0].situacao, 'conflito');
    assert.match(res.corpo.resultados[0].motivo, /já usado/);
  });

  test('número de bloco de outro aparelho é rejeitado', async () => {
    const blocoB = (await chamar('POST', '/api/talonario/blocos', {
      corpo: { tipo: 'termo_embargo', tamanho: 5 }, token: TOKENS.fiscalB, aparelho: APARELHO_B
    })).corpo;
    const refs = await prepararDocumento();
    const res = await enviarLote([opDocumento({ ...refs, numero: blocoB.inicio, tipo: 'termo_embargo' })]);
    assert.equal(res.corpo.resultados[0].situacao, 'rejeitada');
    assert.match(res.corpo.resultados[0].motivo, /não pertence/);
  });

  test('documento é imutável: cancelar acrescenta o cancelamento e não libera o número', async () => {
    const bloco = (await chamar('POST', '/api/talonario/blocos', { corpo: { tipo: 'termo_constatacao', tamanho: 2 } })).corpo;
    const refs = await prepararDocumento();
    const doc = opDocumento({ ...refs, numero: bloco.inicio, tipo: 'termo_constatacao' });
    await enviarLote([doc]);

    const cancelar = criarOperacao({
      opId: uuidv7(), entidade: 'documento', entidadeId: doc.entidadeId, tipo: 'cancelar', criadaEm: hora,
      payload: { motivo: 'Lavrado com dados incorretos' }
    });
    assert.equal((await enviarLote([cancelar])).corpo.resultados[0].situacao, 'aceita');
    const dados = JSON.parse(db.prepare('SELECT dados FROM entidades WHERE id = ?').get(doc.entidadeId).dados);
    assert.equal(dados.cancelamento.motivo, 'Lavrado com dados incorretos');
    assert.equal(dados.numero, bloco.inicio);

    const reuso = opDocumento({ ...refs, numero: bloco.inicio, tipo: 'termo_constatacao' });
    assert.equal((await enviarLote([reuso])).corpo.resultados[0].situacao, 'conflito');

    const atualizar = { ...cancelar, opId: uuidv7(), tipo: 'atualizar', versaoBase: 2, payload: { numero: 99 } };
    assert.match((await enviarLote([atualizar])).corpo.resultados[0].motivo, /não permitida/);
  });

  test('aparelho baixado: blocos inutilizados recusam novos documentos', async () => {
    const aparelhoPerdido = uuidv7();
    const bloco = (await chamar('POST', '/api/talonario/blocos', {
      corpo: { tipo: 'termo_apreensao', tamanho: 3 }, aparelho: aparelhoPerdido
    })).corpo;
    const inutil = await chamar('POST', '/api/talonario/inutilizacoes', {
      token: TOKENS.admin, aparelho: null, corpo: { dispositivoId: aparelhoPerdido, motivo: 'Aparelho extraviado' }
    });
    assert.deepEqual(inutil.corpo, { blocosInutilizados: 1 });

    const refs = await prepararDocumento(aparelhoPerdido);
    const res = await enviarLote([opDocumento({ ...refs, numero: bloco.inicio, tipo: 'termo_apreensao' })], { aparelho: aparelhoPerdido });
    assert.match(res.corpo.resultados[0].motivo, /inutilizado/);
  });
});

describe('API: alterações por cursor e permissões de leitura', () => {
  test('fiscal só recebe o que criou; conferente recebe tudo; cursor avança', async () => {
    const minha = opVistoria();
    const alheia = opVistoria();
    await enviarLote([minha]);
    await enviarLote([alheia], { token: TOKENS.fiscalB, aparelho: APARELHO_B });

    const doA = await chamar('GET', '/api/sync/alteracoes?desde=0&limite=500');
    const ids = doA.corpo.alteracoes.map((a) => a.id);
    assert.ok(ids.includes(minha.entidadeId));
    assert.ok(!ids.includes(alheia.entidadeId));

    const conf = await chamar('GET', '/api/sync/alteracoes?desde=0&limite=500', { token: TOKENS.conferente });
    assert.ok(conf.corpo.alteracoes.some((a) => a.id === alheia.entidadeId));

    const depois = await chamar('GET', `/api/sync/alteracoes?desde=${conf.corpo.cursor}`, { token: TOKENS.conferente });
    assert.deepEqual(depois.corpo.alteracoes, []);
  });

  test('paginação com temMais', async () => {
    await enviarLote([opVistoria(), opVistoria(), opVistoria()]);
    const pagina = await chamar('GET', '/api/sync/alteracoes?desde=0&limite=1', { token: TOKENS.conferente });
    assert.equal(pagina.corpo.temMais, true);
    assert.equal(pagina.corpo.alteracoes.length, 1);
  });

  test('parâmetro inválido responde 400', async () => {
    assert.equal((await chamar('GET', '/api/sync/alteracoes?limite=0')).status, 400);
    assert.equal((await chamar('GET', '/api/sync/alteracoes?desde=-1')).status, 400);
  });
});

describe('API: trilha de auditoria imutável', () => {
  test('auditor verifica a cadeia íntegra', async () => {
    await enviarLote([opVistoria()]);
    const res = await chamar('GET', '/api/auditoria/verificacao', { token: TOKENS.auditor, aparelho: null });
    assert.equal(res.status, 200);
    assert.equal(res.corpo.integra, true);
    assert.ok(res.corpo.total > 0);
  });

  test('banco recusa UPDATE/DELETE na auditoria e DELETE físico nas entidades e números', () => {
    assert.throws(() => db.exec("UPDATE auditoria SET ator = 'x'"), /somente inclusão/);
    assert.throws(() => db.exec('DELETE FROM auditoria'), /somente inclusão/);
    assert.throws(() => db.exec('DELETE FROM entidades'), /exclusão lógica/);
    assert.throws(() => db.exec('DELETE FROM numeros_usados'), /não pode ser liberado/);
    assert.throws(() => db.exec('DELETE FROM operacoes_recebidas'), /idempotência/);
  });

  test('adulteração direta (sem os gatilhos) é detectada pela cadeia de hashes', () => {
    const outro = abrirBanco(':memory:');
    transacao(outro, () => {
      for (const acao of ['a', 'b', 'c']) {
        registrarAuditoria(outro, { em: hora, ator: 'teste', acao, dados: { acao } });
      }
    });
    assert.equal(verificarAuditoria(outro).integra, true);
    outro.exec('DROP TRIGGER auditoria_sem_update');
    outro.exec("UPDATE auditoria SET dados = '{\"acao\":\"B\"}' WHERE seq = 2");
    assert.deepEqual(
      { integra: verificarAuditoria(outro).integra, falha: verificarAuditoria(outro).primeiraFalha },
      { integra: false, falha: 2 }
    );
  });
});

describe('API: configuração por ambiente', () => {
  test('sem DB_PATH ou sem arquivo de credenciais, a API fica desabilitada', async () => {
    assert.equal(await apiDoAmbiente({}), undefined);
    assert.equal(await apiDoAmbiente({ DB_PATH: ':memory:' }), undefined);
  });

  test('credenciais por token são recusadas em produção', async () => {
    await assert.rejects(
      apiDoAmbiente({ DB_PATH: ':memory:', API_CREDENCIAIS_ARQUIVO: 'x.json', NODE_ENV: 'production' }),
      /ADR-008/
    );
  });

  test('com DB_PATH e arquivo de credenciais, a API é criada', async () => {
    const pasta = await mkdtemp(join(tmpdir(), 'api-'));
    const arquivo = join(pasta, 'credenciais.json');
    await writeFile(arquivo, JSON.stringify(CREDENCIAIS));
    try {
      assert.equal(typeof await apiDoAmbiente({ DB_PATH: ':memory:', API_CREDENCIAIS_ARQUIVO: arquivo }), 'function');
    } finally {
      await rm(pasta, { recursive: true, force: true });
    }
  });
});

describe('API: banco e migrações', () => {
  test('migrar é idempotente e recusa banco de versão mais nova', () => {
    const outro = abrirBanco(':memory:');
    assert.equal(migrar(outro), 1);
    outro.exec('UPDATE esquema SET versao = 99');
    assert.throws(() => migrar(outro), /mais nova/);
  });

  test('erro inesperado responde 500 sem detalhes internos e registra log', async () => {
    const quebrado = abrirBanco(':memory:');
    quebrado.close();
    const api = criarApi({ db: quebrado, credenciais: CREDENCIAIS, registrarErro: (m) => errosRegistrados.push(m) });
    const s = criarServidor({ api });
    await new Promise((ok) => s.listen(0, '127.0.0.1', ok));
    try {
      const res = await fetch(`http://127.0.0.1:${s.address().port}/api/talonario/blocos`, {
        headers: { Authorization: `Bearer ${TOKENS.fiscalA}`, 'X-Dispositivo-Id': APARELHO_A }
      });
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { erro: 'Erro interno' });
      assert.match(errosRegistrados.at(-1), /"nivel":"erro"/);
    } finally {
      await new Promise((ok) => s.close(ok));
    }
  });
});
