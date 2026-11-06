import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { tempoDoUuidv7, uuidv7, uuidValido } from '../public/js/dominio/ids.js';
import {
  carValido, cnpjValido, cpfValido, identificarDocumento, interpretarCar
} from '../public/js/dominio/documentos.js';
import {
  HASH_INICIAL, hashEncadeado, serializarCanonico, sha256Hex, sha256Valido, verificarCadeia
} from '../public/js/dominio/integridade.js';
import { avaliarRelogio, dataHoraValida } from '../public/js/dominio/relogio.js';
import { ESTADOS_VISTORIA, transicoesPossiveis, validarTransicao } from '../public/js/dominio/estados.js';
import {
  blocoContem, numerosRestantes, precisaNovoBloco, proximoNumero, validarBloco
} from '../public/js/dominio/talonario.js';
import {
  validarDocumentoFiscalizacao, validarEvidencia, validarPessoa, validarVistoria
} from '../public/js/dominio/fiscalizacao.js';
import {
  MAX_OPERACOES_LOTE, aplicarResultados, criarOperacao, selecionarLote, validarLote, validarOperacao
} from '../public/js/dominio/sincronizacao.js';

const sha256Node = (texto) => createHash('sha256').update(texto, 'utf8').digest('hex');

// Dados FICTÍCIOS. CPF/CNPJ são exemplos públicos de documentação, não de pessoas reais.
const CPF_EXEMPLO = '123.456.789-09';
const CNPJ_EXEMPLO = '11.222.333/0001-81';
const CAR_EXEMPLO = 'MT-5103403-6B8E.2E4A.3E8F.4C1D.9A2B.3C4D.5E6F.7A8B';
const HASH_EXEMPLO = 'a'.repeat(64);
const AGORA = '2026-11-06T12:00:00Z';

describe('ids (UUID v7)', () => {
  test('gera UUID v7 válido com o tempo embutido', () => {
    const id = uuidv7({ agora: 1_700_000_000_000 });
    assert.ok(uuidValido(id));
    assert.equal(id[14], '7');
    assert.ok('89ab'.includes(id[19]));
    assert.equal(tempoDoUuidv7(id), 1_700_000_000_000);
  });

  test('é ordenável no tempo', () => {
    const fixo = () => new Uint8Array(16);
    assert.ok(uuidv7({ agora: 1000, aleatorio: fixo }) < uuidv7({ agora: 2000, aleatorio: fixo }));
  });

  test('não repete em 10 mil gerações', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => uuidv7()));
    assert.equal(ids.size, 10_000);
  });

  test('rejeita tempo inválido e fonte aleatória curta', () => {
    assert.throws(() => uuidv7({ agora: -1 }), RangeError);
    assert.throws(() => uuidv7({ agora: 2 ** 48 }), RangeError);
    assert.throws(() => uuidv7({ aleatorio: () => new Uint8Array(4) }), RangeError);
  });

  test('uuidValido recusa formatos errados', () => {
    for (const v of [null, 1, '', 'abc', '0190A000-0000-7000-8000-000000000001', '0190a000-0000-7000-c000-000000000001']) {
      assert.equal(uuidValido(v), false, String(v));
    }
    assert.equal(tempoDoUuidv7('0190a000-0000-4000-8000-000000000001'), null);
  });
});

describe('documentos (CPF, CNPJ, CAR)', () => {
  test('CPF: aceita com ou sem máscara e recusa dígito errado ou repetido', () => {
    assert.equal(cpfValido(CPF_EXEMPLO), true);
    assert.equal(cpfValido('12345678909'), true);
    assert.equal(cpfValido('123.456.789-08'), false);
    assert.equal(cpfValido('111.111.111-11'), false);
    assert.equal(cpfValido('123'), false);
    assert.equal(cpfValido(null), false);
  });

  test('CNPJ numérico e alfanumérico (exemplo da Receita Federal)', () => {
    assert.equal(cnpjValido(CNPJ_EXEMPLO), true);
    assert.equal(cnpjValido('11.222.333/0001-82'), false);
    assert.equal(cnpjValido('12.ABC.345/01DE-35'), true);
    assert.equal(cnpjValido('12.abc.345/01de-35'), true);
    assert.equal(cnpjValido('12.ABC.345/01DE-36'), false);
    assert.equal(cnpjValido('00.000.000/0000-00'), false);
    assert.equal(cnpjValido('12.ABC.345/01DE-3X'), false);
  });

  test('identificarDocumento distingue CPF e CNPJ', () => {
    assert.deepEqual(identificarDocumento(CPF_EXEMPLO), { tipo: 'cpf', valor: '12345678909' });
    assert.deepEqual(identificarDocumento(CNPJ_EXEMPLO), { tipo: 'cnpj', valor: '11222333000181' });
    assert.equal(identificarDocumento('não é documento'), null);
  });

  test('CAR: formato UF-IBGE-HASH, com pontos removidos e UF coerente com o código IBGE', () => {
    assert.equal(carValido(CAR_EXEMPLO), true);
    assert.equal(interpretarCar(CAR_EXEMPLO.toLowerCase()).uf, 'MT');
    assert.equal(carValido('MT-3550308-6B8E2E4A3E8F4C1D9A2B3C4D5E6F7A8B'), false, 'código IBGE de SP com UF MT');
    assert.equal(carValido('MT-5103403-6B8E2E4A'), false);
    assert.equal(carValido('XX-5103403-6B8E2E4A3E8F4C1D9A2B3C4D5E6F7A8B'), false);
  });
});

describe('integridade (hash e cadeia de custódia)', () => {
  test('serialização canônica independe da ordem das chaves', () => {
    assert.equal(serializarCanonico({ b: 1, a: [2, { d: 3, c: null }] }), '{"a":[2,{"c":null,"d":3}],"b":1}');
    assert.equal(serializarCanonico({ a: 1, b: undefined }), '{"a":1}');
    assert.throws(() => serializarCanonico({ a: NaN }), TypeError);
    assert.throws(() => serializarCanonico(() => 1), TypeError);
  });

  test('sha256Hex (WebCrypto) confere com o node:crypto', async () => {
    assert.equal(await sha256Hex('fiscalização'), sha256Node('fiscalização'));
    assert.equal(await sha256Hex(new Uint8Array([1, 2, 3])), createHash('sha256').update(Buffer.from([1, 2, 3])).digest('hex'));
    assert.equal(sha256Valido(await sha256Hex('x')), true);
    assert.equal(sha256Valido('A'.repeat(64)), false);
  });

  function cadeia(registros) {
    let anterior = HASH_INICIAL;
    return registros.map((registro) => {
      const hash = hashEncadeado(anterior, registro, sha256Node);
      const item = { registro, hashAnterior: anterior, hash };
      anterior = hash;
      return item;
    });
  }

  test('cadeia íntegra é aceita', () => {
    const itens = cadeia([{ acao: 'a' }, { acao: 'b' }, { acao: 'c' }]);
    assert.deepEqual(verificarCadeia(itens, sha256Node), { integra: true, total: 3, primeiraFalha: null, motivo: null });
  });

  test('detecta conteúdo alterado, registro removido e registro inserido', () => {
    const itens = cadeia([{ acao: 'a' }, { acao: 'b' }, { acao: 'c' }]);

    const alterada = structuredClone(itens);
    alterada[1].registro.acao = 'B';
    assert.equal(verificarCadeia(alterada, sha256Node).primeiraFalha, 1);

    const removida = [itens[0], itens[2]];
    assert.equal(verificarCadeia(removida, sha256Node).primeiraFalha, 1);

    const intrusa = cadeia([{ acao: 'x' }])[0];
    assert.equal(verificarCadeia([itens[0], intrusa, ...itens.slice(1)], sha256Node).integra, false);
  });
});

describe('relógio (divergência de data/hora)', () => {
  test('exige data, hora e fuso', () => {
    assert.equal(dataHoraValida('2026-11-06T12:00:00Z'), true);
    assert.equal(dataHoraValida('2026-11-06T08:00:00.123-04:00'), true);
    assert.equal(dataHoraValida('2026-11-06T12:00:00'), false);
    assert.equal(dataHoraValida('2026-11-06'), false);
    assert.equal(dataHoraValida('2026-13-40T12:00:00Z'), false);
  });

  test('marca desvio acima do limite e aceita dentro do limite', () => {
    assert.deepEqual(avaliarRelogio({ horaAparelho: '2026-11-06T11:58:00Z', horaServidor: AGORA }),
      { desvioMs: 120_000, divergente: false, motivo: null });
    const atrasado = avaliarRelogio({ horaAparelho: '2026-11-06T11:00:00Z', horaServidor: AGORA });
    assert.equal(atrasado.divergente, true);
    assert.equal(atrasado.desvioMs, 3_600_000);
    // Fusos diferentes, mesmo instante
    assert.equal(avaliarRelogio({ horaAparelho: '2026-11-06T08:00:00-04:00', horaServidor: AGORA }).desvioMs, 0);
  });

  test('hora ausente é tratada como divergente', () => {
    assert.equal(avaliarRelogio({ horaAparelho: undefined, horaServidor: AGORA }).divergente, true);
  });
});

describe('estados da vistoria', () => {
  test('fluxo completo: rascunho → campo → recebida → conferência → devolvida → campo → homologada', () => {
    const passos = [
      ['rascunho', 'concluida_campo', 'fiscal'],
      ['concluida_campo', 'recebida', 'sistema'],
      ['recebida', 'em_conferencia', 'conferente'],
      ['em_conferencia', 'devolvida', 'conferente'],
      ['devolvida', 'concluida_campo', 'fiscal'],
      ['em_conferencia', 'homologada', 'conferente']
    ];
    for (const [de, para, perfil] of passos) {
      assert.equal(validarTransicao(de, para, perfil).valida, true, `${de} → ${para}`);
    }
  });

  test('recusa transição inexistente, perfil errado e estado desconhecido', () => {
    assert.match(validarTransicao('rascunho', 'homologada', 'fiscal').motivo, /não permitida/);
    assert.match(validarTransicao('em_conferencia', 'homologada', 'fiscal').motivo, /Perfil "fiscal"/);
    assert.equal(validarTransicao('homologada', 'cancelada', 'fiscal').valida, false);
    assert.equal(validarTransicao('xyz', 'rascunho', 'fiscal').valida, false);
  });

  test('transicoesPossiveis por perfil', () => {
    assert.deepEqual(transicoesPossiveis('rascunho', 'fiscal'), ['concluida_campo', 'cancelada']);
    assert.deepEqual(transicoesPossiveis('rascunho', 'conferente'), []);
    assert.equal(ESTADOS_VISTORIA.length, 7);
  });
});

describe('talonário (blocos de numeração)', () => {
  const blocos = [
    { tipo: 'auto_infracao', inicio: 101, fim: 103 },
    { tipo: 'auto_infracao', inicio: 1, fim: 2 },
    { tipo: 'notificacao', inicio: 1, fim: 5 },
    { tipo: 'auto_infracao', inicio: 200, fim: 210, inutilizadoEm: AGORA }
  ];

  test('consome em ordem, pulando usados, e ignora blocos inutilizados e de outro tipo', () => {
    assert.equal(proximoNumero(blocos, 'auto_infracao', []), 1);
    assert.equal(proximoNumero(blocos, 'auto_infracao', [1, 2, 101]), 102);
    assert.equal(proximoNumero(blocos, 'auto_infracao', new Set([1, 2, 101, 102, 103])), null);
    assert.equal(numerosRestantes(blocos, 'auto_infracao', [1]), 4);
  });

  test('avisa quando é hora de pedir novo bloco', () => {
    assert.equal(precisaNovoBloco(blocos, 'notificacao', [], 3), false);
    assert.equal(precisaNovoBloco(blocos, 'notificacao', [1, 2], 3), true);
  });

  test('valida blocos', () => {
    assert.equal(blocoContem(blocos[0], 102), true);
    assert.equal(blocoContem(blocos[0], 104), false);
    assert.equal(validarBloco({ tipo: 'auto_infracao', inicio: 5, fim: 4 }), false);
    assert.equal(validarBloco({ tipo: 'outro', inicio: 1, fim: 4 }), false);
  });
});

describe('entidades de fiscalização', () => {
  const vistoria = {
    estado: 'rascunho', iniciadaEm: AGORA, descricao: 'Vistoria fictícia de teste',
    latitude: -15.6, longitude: -56.1, precisaoM: 8
  };

  test('vistoria completa e parcial', () => {
    assert.deepEqual(validarVistoria(vistoria), { valida: true, erros: [] });
    assert.equal(validarVistoria({ ...vistoria, latitude: 95 }).valida, false);
    assert.equal(validarVistoria({ ...vistoria, iniciadaEm: '2026-11-06' }).valida, false);
    assert.equal(validarVistoria({ descricao: 'Só a descrição mudou' }, { parcial: true }).valida, true);
    assert.equal(validarVistoria({ estado: 'xyz' }, { parcial: true }).valida, false);
  });

  test('evidência exige hash, mídia, tempo com fuso e indicador de localização simulada', () => {
    const evidencia = {
      vistoriaId: uuidv7(), tipoMidia: 'foto', sha256: HASH_EXEMPLO, tamanhoBytes: 2048,
      capturadaEm: AGORA, localizacaoSimulada: false, latitude: -15.6, longitude: -56.1, precisaoM: 5
    };
    assert.equal(validarEvidencia(evidencia).valida, true);
    const { erros } = validarEvidencia({ ...evidencia, sha256: 'x', localizacaoSimulada: undefined, tipoMidia: 'pdf' });
    assert.equal(erros.length, 3);
  });

  test('pessoa com CPF/CNPJ e CAR opcional', () => {
    assert.equal(validarPessoa({ nome: 'Pessoa Fictícia', documento: CPF_EXEMPLO, car: CAR_EXEMPLO }).valida, true);
    assert.equal(validarPessoa({ nome: 'Empresa Fictícia', documento: CNPJ_EXEMPLO }).valida, true);
    assert.equal(validarPessoa({ nome: 'X', documento: '000' }).erros.length, 2);
    assert.equal(validarPessoa({ nome: 'Pessoa', documento: CPF_EXEMPLO, car: 'MT-1' }).valida, false);
  });

  test('documento não aceita cancelamento embutido na criação', () => {
    const doc = {
      tipo: 'auto_infracao', numero: 1, vistoriaId: uuidv7(), pessoaId: uuidv7(),
      lavradoEm: AGORA, sha256Conteudo: HASH_EXEMPLO
    };
    assert.equal(validarDocumentoFiscalizacao(doc).valida, true);
    assert.equal(validarDocumentoFiscalizacao({ ...doc, cancelamento: {} }).valida, false);
    assert.equal(validarDocumentoFiscalizacao({ ...doc, numero: 0, tipo: 'multa' }).erros.length, 2);
  });
});

describe('contrato de sincronização', () => {
  const vistoria = {
    estado: 'rascunho', iniciadaEm: AGORA, descricao: 'Vistoria fictícia',
    latitude: -15.6, longitude: -56.1, precisaoM: 8
  };
  const op = (extra = {}) => criarOperacao({
    opId: uuidv7(), entidade: 'vistoria', entidadeId: uuidv7(), tipo: 'criar', payload: vistoria, criadaEm: AGORA, ...extra
  });

  test('operação válida e política por entidade', () => {
    assert.deepEqual(validarOperacao(op()), { valida: true, erros: [] });
    assert.match(validarOperacao(op({ entidade: 'evidencia', tipo: 'atualizar' })).erros[0], /não permitida/);
    assert.match(validarOperacao(op({ entidade: 'documento', tipo: 'excluir' })).erros[0], /não permitida/);
    assert.match(validarOperacao(op({ entidade: 'projeto' })).erros[0], /desconhecida/);
  });

  test('atualizar exige versaoBase; excluir e cancelar exigem motivo', () => {
    assert.match(validarOperacao(op({ tipo: 'atualizar', payload: { descricao: 'Nova descrição' } })).erros[0], /versaoBase/);
    assert.equal(validarOperacao(op({ tipo: 'atualizar', versaoBase: 1, payload: { descricao: 'Nova descrição' } })).valida, true);
    assert.equal(validarOperacao(op({ tipo: 'excluir', payload: { motivo: 'ok' } })).valida, false);
    assert.equal(validarOperacao(op({ tipo: 'excluir', payload: { motivo: 'Criada por engano' } })).valida, true);
  });

  test('versão de esquema não suportada é recusada', () => {
    assert.match(validarOperacao({ ...op(), versaoEsquema: 99 }).erros.join(), /Versão de esquema/);
  });

  test('lote: tamanho, hora do aparelho e opId repetido', () => {
    const a = op();
    assert.equal(validarLote({ horaAparelho: AGORA, operacoes: [a] }).valido, true);
    assert.equal(validarLote({ horaAparelho: AGORA, operacoes: [] }).valido, false);
    assert.equal(validarLote({ operacoes: [a] }).valido, false);
    assert.match(validarLote({ horaAparelho: AGORA, operacoes: [a, a] }).erros[0], /repetido/);
    const grande = Array.from({ length: MAX_OPERACOES_LOTE + 1 }, () => op());
    assert.match(validarLote({ horaAparelho: AGORA, operacoes: grande }).erros[0], /no máximo/);
  });

  test('selecionarLote respeita a ordem de criação e a ordem causal', () => {
    const t = '2026-11-06T10:00:00Z';
    const evidencia = { opId: 'e', entidade: 'evidencia', criadaEm: t };
    const vist = { opId: 'v', entidade: 'vistoria', criadaEm: t };
    const antiga = { opId: 'a', entidade: 'evidencia', criadaEm: '2026-11-06T09:00:00Z' };
    assert.deepEqual(selecionarLote([evidencia, vist, antiga]).map((o) => o.opId), ['a', 'v', 'e']);
    assert.equal(selecionarLote([evidencia, vist, antiga], 2).length, 2);
  });

  test('aplicarResultados: só sai da outbox o que o servidor resolveu', () => {
    const pendentes = ['1', '2', '3', '4', '5'].map((opId) => ({ opId }));
    const { restantes, confirmadas, quarentena } = aplicarResultados(pendentes, [
      { opId: '1', situacao: 'aceita' },
      { opId: '2', situacao: 'aceita', duplicada: true },
      { opId: '3', situacao: 'conflito', motivo: 'x' },
      { opId: '4', situacao: 'adiada' }
    ]);
    assert.deepEqual(confirmadas.map((c) => c.op.opId), ['1', '2']);
    assert.deepEqual(quarentena.map((c) => c.op.opId), ['3']);
    assert.deepEqual(restantes.map((o) => o.opId), ['4', '5']);
  });
});
