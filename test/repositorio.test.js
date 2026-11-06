import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dadosExemplo } from '../public/js/dados-exemplo.js';
import { uuidValido } from '../public/js/dominio/ids.js';
import {
  CHAVE_PADRAO, CHAVE_V1, ErroArmazenamento, ErroValidacao, MIGRACAO_MUNICIPIOS, VERSAO_ESQUEMA,
  camposDeNegocio, criarRepositorio, migrarV1, validarRegistro
} from '../public/js/repositorio.js';

// Simula o localStorage do navegador
function criarArmazenamentoFalso(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    removeItem: (k) => dados.delete(k),
    bruto: (k) => dados.get(k),
    chaves: () => [...dados.keys()]
  };
}

// Relógio e gerador de UUID determinísticos
function opcoesFixas() {
  let segundos = 0;
  let contador = 0;
  return {
    relogio: () => new Date(Date.UTC(2026, 10, 6, 12, 0, segundos++)).toISOString(),
    gerarUuid: () => `0190a000-0000-7000-8000-${String(++contador).padStart(12, '0')}`
  };
}

function repo(armazenamento = criarArmazenamentoFalso(), opcoes = {}) {
  return criarRepositorio(armazenamento, { ...opcoesFixas(), ...opcoes });
}

const negocio = (lista) => lista.map(camposDeNegocio);

const novoProjeto = {
  nome: 'Viveiro de Mudas Fictício',
  municipio: 'Cidade Imaginária',
  responsavel: 'Equipe Teste',
  status: 'planejamento',
  prazo: '2027-06-01',
  orcamento: 5000,
  progresso: 0
};

describe('repositório: leitura e primeira visita', () => {
  test('primeira visita carrega os exemplos com metadados e grava o esquema v2', () => {
    const armazenamento = criarArmazenamentoFalso();
    const lista = repo(armazenamento).listar();
    assert.deepEqual(negocio(lista), dadosExemplo);
    for (const p of lista) {
      assert.ok(uuidValido(p.uuid));
      assert.equal(p.versao, 1);
      assert.equal(p.excluidoEm, null);
      assert.deepEqual(validarRegistro(p), { valido: true, erros: [] });
    }
    const gravado = JSON.parse(armazenamento.bruto(CHAVE_PADRAO));
    assert.equal(gravado.versaoEsquema, VERSAO_ESQUEMA);
    assert.equal(gravado.projetos.length, dadosExemplo.length);
  });

  test('uuids são únicos', () => {
    const lista = criarRepositorio(criarArmazenamentoFalso()).listar();
    assert.equal(new Set(lista.map((p) => p.uuid)).size, lista.length);
  });

  test('lista vazia gravada é respeitada (não recarrega exemplo)', () => {
    const armazenamento = criarArmazenamentoFalso({
      [CHAVE_PADRAO]: JSON.stringify({ versaoEsquema: 2, projetos: [], quarentena: [] })
    });
    assert.deepEqual(repo(armazenamento).listar(), []);
  });

  test('alterar objeto retornado não altera os dados salvos', () => {
    const r = repo();
    r.listar()[0].nome = 'Alterado fora do repositório';
    assert.equal(r.buscar(1).nome, dadosExemplo[0].nome);
  });

  test('não altera o array original de dados de exemplo', () => {
    const copiaOriginal = JSON.parse(JSON.stringify(dadosExemplo));
    const r = repo();
    r.listar()[0].nome = 'X';
    r.remover(2);
    assert.deepEqual(dadosExemplo, copiaOriginal);
  });

  test('chave personalizada isola os dados', () => {
    const armazenamento = criarArmazenamentoFalso();
    const a = repo(armazenamento, { chave: 'a' });
    const b = repo(armazenamento, { chave: 'b', exemplo: [] });
    a.adicionar(novoProjeto);
    assert.equal(b.listar().length, 0);
  });
});

describe('repositório: D1 — dados ilegíveis nunca são sobrescritos', () => {
  test('JSON corrompido é preservado em cópia e NÃO é trocado pelos exemplos', () => {
    const armazenamento = criarArmazenamentoFalso({ [CHAVE_PADRAO]: '{isso não é json' });
    const r = repo(armazenamento);
    assert.deepEqual(r.listar(), []);

    const [q] = r.quarentena();
    assert.match(q.motivo, /ilegíveis/);
    assert.equal(armazenamento.bruto(q.copiaEm), '{isso não é json');
  });

  test('formato desconhecido também é preservado', () => {
    const armazenamento = criarArmazenamentoFalso({ [CHAVE_PADRAO]: '{"a":1}' });
    const r = repo(armazenamento);
    assert.deepEqual(r.listar(), []);
    assert.equal(armazenamento.bruto(r.quarentena()[0].copiaEm), '{"a":1}');
  });

  test('sem espaço para a cópia, lança erro e não apaga nada', () => {
    const armazenamento = criarArmazenamentoFalso({ [CHAVE_PADRAO]: '{corrompido' });
    armazenamento.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.throws(() => repo(armazenamento).listar(), ErroArmazenamento);
    assert.equal(armazenamento.bruto(CHAVE_PADRAO), '{corrompido');
  });

  test('dados de versão mais nova não são tocados', () => {
    const conteudo = JSON.stringify({ versaoEsquema: 99, projetos: [] });
    const armazenamento = criarArmazenamentoFalso({ [CHAVE_PADRAO]: conteudo });
    assert.throws(() => repo(armazenamento).listar(), /versão mais nova/);
    assert.equal(armazenamento.bruto(CHAVE_PADRAO), conteudo);
  });

  test('não existe mais a função restaurar (que sobrescrevia tudo)', () => {
    assert.equal(repo().restaurar, undefined);
  });
});

describe('repositório: D2 — registros inválidos vão para a quarentena', () => {
  test('registro adulterado sai da lista, vai para a quarentena com motivo e é gravado assim', () => {
    const armazenamento = criarArmazenamentoFalso();
    const r = repo(armazenamento);
    r.listar(); // primeira visita grava os exemplos
    const envelope = JSON.parse(armazenamento.bruto(CHAVE_PADRAO));
    envelope.projetos[1].status = '<script>alert(1)</script>';
    envelope.projetos[2].uuid = 'abc';
    armazenamento.setItem(CHAVE_PADRAO, JSON.stringify(envelope));

    assert.equal(r.listar().length, dadosExemplo.length - 2);
    const quarentena = r.quarentena();
    assert.equal(quarentena.length, 2);
    assert.match(quarentena[0].motivo, /Status inválido/);
    assert.match(quarentena[1].motivo, /uuid/);
    assert.equal(quarentena[1].registro.nome, dadosExemplo[2].nome);

    // A próxima leitura não duplica a quarentena
    assert.equal(repo(armazenamento).quarentena().length, 2);
  });

  test('código de registro em quarentena não é reaproveitado', () => {
    const armazenamento = criarArmazenamentoFalso();
    const r = repo(armazenamento);
    r.listar(); // primeira visita grava os exemplos
    const envelope = JSON.parse(armazenamento.bruto(CHAVE_PADRAO));
    envelope.projetos[5].progresso = 999; // id 6, o maior
    armazenamento.setItem(CHAVE_PADRAO, JSON.stringify(envelope));
    assert.equal(r.adicionar(novoProjeto).id, 7);
  });
});

describe('repositório: D3/D5/D6 — identificadores e metadados', () => {
  test('adicionar grava com código novo, uuid, metadados e persiste entre instâncias', () => {
    const armazenamento = criarArmazenamentoFalso();
    const novo = repo(armazenamento).adicionar(novoProjeto);
    assert.equal(novo.id, dadosExemplo.length + 1);
    assert.ok(uuidValido(novo.uuid));
    assert.equal(novo.versao, 1);
    assert.deepEqual(novo.historico.map((h) => h.acao), ['criado']);

    const outraAba = repo(armazenamento);
    assert.deepEqual(outraAba.buscar(novo.id), novo);
  });

  test('adicionar ignora id, uuid e metadados enviados pelo usuário', () => {
    const r = repo();
    const novo = r.adicionar({ ...novoProjeto, id: 1, uuid: 'x', versao: 99, excluidoEm: 'ontem' });
    assert.notEqual(novo.id, 1);
    assert.notEqual(novo.uuid, 'x');
    assert.equal(novo.versao, 1);
    assert.equal(novo.excluidoEm, null);
  });

  test('adicionar dados inválidos lança ErroValidacao e não grava', () => {
    const r = repo();
    assert.throws(
      () => r.adicionar({ ...novoProjeto, nome: '', progresso: 200 }),
      (erro) => erro instanceof ErroValidacao && erro.erros.length === 2
    );
    assert.equal(r.listar().length, dadosExemplo.length);
  });

  test('adicionar sem dados lança ErroValidacao', () => {
    assert.throws(() => repo().adicionar(undefined), ErroValidacao);
  });

  test('cota excedida no setItem gera erro amigável', () => {
    const armazenamento = criarArmazenamentoFalso({
      [CHAVE_PADRAO]: JSON.stringify({ versaoEsquema: 2, projetos: [], quarentena: [] })
    });
    armazenamento.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.throws(() => repo(armazenamento).adicionar(novoProjeto), /Não foi possível salvar os dados no navegador/);
  });

  test('atualizarStatus grava, incrementa a versão e registra de/para no histórico', () => {
    const armazenamento = criarArmazenamentoFalso();
    const atualizado = repo(armazenamento).atualizarStatus(2, 'concluido');
    assert.equal(atualizado.status, 'concluido');
    assert.equal(atualizado.versao, 2);
    assert.deepEqual(atualizado.historico.at(-1), {
      em: atualizado.atualizadoEm, acao: 'status', de: 'planejamento', para: 'concluido'
    });
    assert.ok(atualizado.atualizadoEm > atualizado.criadoEm);
    assert.equal(repo(armazenamento).buscar(2).status, 'concluido');
  });

  test('atualizarStatus não altera os campos de negócio restantes', () => {
    const atualizado = repo().atualizarStatus(1, 'atrasado');
    assert.deepEqual(camposDeNegocio(atualizado), { ...dadosExemplo[0], status: 'atrasado' });
  });

  test('atualizarStatus para o mesmo status não cria versão nova', () => {
    const atual = repo().atualizarStatus(1, dadosExemplo[0].status);
    assert.equal(atual.versao, 1);
  });

  test('atualizarStatus com status inválido lança ErroValidacao e não grava', () => {
    const r = repo();
    assert.throws(() => r.atualizarStatus(1, '<script>'), ErroValidacao);
    assert.equal(r.buscar(1).status, dadosExemplo[0].status);
  });

  test('atualizarStatus de id inexistente retorna null', () => {
    assert.equal(repo().atualizarStatus(999, 'concluido'), null);
  });
});

describe('repositório: D4 — exclusão lógica', () => {
  test('remover tira da lista, mas mantém o registro com data e motivo', () => {
    const armazenamento = criarArmazenamentoFalso();
    const r = repo(armazenamento);
    assert.equal(r.remover(1, 'Cadastro em duplicidade'), true);
    assert.equal(r.buscar(1), null);
    assert.equal(r.listar().length, dadosExemplo.length - 1);

    const [excluido] = repo(armazenamento).listarExcluidos();
    assert.equal(excluido.id, 1);
    assert.equal(excluido.motivoExclusao, 'Cadastro em duplicidade');
    assert.ok(excluido.excluidoEm);
    assert.equal(excluido.historico.at(-1).acao, 'excluido');
  });

  test('remover de novo ou id inexistente retorna false', () => {
    const r = repo();
    r.remover(1);
    assert.equal(r.remover(1), false);
    assert.equal(r.remover(999), false);
  });

  test('código de projeto excluído nunca é reaproveitado', () => {
    const r = repo();
    r.remover(6);
    assert.equal(r.adicionar(novoProjeto).id, 7);
  });

  test('status de projeto excluído não pode ser alterado', () => {
    const r = repo();
    r.remover(2);
    assert.equal(r.atualizarStatus(2, 'concluido'), null);
  });
});

describe('repositório: D8 — migração do esquema v1', () => {
  test('migra a lista v1 para v2, com municípios reais, sem perder projetos e sem apagar o v1', () => {
    const antigos = [
      { ...dadosExemplo[0], municipio: 'Vale Verde (fictício)' },
      { ...dadosExemplo[2], municipio: 'Campo Largo do Sul (fictício)' },
      { ...novoProjeto, id: 7, municipio: 'Cidade Imaginária' }
    ];
    const v1 = JSON.stringify(antigos);
    const armazenamento = criarArmazenamentoFalso({ [CHAVE_V1]: v1 });
    const lista = repo(armazenamento).listar();

    assert.deepEqual(lista.map((p) => p.municipio), ['Cuiabá - MT', 'Sinop - MT', 'Cidade Imaginária']);
    assert.deepEqual(lista.map((p) => p.id), [1, 3, 7]);
    assert.equal(lista[0].historico[0].acao, 'migrado do esquema v1');
    assert.equal(JSON.parse(armazenamento.bruto(CHAVE_PADRAO)).versaoEsquema, 2);
    assert.equal(armazenamento.bruto(CHAVE_V1), v1);
  });

  test('registros v1 inválidos vão para a quarentena na migração', () => {
    const antigos = [dadosExemplo[0], { ...dadosExemplo[1], status: 'xyz' }, null, { ...dadosExemplo[2], id: 'abc' }];
    const r = repo(criarArmazenamentoFalso({ [CHAVE_V1]: JSON.stringify(antigos) }));
    assert.equal(r.listar().length, 1);
    assert.equal(r.quarentena().length, 3);
  });

  test('v1 ilegível é preservado em cópia', () => {
    const armazenamento = criarArmazenamentoFalso({ [CHAVE_V1]: '[{quebrado' });
    const r = repo(armazenamento);
    assert.deepEqual(r.listar(), []);
    assert.equal(armazenamento.bruto(r.quarentena()[0].copiaEm), '[{quebrado');
  });

  test('falha ao gravar a migração não impede a leitura', () => {
    const armazenamento = criarArmazenamentoFalso({
      [CHAVE_V1]: JSON.stringify([{ ...dadosExemplo[0], municipio: 'Vale Verde (fictício)' }])
    });
    armazenamento.setItem = () => { throw new Error('QuotaExceededError'); };
    const r = repo(armazenamento);
    assert.equal(r.listar()[0].municipio, 'Cuiabá - MT');
    assert.equal(r.persistente(), false);
  });

  test('tabela de migração cobre os 4 municípios fictícios antigos', () => {
    assert.deepEqual(Object.keys(MIGRACAO_MUNICIPIOS).sort(), [
      'Campo Largo do Sul (fictício)', 'Porto Sereno (fictício)', 'Serra Azul (fictício)', 'Vale Verde (fictício)'
    ]);
  });

  test('migrarV1 é pura e aceita entrada que não é lista', () => {
    const { envelope, invalidos } = migrarV1({ a: 1 }, opcoesFixas());
    assert.deepEqual(envelope.projetos, []);
    assert.deepEqual(invalidos, []);
  });
});

describe('repositório: D9 — armazenamento indisponível', () => {
  test('getItem bloqueado (modo privado): usa exemplos em memória e informa que não é persistente', () => {
    const armazenamento = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); }
    };
    const r = repo(armazenamento);
    assert.deepEqual(negocio(r.listar()), dadosExemplo);
    assert.equal(r.persistente(), false);
    // Continua funcionando em memória durante a sessão
    r.adicionar(novoProjeto);
    assert.equal(r.listar().length, dadosExemplo.length + 1);
  });

  test('com localStorage funcionando, é persistente', () => {
    assert.equal(repo().persistente(), true);
  });
});
