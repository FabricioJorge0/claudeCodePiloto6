// Persistência dos projetos no localStorage (não há banco de dados).
// O armazenamento é injetável: no navegador usa window.localStorage;
// nos testes, um objeto falso com a mesma interface.

import { dadosExemplo } from './dados-exemplo.js';
import { buscarProjeto, normalizarProjeto, proximoId, statusValido, validarProjeto } from './projetos.js';

export const CHAVE_PADRAO = 'gpa:projetos:v1';

export class ErroValidacao extends Error {
  constructor(erros) {
    super(erros.join('; '));
    this.name = 'ErroValidacao';
    this.erros = erros;
  }
}

function copia(valor) {
  return JSON.parse(JSON.stringify(valor));
}

// Municípios fictícios das versões anteriores → municípios reais (para mapa e clima).
// Aplicado na leitura, sem perder os projetos já cadastrados no navegador.
export const MIGRACAO_MUNICIPIOS = {
  'Vale Verde (fictício)': 'Cuiabá - MT',
  'Serra Azul (fictício)': 'Rondonópolis - MT',
  'Campo Largo do Sul (fictício)': 'Sinop - MT',
  'Porto Sereno (fictício)': 'Cáceres - MT'
};

function migrarMunicipios(projetos) {
  let alterou = false;
  for (const p of projetos) {
    const novo = MIGRACAO_MUNICIPIOS[p.municipio];
    if (novo) {
      p.municipio = novo;
      alterou = true;
    }
  }
  return alterou;
}

export function criarRepositorio(armazenamento, { chave = CHAVE_PADRAO, exemplo = dadosExemplo } = {}) {
  function gravar(projetos) {
    try {
      armazenamento.setItem(chave, JSON.stringify(projetos));
    } catch (erro) {
      // Cota excedida ou armazenamento bloqueado (ex.: modo privado)
      throw new Error('Não foi possível salvar os dados no navegador', { cause: erro });
    }
  }

  function restaurar() {
    const projetos = copia(exemplo);
    gravar(projetos);
    return copia(projetos);
  }

  function ler() {
    let bruto = null;
    try {
      bruto = armazenamento.getItem(chave);
    } catch {
      return copia(exemplo);
    }
    if (bruto === null) {
      return restaurar();
    }
    try {
      const dados = JSON.parse(bruto);
      if (!Array.isArray(dados)) return restaurar();
      // Descarta registros corrompidos ou adulterados
      const projetos = dados.filter((p) => p && Number.isInteger(p.id) && p.id > 0 && validarProjeto(p).valido);
      if (migrarMunicipios(projetos)) {
        try {
          gravar(projetos);
        } catch {
          // Sem espaço para gravar: a migração vale só para esta leitura
        }
      }
      return projetos;
    } catch {
      return restaurar();
    }
  }

  return {
    listar() {
      return ler();
    },

    buscar(id) {
      return buscarProjeto(ler(), id);
    },

    adicionar(dados) {
      const projeto = normalizarProjeto(dados ?? {});
      const { valido, erros } = validarProjeto(projeto);
      if (!valido) throw new ErroValidacao(erros);
      const projetos = ler();
      const novo = { id: proximoId(projetos), ...projeto };
      projetos.push(novo);
      gravar(projetos);
      return copia(novo);
    },

    // Retorna o projeto atualizado, ou null se o id não existir
    atualizarStatus(id, status) {
      if (!statusValido(status)) throw new ErroValidacao(['Status inválido']);
      const projetos = ler();
      const projeto = buscarProjeto(projetos, id);
      if (!projeto) return null;
      projeto.status = status;
      gravar(projetos);
      return copia(projeto);
    },

    remover(id) {
      const projetos = ler();
      const restantes = projetos.filter((p) => p.id !== Number(id));
      if (restantes.length === projetos.length) return false;
      gravar(restantes);
      return true;
    },

    restaurar
  };
}
