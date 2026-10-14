// Persistência dos projetos no localStorage (não há banco de dados).
// O armazenamento é injetável: no navegador usa window.localStorage;
// nos testes, um objeto falso com a mesma interface.

import { dadosExemplo } from './dados-exemplo.js';
import { buscarProjeto, normalizarProjeto, proximoId, validarProjeto } from './projetos.js';

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
      return dados.filter((p) => p && Number.isInteger(p.id) && p.id > 0 && validarProjeto(p).valido);
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
