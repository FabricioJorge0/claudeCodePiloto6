// Integridade e cadeia de custódia (seção 6.4 do plano).
// A serialização canônica garante o mesmo hash para o mesmo conteúdo,
// independentemente da ordem das chaves, no aparelho e no servidor.

export const HASH_INICIAL = '0'.repeat(64);
const SHA256_HEX = /^[0-9a-f]{64}$/;

export function sha256Valido(valor) {
  return typeof valor === 'string' && SHA256_HEX.test(valor);
}

// JSON com as chaves dos objetos em ordem alfabética. Rejeita valores que o
// JSON não representa de forma estável (undefined, NaN, Infinity, funções).
export function serializarCanonico(valor) {
  if (valor === null || typeof valor === 'boolean' || typeof valor === 'string') {
    return JSON.stringify(valor);
  }
  if (typeof valor === 'number') {
    if (!Number.isFinite(valor)) throw new TypeError('Número não finito não pode ser serializado');
    return JSON.stringify(valor);
  }
  if (Array.isArray(valor)) {
    return `[${valor.map(serializarCanonico).join(',')}]`;
  }
  if (typeof valor === 'object') {
    const chaves = Object.keys(valor).filter((k) => valor[k] !== undefined).sort();
    return `{${chaves.map((k) => `${JSON.stringify(k)}:${serializarCanonico(valor[k])}`).join(',')}}`;
  }
  throw new TypeError(`Tipo não serializável: ${typeof valor}`);
}

// SHA-256 em hexadecimal com WebCrypto (navegador e Node). Assíncrono.
export async function sha256Hex(conteudo) {
  const bytes = typeof conteudo === 'string' ? new TextEncoder().encode(conteudo) : conteudo;
  const resumo = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(resumo)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Conteúdo que entra no hash de um registro de auditoria encadeado.
// hashFn recebe texto e devolve o SHA-256 em hexadecimal (síncrono no servidor).
export function hashEncadeado(hashAnterior, registro, hashFn) {
  if (!sha256Valido(hashAnterior)) throw new TypeError('Hash anterior inválido');
  return hashFn(`${hashAnterior}\n${serializarCanonico(registro)}`);
}

// Confere uma cadeia de registros { registro, hashAnterior, hash } em ordem.
// Detecta alteração, remoção ou inserção de registros no meio da cadeia.
export function verificarCadeia(itens, hashFn) {
  let anterior = HASH_INICIAL;
  for (let i = 0; i < itens.length; i += 1) {
    const { registro, hashAnterior, hash } = itens[i];
    if (hashAnterior !== anterior) {
      return { integra: false, total: itens.length, primeiraFalha: i, motivo: 'Elo quebrado (hash anterior não confere)' };
    }
    if (hashEncadeado(hashAnterior, registro, hashFn) !== hash) {
      return { integra: false, total: itens.length, primeiraFalha: i, motivo: 'Conteúdo alterado (hash não confere)' };
    }
    anterior = hash;
  }
  return { integra: true, total: itens.length, primeiraFalha: null, motivo: null };
}
