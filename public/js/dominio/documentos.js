// Validação de CPF, CNPJ e número do CAR (funções puras, seção 3.4 do plano).
// Valida só o FORMATO e os dígitos verificadores. Não confirma se a pessoa,
// a empresa ou o imóvel existem: isso exige consulta a cadastros oficiais (A VALIDAR).

function somenteDigitos(texto) {
  return String(texto ?? '').replace(/\D/g, '');
}

// ---------------------------------------------------------------- CPF

export function normalizarCpf(texto) {
  return somenteDigitos(texto);
}

export function cpfValido(texto) {
  const cpf = normalizarCpf(texto);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digitos = [...cpf].map(Number);
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += digitos[i] * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    if ((resto === 10 ? 0 : resto) !== digitos[tamanho]) return false;
  }
  return true;
}

// ---------------------------------------------------------------- CNPJ
// Suporta o CNPJ numérico e o alfanumérico (12 primeiras posições com letras
// e números, 2 dígitos verificadores numéricos). No alfanumérico, cada caractere
// vale (código ASCII - 48). Conferir com a especificação vigente da Receita Federal (A VALIDAR).

const PESOS_CNPJ = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizarCnpj(texto) {
  return String(texto ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function digitoCnpj(caracteres) {
  const pesos = PESOS_CNPJ.slice(PESOS_CNPJ.length - caracteres.length);
  const soma = caracteres.reduce((total, c, i) => total + (c.charCodeAt(0) - 48) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(texto) {
  const cnpj = normalizarCnpj(texto);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const base = [...cnpj.slice(0, 12)];
  const dv1 = digitoCnpj(base);
  const dv2 = digitoCnpj([...base, String(dv1)]);
  return cnpj.endsWith(`${dv1}${dv2}`);
}

// CPF ou CNPJ: devolve o tipo e o valor normalizado, ou null se inválido
export function identificarDocumento(texto) {
  if (cpfValido(texto)) return { tipo: 'cpf', valor: normalizarCpf(texto) };
  if (cnpjValido(texto)) return { tipo: 'cnpj', valor: normalizarCnpj(texto) };
  return null;
}

// ---------------------------------------------------------------- CAR
// Formato do número de inscrição: UF-CÓDIGO_IBGE_DO_MUNICÍPIO(7)-HASH(32 hexadecimais).
// O hash costuma ser exibido em grupos de 4 separados por ponto, que são removidos.
// Formato a confirmar com a área de geoprocessamento e o SICAR (A VALIDAR).

export const CODIGO_IBGE_UF = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29',
  MG: '31', ES: '32', RJ: '33', SP: '35',
  PR: '41', SC: '42', RS: '43',
  MS: '50', MT: '51', GO: '52', DF: '53'
};

export function normalizarCar(texto) {
  return String(texto ?? '').toUpperCase().replace(/[\s.]/g, '');
}

export function interpretarCar(texto) {
  const car = normalizarCar(texto);
  const partes = car.match(/^([A-Z]{2})-(\d{7})-([0-9A-F]{32})$/);
  if (!partes) return null;
  const [, uf, municipioIbge, hash] = partes;
  if (CODIGO_IBGE_UF[uf] !== municipioIbge.slice(0, 2)) return null;
  return { numero: car, uf, municipioIbge, hash };
}

export function carValido(texto) {
  return interpretarCar(texto) !== null;
}
