import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dadosExemplo } from '../public/js/dados-exemplo.js';
import { CHAVE_PADRAO, ErroValidacao, criarRepositorio } from '../public/js/repositorio.js';

// Simula o localStorage do navegador
function criarArmazenamentoFalso(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
    bruto: (k) => dados.get(k)
  };
}

const novoProjeto = {
  nome: 'Viveiro de Mudas Fictício',
  municipio: 'Cidade Imaginária',
  responsavel: 'Equipe Teste',
  status: 'planejamento',
  prazo: '2027-06-01',
  orcamento: 5000,
  progresso: 0
};

describe('repositório (localStorage)', () => {
  test('primeira visita carrega os dados de exemplo e grava no armazenamento', () => {
    const armazenamento = criarArmazenamentoFalso();
    const repo = criarRepositorio(armazenamento);
    assert.deepEqual(repo.listar(), dadosExemplo);
    assert.deepEqual(JSON.parse(armazenamento.bruto(CHAVE_PADRAO)), dadosExemplo);
  });

  test('adicionar grava com novo id e persiste entre instâncias', () => {
    const armazenamento = criarArmazenamentoFalso();
    const novo = criarRepositorio(armazenamento).adicionar(novoProjeto);
    assert.equal(novo.id, dadosExemplo.length + 1);

    const outraAba = criarRepositorio(armazenamento);
    assert.deepEqual(outraAba.buscar(novo.id), novo);
    assert.equal(outraAba.listar().length, dadosExemplo.length + 1);
  });

  test('adicionar ignora id enviado pelo usuário', () => {
    const repo = criarRepositorio(criarArmazenamentoFalso());
    const novo = repo.adicionar({ ...novoProjeto, id: 1 });
    assert.notEqual(novo.id, 1);
    assert.equal(repo.listar().filter((p) => p.id === 1).length, 1);
  });

  test('adicionar dados inválidos lança ErroValidacao e não grava', () => {
    const repo = criarRepositorio(criarArmazenamentoFalso());
    assert.throws(
      () => repo.adicionar({ ...novoProjeto, nome: '', progresso: 200 }),
      (erro) => erro instanceof ErroValidacao && erro.erros.length === 2
    );
    assert.equal(repo.listar().length, dadosExemplo.length);
  });

  test('adicionar sem dados lança ErroValidacao', () => {
    const repo = criarRepositorio(criarArmazenamentoFalso());
    assert.throws(() => repo.adicionar(undefined), ErroValidacao);
  });

  test('remover exclui e retorna true; id inexistente retorna false', () => {
    const repo = criarRepositorio(criarArmazenamentoFalso());
    assert.equal(repo.remover(1), true);
    assert.equal(repo.buscar(1), null);
    assert.equal(repo.remover(1), false);
    assert.equal(repo.listar().length, dadosExemplo.length - 1);
  });

  test('restaurar volta aos dados de exemplo', () => {
    const repo = criarRepositorio(criarArmazenamentoFalso());
    repo.remover(1);
    repo.adicionar(novoProjeto);
    assert.deepEqual(repo.restaurar(), dadosExemplo);
    assert.deepEqual(repo.listar(), dadosExemplo);
  });

  test('lista vazia gravada é respeitada (não recarrega exemplo)', () => {
    const armazenamento = criarArmazenamentoFalso({ [CHAVE_PADRAO]: '[]' });
    assert.deepEqual(criarRepositorio(armazenamento).listar(), []);
  });

  test('JSON corrompido é substituído pelos dados de exemplo', () => {
    const armazenamento = criarArmazenamentoFalso({ [CHAVE_PADRAO]: '{isso não é json' });
    assert.deepEqual(criarRepositorio(armazenamento).listar(), dadosExemplo);
  });

  test('conteúdo que não é lista é substituído pelos dados de exemplo', () => {
    const armazenamento = criarArmazenamentoFalso({ [CHAVE_PADRAO]: '{"a":1}' });
    assert.deepEqual(criarRepositorio(armazenamento).listar(), dadosExemplo);
  });

  test('registros adulterados no localStorage são descartados', () => {
    const adulterados = [
      dadosExemplo[0],
      { ...dadosExemplo[1], status: '<script>alert(1)</script>' },
      { ...dadosExemplo[2], id: 'abc' },
      null,
      { ...dadosExemplo[3], progresso: 9999 }
    ];
    const armazenamento = criarArmazenamentoFalso({ [CHAVE_PADRAO]: JSON.stringify(adulterados) });
    assert.deepEqual(criarRepositorio(armazenamento).listar(), [dadosExemplo[0]]);
  });

  test('getItem bloqueado (modo privado) devolve exemplo sem quebrar', () => {
    const armazenamento = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => {}
    };
    assert.deepEqual(criarRepositorio(armazenamento).listar(), dadosExemplo);
  });

  test('cota excedida no setItem gera erro amigável', () => {
    const armazenamento = criarArmazenamentoFalso({ [CHAVE_PADRAO]: '[]' });
    armazenamento.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.throws(
      () => criarRepositorio(armazenamento).adicionar(novoProjeto),
      /Não foi possível salvar os dados no navegador/
    );
  });

  test('alterar objeto retornado não altera os dados salvos', () => {
    const repo = criarRepositorio(criarArmazenamentoFalso());
    const lista = repo.listar();
    lista[0].nome = 'Alterado fora do repositório';
    assert.equal(repo.buscar(1).nome, dadosExemplo[0].nome);
  });

  test('não altera o array original de dados de exemplo', () => {
    const copiaOriginal = JSON.parse(JSON.stringify(dadosExemplo));
    const repo = criarRepositorio(criarArmazenamentoFalso());
    repo.listar()[0].nome = 'X';
    repo.remover(2);
    assert.deepEqual(dadosExemplo, copiaOriginal);
  });

  test('chave personalizada isola os dados', () => {
    const armazenamento = criarArmazenamentoFalso();
    const a = criarRepositorio(armazenamento, { chave: 'a' });
    const b = criarRepositorio(armazenamento, { chave: 'b', exemplo: [] });
    a.adicionar(novoProjeto);
    assert.equal(b.listar().length, 0);
  });

  test('atualizarStatus grava o novo status e persiste entre instâncias', () => {
    const armazenamento = criarArmazenamentoFalso();
    const atualizado = criarRepositorio(armazenamento).atualizarStatus(2, 'concluido');
    assert.equal(atualizado.status, 'concluido');
    assert.equal(criarRepositorio(armazenamento).buscar(2).status, 'concluido');
  });

  test('atualizarStatus não altera os demais campos', () => {
    const repo = criarRepositorio(criarArmazenamentoFalso());
    const atualizado = repo.atualizarStatus(1, 'atrasado');
    assert.deepEqual(atualizado, { ...dadosExemplo[0], status: 'atrasado' });
  });

  test('atualizarStatus com status inválido lança ErroValidacao e não grava', () => {
    const repo = criarRepositorio(criarArmazenamentoFalso());
    assert.throws(() => repo.atualizarStatus(1, '<script>'), ErroValidacao);
    assert.equal(repo.buscar(1).status, dadosExemplo[0].status);
  });

  test('atualizarStatus de id inexistente retorna null', () => {
    const repo = criarRepositorio(criarArmazenamentoFalso());
    assert.equal(repo.atualizarStatus(999, 'concluido'), null);
  });
});
