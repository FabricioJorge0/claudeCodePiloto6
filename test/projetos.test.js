import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dadosExemplo } from '../public/js/dados-exemplo.js';
import {
  STATUS_VALIDOS,
  buscarProjeto,
  filtrarProjetos,
  listarProjetos,
  normalizarProjeto,
  opcoesDeFiltro,
  proximoId,
  resumoPorStatus,
  validarProjeto
} from '../public/js/projetos.js';

const projetoValido = {
  nome: 'Projeto Fictício de Teste',
  municipio: 'Cidade Imaginária',
  responsavel: 'Equipe Teste',
  status: 'planejamento',
  prazo: '2027-01-15',
  orcamento: 1000,
  progresso: 10
};

describe('dados de exemplo', () => {
  test('todos os registros fictícios são válidos e têm id único', () => {
    const ids = new Set();
    for (const p of dadosExemplo) {
      assert.deepEqual(validarProjeto(p), { valido: true, erros: [] }, p.nome);
      assert.ok(!ids.has(p.id), `id duplicado: ${p.id}`);
      ids.add(p.id);
    }
  });

  test('municípios são reais no formato "Cidade - UF" (para mapa e clima)', () => {
    for (const p of dadosExemplo) {
      assert.match(p.municipio, /^[A-Za-zÀ-ÿ' ]+ - [A-Z]{2}$/);
    }
  });
});

describe('validarProjeto', () => {
  test('aceita um projeto válido', () => {
    assert.deepEqual(validarProjeto(projetoValido), { valido: true, erros: [] });
  });

  test('rejeita entrada ausente', () => {
    assert.equal(validarProjeto(null).valido, false);
    assert.equal(validarProjeto(undefined).valido, false);
  });

  const casosInvalidos = [
    ['nome curto', { nome: 'ab' }],
    ['nome só com espaços', { nome: '     ' }],
    ['nome longo demais', { nome: 'x'.repeat(121) }],
    ['município vazio', { municipio: '' }],
    ['responsável não-texto', { responsavel: 42 }],
    ['status desconhecido', { status: 'cancelado' }],
    ['prazo em formato errado', { prazo: '15/01/2027' }],
    ['prazo inexistente', { prazo: '2027-02-30' }],
    ['orçamento negativo', { orcamento: -1 }],
    ['orçamento NaN', { orcamento: NaN }],
    ['orçamento infinito', { orcamento: Infinity }],
    ['orçamento como texto', { orcamento: '1000' }],
    ['progresso acima de 100', { progresso: 101 }],
    ['progresso negativo', { progresso: -5 }],
    ['progresso fracionário', { progresso: 10.5 }]
  ];

  for (const [descricao, alteracao] of casosInvalidos) {
    test(`rejeita ${descricao}`, () => {
      const resultado = validarProjeto({ ...projetoValido, ...alteracao });
      assert.equal(resultado.valido, false);
      assert.equal(resultado.erros.length, 1);
    });
  }

  test('acumula vários erros', () => {
    const resultado = validarProjeto({});
    assert.equal(resultado.valido, false);
    assert.equal(resultado.erros.length, 7);
  });
});

describe('normalizarProjeto', () => {
  test('remove espaços e converte números vindos do formulário', () => {
    const normalizado = normalizarProjeto({
      ...projetoValido,
      nome: '  Nome com espaços  ',
      orcamento: '2500.50',
      progresso: '30'
    });
    assert.equal(normalizado.nome, 'Nome com espaços');
    assert.equal(normalizado.orcamento, 2500.5);
    assert.equal(normalizado.progresso, 30);
  });

  test('campo numérico vazio vira NaN (e não 0)', () => {
    const normalizado = normalizarProjeto({ ...projetoValido, orcamento: '', progresso: null });
    assert.ok(Number.isNaN(normalizado.orcamento));
    assert.ok(Number.isNaN(normalizado.progresso));
    assert.equal(validarProjeto(normalizado).valido, false);
  });

  test('descarta campos extras', () => {
    const normalizado = normalizarProjeto({ ...projetoValido, id: 999, admin: true });
    assert.deepEqual(Object.keys(normalizado).sort(), Object.keys(projetoValido).sort());
  });
});

describe('listarProjetos', () => {
  test('sem filtro retorna todos (em nova lista)', () => {
    const lista = listarProjetos(dadosExemplo);
    assert.equal(lista.length, dadosExemplo.length);
    assert.notEqual(lista, dadosExemplo);
  });

  test('filtro vazio equivale a sem filtro', () => {
    assert.equal(listarProjetos(dadosExemplo, { status: '' }).length, dadosExemplo.length);
  });

  for (const status of STATUS_VALIDOS) {
    test(`filtra por ${status}`, () => {
      const lista = listarProjetos(dadosExemplo, { status });
      assert.ok(lista.every((p) => p.status === status));
      assert.equal(lista.length, dadosExemplo.filter((p) => p.status === status).length);
    });
  }

  test('status inválido lança RangeError', () => {
    assert.throws(() => listarProjetos(dadosExemplo, { status: 'xyz' }), RangeError);
  });
});

describe('buscarProjeto', () => {
  test('encontra por id numérico ou texto', () => {
    assert.equal(buscarProjeto(dadosExemplo, 1)?.id, 1);
    assert.equal(buscarProjeto(dadosExemplo, '2')?.id, 2);
  });

  test('retorna null para ids inválidos ou inexistentes', () => {
    for (const id of [0, -1, 1.5, 'abc', '', null, undefined, 9999]) {
      assert.equal(buscarProjeto(dadosExemplo, id), null, String(id));
    }
  });
});

describe('proximoId', () => {
  test('retorna 1 para lista vazia', () => {
    assert.equal(proximoId([]), 1);
  });

  test('retorna maior id + 1 mesmo com buracos', () => {
    assert.equal(proximoId([{ id: 3 }, { id: 7 }, { id: 5 }]), 8);
  });
});

describe('resumoPorStatus', () => {
  test('conta por status e soma orçamento', () => {
    const resumo = resumoPorStatus(dadosExemplo);
    assert.equal(resumo.total, dadosExemplo.length);
    const soma = Object.values(resumo.porStatus).reduce((a, b) => a + b, 0);
    assert.equal(soma, dadosExemplo.length);
    assert.equal(resumo.orcamentoTotal, dadosExemplo.reduce((a, p) => a + p.orcamento, 0));
  });

  test('lista vazia gera zeros para todos os status', () => {
    const resumo = resumoPorStatus([]);
    assert.equal(resumo.total, 0);
    assert.equal(resumo.orcamentoTotal, 0);
    assert.deepEqual(Object.keys(resumo.porStatus), STATUS_VALIDOS);
    assert.ok(Object.values(resumo.porStatus).every((n) => n === 0));
  });
});

describe('filtrarProjetos', () => {
  const ids = (lista) => lista.map((p) => p.id).sort((a, b) => a - b);

  test('sem filtros retorna todos (em nova lista)', () => {
    const lista = filtrarProjetos(dadosExemplo);
    assert.equal(lista.length, dadosExemplo.length);
    assert.notEqual(lista, dadosExemplo);
  });

  test('filtros vazios ou só com espaços são ignorados', () => {
    const vazios = { status: '', prazoDe: '', prazoAte: null, municipio: '  ', responsavel: undefined, orcamentoMin: '', orcamentoMax: '' };
    assert.equal(filtrarProjetos(dadosExemplo, vazios).length, dadosExemplo.length);
  });

  test('por status', () => {
    assert.deepEqual(ids(filtrarProjetos(dadosExemplo, { status: 'planejamento' })), [2, 6]);
  });

  test('por município (correspondência exata)', () => {
    assert.deepEqual(ids(filtrarProjetos(dadosExemplo, { municipio: 'Cuiabá - MT' })), [1, 4]);
    assert.deepEqual(filtrarProjetos(dadosExemplo, { municipio: 'Vale' }), []);
  });

  test('por equipe responsável', () => {
    assert.deepEqual(ids(filtrarProjetos(dadosExemplo, { responsavel: 'Equipe Gama' })), [3]);
  });

  test('por intervalo de prazo (inclusivo)', () => {
    assert.deepEqual(ids(filtrarProjetos(dadosExemplo, { prazoDe: '2027-01-01' })), [1, 2, 5, 6]);
    assert.deepEqual(ids(filtrarProjetos(dadosExemplo, { prazoAte: '2026-12-31' })), [3, 4]);
    assert.deepEqual(ids(filtrarProjetos(dadosExemplo, { prazoDe: '2027-03-31', prazoAte: '2027-05-20' })), [1, 6]);
  });

  test('intervalo de prazo invertido não retorna nada', () => {
    assert.deepEqual(filtrarProjetos(dadosExemplo, { prazoDe: '2027-12-31', prazoAte: '2026-01-01' }), []);
  });

  test('por faixa de orçamento (inclusiva, aceita texto do formulário)', () => {
    assert.deepEqual(ids(filtrarProjetos(dadosExemplo, { orcamentoMin: '150000' })), [1, 3, 5]);
    assert.deepEqual(ids(filtrarProjetos(dadosExemplo, { orcamentoMax: 45000 })), [4, 6]);
    assert.deepEqual(ids(filtrarProjetos(dadosExemplo, { orcamentoMin: '80000', orcamentoMax: '210000' })), [1, 2, 5]);
  });

  test('combina todos os filtros', () => {
    const resultado = filtrarProjetos(dadosExemplo, {
      status: 'em_execucao',
      municipio: 'Cuiabá - MT',
      responsavel: 'Equipe Alfa',
      prazoDe: '2027-01-01',
      prazoAte: '2027-12-31',
      orcamentoMin: '100000',
      orcamentoMax: '200000'
    });
    assert.deepEqual(ids(resultado), [1]);
  });

  const invalidos = [
    ['status desconhecido', { status: 'cancelado' }],
    ['prazo inicial em formato errado', { prazoDe: '31/12/2026' }],
    ['prazo final inexistente', { prazoAte: '2027-02-30' }],
    ['orçamento mínimo negativo', { orcamentoMin: '-1' }],
    ['orçamento máximo não numérico', { orcamentoMax: 'abc' }],
    ['orçamento infinito', { orcamentoMin: Infinity }]
  ];
  for (const [descricao, filtros] of invalidos) {
    test(`rejeita ${descricao} com RangeError`, () => {
      assert.throws(() => filtrarProjetos(dadosExemplo, filtros), RangeError);
    });
  }
});

describe('opcoesDeFiltro', () => {
  test('lista municípios e equipes distintos em ordem alfabética', () => {
    const { municipios, equipes } = opcoesDeFiltro(dadosExemplo);
    assert.deepEqual(municipios, ['Cáceres - MT', 'Cuiabá - MT', 'Rondonópolis - MT', 'Sinop - MT']);
    assert.deepEqual(equipes, ['Equipe Alfa', 'Equipe Beta', 'Equipe Delta', 'Equipe Épsilon', 'Equipe Gama', 'Equipe Zeta']);
  });

  test('lista vazia gera opções vazias', () => {
    assert.deepEqual(opcoesDeFiltro([]), { municipios: [], equipes: [] });
  });
});
