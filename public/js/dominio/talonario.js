// Talonário digital: blocos de numeração reservados por aparelho (seção 3.7 do plano).
// O servidor reserva o bloco enquanto o aparelho está online; offline, o aparelho
// consome os números em sequência. Um número usado nunca volta a ficar disponível.
// O formato oficial do número (prefixo, ano, unidade) é A VALIDAR (pergunta P12).

export const TIPOS_DOCUMENTO = [
  'auto_infracao', 'termo_embargo', 'termo_apreensao', 'notificacao', 'termo_constatacao'
];

export const TAMANHO_BLOCO_PADRAO = 50;
export const TAMANHO_BLOCO_MAXIMO = 500;
export const LIMITE_NOVO_BLOCO_PADRAO = 10;

export function tipoDocumentoValido(tipo) {
  return TIPOS_DOCUMENTO.includes(tipo);
}

export function validarBloco(bloco) {
  return Boolean(bloco)
    && tipoDocumentoValido(bloco.tipo)
    && Number.isSafeInteger(bloco.inicio) && bloco.inicio > 0
    && Number.isSafeInteger(bloco.fim) && bloco.fim >= bloco.inicio;
}

export function blocoContem(bloco, numero) {
  return validarBloco(bloco) && Number.isSafeInteger(numero) && numero >= bloco.inicio && numero <= bloco.fim;
}

// Próximo número livre considerando todos os blocos do aparelho para o tipo.
// usados: conjunto (ou lista) de números já consumidos, inclusive cancelados.
export function proximoNumero(blocos, tipo, usados) {
  const consumidos = usados instanceof Set ? usados : new Set(usados);
  const doTipo = blocos.filter((b) => validarBloco(b) && b.tipo === tipo && !b.inutilizadoEm)
    .sort((a, b) => a.inicio - b.inicio);
  for (const bloco of doTipo) {
    for (let n = bloco.inicio; n <= bloco.fim; n += 1) {
      if (!consumidos.has(n)) return n;
    }
  }
  return null;
}

export function numerosRestantes(blocos, tipo, usados) {
  const consumidos = usados instanceof Set ? usados : new Set(usados);
  return blocos
    .filter((b) => validarBloco(b) && b.tipo === tipo && !b.inutilizadoEm)
    .reduce((total, b) => {
      let livres = 0;
      for (let n = b.inicio; n <= b.fim; n += 1) if (!consumidos.has(n)) livres += 1;
      return total + livres;
    }, 0);
}

export function precisaNovoBloco(blocos, tipo, usados, limite = LIMITE_NOVO_BLOCO_PADRAO) {
  return numerosRestantes(blocos, tipo, usados) <= limite;
}
