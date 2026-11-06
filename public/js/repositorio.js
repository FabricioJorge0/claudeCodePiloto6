// Persistência dos projetos no localStorage (não há banco de dados no protótipo).
// O armazenamento é injetável: no navegador usa window.localStorage;
// nos testes, um objeto falso com a mesma interface.
//
// Esquema v2 (correções do diagnóstico do PLANO_EVOLUCAO_SEMA.md):
// - D1: dados ilegíveis NUNCA são sobrescritos pelos exemplos; vão para a quarentena.
// - D2: registros inválidos não são descartados em silêncio; vão para a quarentena.
// - D3: cada projeto tem um uuid (UUID v7), único entre aparelhos; o id numérico é só o código local.
// - D4: exclusão lógica (excluidoEm + motivo); o código numérico nunca é reaproveitado.
// - D5/D6: criadoEm, atualizadoEm, versao e histórico de alterações em cada registro.
// - D8: versão de esquema gravada e migrações numeradas (v1 → v2).

import { dadosExemplo } from './dados-exemplo.js';
import { uuidv7, uuidValido } from './dominio/ids.js';
import { dataHoraValida } from './dominio/relogio.js';
import { buscarProjeto, normalizarProjeto, proximoId, statusValido, validarProjeto } from './projetos.js';

export const VERSAO_ESQUEMA = 2;
export const CHAVE_PADRAO = 'gpa:projetos:v2';
export const CHAVE_V1 = 'gpa:projetos:v1';
export const LIMITE_HISTORICO = 100;

export class ErroValidacao extends Error {
  constructor(erros) {
    super(erros.join('; '));
    this.name = 'ErroValidacao';
    this.erros = erros;
  }
}

export class ErroArmazenamento extends Error {
  constructor(mensagem, { cause } = {}) {
    super(mensagem, { cause });
    this.name = 'ErroArmazenamento';
  }
}

function copia(valor) {
  return JSON.parse(JSON.stringify(valor));
}

// Municípios fictícios das versões anteriores → municípios reais (para mapa e clima).
// Aplicado na migração v1 → v2, sem perder os projetos já cadastrados no navegador.
export const MIGRACAO_MUNICIPIOS = {
  'Vale Verde (fictício)': 'Cuiabá - MT',
  'Serra Azul (fictício)': 'Rondonópolis - MT',
  'Campo Largo do Sul (fictício)': 'Sinop - MT',
  'Porto Sereno (fictício)': 'Cáceres - MT'
};

const CAMPOS_NEGOCIO = ['nome', 'municipio', 'responsavel', 'status', 'prazo', 'orcamento', 'progresso'];

// Só os campos de negócio (útil para comparar e exibir)
export function camposDeNegocio(projeto) {
  return Object.fromEntries([['id', projeto.id], ...CAMPOS_NEGOCIO.map((c) => [c, projeto[c]])]);
}

// Registro completo do esquema v2: negócio + metadados válidos
export function validarRegistro(p) {
  const erros = [];
  if (!p || typeof p !== 'object') return { valido: false, erros: ['Registro ausente'] };
  if (!Number.isInteger(p.id) || p.id <= 0) erros.push('Código local inválido');
  if (!uuidValido(p.uuid)) erros.push('Identificador (uuid) inválido');
  if (!dataHoraValida(p.criadoEm) || !dataHoraValida(p.atualizadoEm)) erros.push('Datas de criação/alteração inválidas');
  if (!Number.isInteger(p.versao) || p.versao < 1) erros.push('Versão inválida');
  if (p.excluidoEm !== null && !dataHoraValida(p.excluidoEm)) erros.push('Data de exclusão inválida');
  if (!Array.isArray(p.historico)) erros.push('Histórico inválido');
  erros.push(...validarProjeto(p).erros);
  return { valido: erros.length === 0, erros };
}

// ---------------------------------------------------------------- Migrações

function registroNovo(dados, { id, agora, gerarUuid }) {
  return {
    id,
    uuid: gerarUuid(),
    ...Object.fromEntries(CAMPOS_NEGOCIO.map((c) => [c, dados[c]])),
    criadoEm: agora,
    atualizadoEm: agora,
    versao: 1,
    excluidoEm: null,
    motivoExclusao: null,
    historico: [{ em: agora, acao: 'criado' }]
  };
}

// v1 (lista de projetos sem metadados) → v2 (envelope com metadados)
export function migrarV1(listaV1, { agora, gerarUuid }) {
  const registros = [];
  const invalidos = [];
  for (const item of Array.isArray(listaV1) ? listaV1 : []) {
    const p = item && typeof item === 'object' ? { ...item } : item;
    if (p && MIGRACAO_MUNICIPIOS[p.municipio]) p.municipio = MIGRACAO_MUNICIPIOS[p.municipio];
    if (p && Number.isInteger(p.id) && p.id > 0 && validarProjeto(p).valido) {
      const registro = registroNovo(p, { id: p.id, agora, gerarUuid });
      registro.historico = [{ em: agora, acao: 'migrado do esquema v1' }];
      registros.push(registro);
    } else {
      invalidos.push({ registro: item, motivo: 'Registro inválido no esquema v1' });
    }
  }
  return { envelope: { versaoEsquema: VERSAO_ESQUEMA, projetos: registros, quarentena: [] }, invalidos };
}

// ---------------------------------------------------------------- Repositório

export function criarRepositorio(armazenamento, {
  chave = CHAVE_PADRAO,
  chaveV1 = chave === CHAVE_PADRAO ? CHAVE_V1 : null,
  exemplo = dadosExemplo,
  relogio = () => new Date().toISOString(),
  gerarUuid = () => uuidv7()
} = {}) {
  // Sem localStorage (ex.: bloqueado): os dados ficam só em memória nesta aba
  let memoria = null;

  function gravar(envelope) {
    try {
      armazenamento.setItem(chave, JSON.stringify(envelope));
    } catch (erro) {
      // Cota excedida ou armazenamento bloqueado (ex.: modo privado)
      throw new Error('Não foi possível salvar os dados no navegador', { cause: erro });
    }
  }

  function semear() {
    const agora = relogio();
    return {
      versaoEsquema: VERSAO_ESQUEMA,
      projetos: exemplo.map((p) => registroNovo(p, { id: p.id, agora, gerarUuid })),
      quarentena: []
    };
  }

  // Preserva o conteúdo ilegível em uma chave própria ANTES de recomeçar (D1)
  function preservarIlegivel(bruto, motivo) {
    const chaveCopia = `${chave}:ilegivel:${relogio()}`;
    try {
      armazenamento.setItem(chaveCopia, bruto);
    } catch (erro) {
      throw new ErroArmazenamento('Os dados salvos estão danificados e não há espaço para guardar uma cópia. Nada foi apagado.', { cause: erro });
    }
    const envelope = { versaoEsquema: VERSAO_ESQUEMA, projetos: [], quarentena: [{ em: relogio(), motivo, copiaEm: chaveCopia }] };
    gravar(envelope);
    return envelope;
  }

  function lerBruto(k) {
    try {
      return { ok: true, valor: armazenamento.getItem(k) };
    } catch {
      return { ok: false, valor: null };
    }
  }

  function carregar() {
    if (memoria) return memoria;
    const principal = lerBruto(chave);
    if (!principal.ok) {
      memoria = semear();
      return memoria;
    }

    if (principal.valor === null) {
      const antigo = chaveV1 ? lerBruto(chaveV1) : { ok: true, valor: null };
      if (antigo.ok && antigo.valor !== null) {
        let lista;
        try {
          lista = JSON.parse(antigo.valor);
        } catch {
          return preservarIlegivel(antigo.valor, 'Dados do esquema v1 ilegíveis');
        }
        const { envelope, invalidos } = migrarV1(lista, { agora: relogio(), gerarUuid });
        envelope.quarentena = invalidos.map((i) => ({ em: relogio(), ...i }));
        try {
          gravar(envelope);
        } catch {
          // Sem espaço: a migração fica em memória nesta aba; v1 continua intacto
          memoria = envelope;
        }
        return envelope;
      }
      const envelope = semear();
      try {
        gravar(envelope);
      } catch {
        // Sem espaço: os exemplos ficam só em memória nesta aba
        memoria = envelope;
      }
      return envelope;
    }

    let envelope;
    try {
      envelope = JSON.parse(principal.valor);
    } catch {
      return preservarIlegivel(principal.valor, 'Dados ilegíveis (JSON corrompido)');
    }
    if (!envelope || typeof envelope !== 'object' || !Array.isArray(envelope.projetos)) {
      return preservarIlegivel(principal.valor, 'Formato de dados desconhecido');
    }
    if (envelope.versaoEsquema > VERSAO_ESQUEMA) {
      throw new ErroArmazenamento('Os dados foram gravados por uma versão mais nova do sistema. Atualize a página; nada foi alterado.');
    }

    // D2: registros inválidos vão para a quarentena, com motivo
    const validos = [];
    const novosNaQuarentena = [];
    for (const p of envelope.projetos) {
      const { valido, erros } = validarRegistro(p);
      if (valido) validos.push(p);
      else novosNaQuarentena.push({ em: relogio(), registro: p, motivo: erros.join('; ') });
    }
    const resultado = {
      versaoEsquema: VERSAO_ESQUEMA,
      projetos: validos,
      quarentena: [...(Array.isArray(envelope.quarentena) ? envelope.quarentena : []), ...novosNaQuarentena]
    };
    if (novosNaQuarentena.length > 0) {
      try {
        gravar(resultado);
      } catch {
        // Sem espaço: os registros continuam no armazenamento original, só não aparecem
      }
    }
    return resultado;
  }

  function salvar(envelope) {
    if (memoria) {
      memoria = envelope;
      return;
    }
    gravar(envelope);
  }

  function ativos(envelope) {
    return envelope.projetos.filter((p) => p.excluidoEm === null);
  }

  function registrarAlteracao(projeto, evento) {
    const agora = relogio();
    projeto.atualizadoEm = agora;
    projeto.versao += 1;
    projeto.historico = [...projeto.historico, { em: agora, ...evento }].slice(-LIMITE_HISTORICO);
  }

  return {
    listar() {
      return copia(ativos(carregar()));
    },

    buscar(id) {
      return copia(buscarProjeto(ativos(carregar()), id));
    },

    // Registros com problema, para exibir um aviso e permitir recuperação manual
    quarentena() {
      return copia(carregar().quarentena);
    },

    // false quando os dados estão só em memória (sem localStorage disponível)
    persistente() {
      carregar();
      return memoria === null;
    },

    adicionar(dados) {
      const projeto = normalizarProjeto(dados ?? {});
      const { valido, erros } = validarProjeto(projeto);
      if (!valido) throw new ErroValidacao(erros);
      const envelope = carregar();
      // Inclui os excluídos e os da quarentena: um código nunca é reaproveitado
      const usados = [...envelope.projetos, ...envelope.quarentena.map((q) => q.registro).filter((r) => Number.isInteger(r?.id))];
      const novo = registroNovo(projeto, { id: proximoId(usados), agora: relogio(), gerarUuid });
      salvar({ ...envelope, projetos: [...envelope.projetos, novo] });
      return copia(novo);
    },

    // Retorna o projeto atualizado, ou null se o id não existir
    atualizarStatus(id, status) {
      if (!statusValido(status)) throw new ErroValidacao(['Status inválido']);
      const envelope = carregar();
      const projeto = buscarProjeto(ativos(envelope), id);
      if (!projeto) return null;
      if (projeto.status !== status) {
        registrarAlteracao(projeto, { acao: 'status', de: projeto.status, para: status });
        projeto.status = status;
        salvar(envelope);
      }
      return copia(projeto);
    },

    // Exclusão lógica: o projeto sai da lista, mas continua registrado
    remover(id, motivo = 'Excluído pelo usuário') {
      const envelope = carregar();
      const projeto = buscarProjeto(ativos(envelope), id);
      if (!projeto) return false;
      const agora = relogio();
      registrarAlteracao(projeto, { acao: 'excluido', motivo });
      projeto.excluidoEm = agora;
      projeto.motivoExclusao = motivo;
      salvar(envelope);
      return true;
    },

    listarExcluidos() {
      return copia(carregar().projetos.filter((p) => p.excluidoEm !== null));
    }
  };
}
