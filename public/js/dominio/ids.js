// Identificadores gerados no próprio aparelho, sem consultar o servidor (seção 5.2 do plano).
// UUID v7 (RFC 9562): 48 bits de tempo em milissegundos + bits aleatórios.
// É ordenável no tempo e praticamente não colide entre aparelhos offline.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function bytesAleatorios(quantidade) {
  return globalThis.crypto.getRandomValues(new Uint8Array(quantidade));
}

// agora e aleatorio são injetáveis para os testes
export function uuidv7({ agora = Date.now(), aleatorio = bytesAleatorios } = {}) {
  const tempo = Math.floor(Number(agora));
  if (!Number.isSafeInteger(tempo) || tempo < 0 || tempo >= 2 ** 48) {
    throw new RangeError(`Carimbo de tempo inválido para UUID v7: ${agora}`);
  }
  const bytes = Uint8Array.from(aleatorio(16));
  if (bytes.length !== 16) throw new RangeError('A fonte aleatória deve fornecer 16 bytes');

  for (let i = 0; i < 6; i += 1) {
    bytes[i] = Math.floor(tempo / 2 ** (8 * (5 - i))) % 256;
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // versão 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 9562

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Aceita UUIDs das versões 1 a 8 em minúsculas (formato canônico)
export function uuidValido(valor) {
  return typeof valor === 'string' && UUID.test(valor);
}

// Milissegundos gravados em um UUID v7 (útil para auditoria e ordenação)
export function tempoDoUuidv7(uuid) {
  if (!uuidValido(uuid) || uuid[14] !== '7') return null;
  return Number.parseInt(uuid.replace(/-/g, '').slice(0, 12), 16);
}
