// Localização e clima do município (Open-Meteo: gratuito e sem chave de API).
// Adaptado do Projeto_clima: troca a OpenWeather (que exigia chave exposta no
// código) pelo Open-Meteo, valida as respostas e não usa innerHTML.
// O fetch é injetável para que os testes não dependam da rede.

export const URL_GEOCODIFICACAO = 'https://geocoding-api.open-meteo.com/v1/search';
export const URL_PREVISAO = 'https://api.open-meteo.com/v1/forecast';
const TEMPO_LIMITE_MS = 8000;

export const ESTADOS = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
};

export class ErroClima extends Error {
  constructor(mensagem, { cause } = {}) {
    super(mensagem, { cause });
    this.name = 'ErroClima';
  }
}

// "Cuiabá - MT" → { nome: 'Cuiabá', uf: 'MT' }. Sem UF válida, uf fica null.
export function interpretarMunicipio(texto) {
  const limpo = String(texto ?? '').trim();
  const partes = limpo.match(/^(.+?)\s*[-–/,]\s*([A-Za-z]{2})$/);
  if (partes && ESTADOS[partes[2].toUpperCase()]) {
    return { nome: partes[1].trim(), uf: partes[2].toUpperCase() };
  }
  return { nome: limpo, uf: null };
}

function normalizar(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Entre os resultados da busca, escolhe o do Brasil, com o mesmo nome e (se informada) da mesma UF
export function escolherLocal(resultados, { nome, uf }) {
  if (!Array.isArray(resultados)) return null;
  const estado = uf ? normalizar(ESTADOS[uf]) : null;
  const candidatos = resultados.filter((r) => r
    && r.country_code === 'BR'
    && Number.isFinite(r.latitude) && Number.isFinite(r.longitude)
    && normalizar(r.name) === normalizar(nome)
    && (!estado || normalizar(r.admin1) === estado));
  const local = candidatos[0];
  if (!local) return null;
  return { nome: local.name, estado: local.admin1 ?? null, latitude: local.latitude, longitude: local.longitude };
}

// Códigos WMO usados pelo Open-Meteo
const CONDICOES = [
  [[0], 'Céu limpo', '☀️'],
  [[1], 'Predominantemente limpo', '🌤️'],
  [[2], 'Parcialmente nublado', '⛅'],
  [[3], 'Nublado', '☁️'],
  [[45, 48], 'Nevoeiro', '🌫️'],
  [[51, 53, 55], 'Garoa', '🌦️'],
  [[56, 57], 'Garoa congelante', '🌧️'],
  [[61, 63, 65], 'Chuva', '🌧️'],
  [[66, 67], 'Chuva congelante', '🌧️'],
  [[71, 73, 75, 77], 'Neve', '🌨️'],
  [[80, 81, 82], 'Pancadas de chuva', '🌦️'],
  [[85, 86], 'Pancadas de neve', '🌨️'],
  [[95], 'Trovoada', '⛈️'],
  [[96, 99], 'Trovoada com granizo', '⛈️']
];
const CODIGOS_CHUVA = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

export function descreverTempo(codigo) {
  const encontrada = CONDICOES.find(([codigos]) => codigos.includes(codigo));
  return {
    descricao: encontrada ? encontrada[1] : 'Condição desconhecida',
    icone: encontrada ? encontrada[2] : '🌡️',
    chuvoso: CODIGOS_CHUVA.has(codigo)
  };
}

const PONTOS_CARDEAIS = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
const NOMES_CARDEAIS = {
  N: 'Norte', NE: 'Nordeste', L: 'Leste', SE: 'Sudeste', S: 'Sul', SO: 'Sudoeste', O: 'Oeste', NO: 'Noroeste'
};

// Direção de onde o vento sopra (graus meteorológicos) → ponto cardeal
export function direcaoCardeal(graus) {
  const normalizado = ((Number(graus) % 360) + 360) % 360;
  const sigla = PONTOS_CARDEAIS[Math.round(normalizado / 45) % 8];
  return { sigla, nome: NOMES_CARDEAIS[sigla] };
}

async function obterJson(url, fetchFn) {
  const controle = new AbortController();
  const temporizador = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  let resposta;
  try {
    resposta = await fetchFn(url, { signal: controle.signal });
  } catch (erro) {
    throw new ErroClima('Serviço de clima indisponível', { cause: erro });
  } finally {
    clearTimeout(temporizador);
  }
  if (!resposta.ok) throw new ErroClima(`Serviço de clima respondeu ${resposta.status}`);
  try {
    return await resposta.json();
  } catch (erro) {
    throw new ErroClima('Resposta inválida do serviço de clima', { cause: erro });
  }
}

const cacheLocais = new Map();

// Retorna { nome, estado, latitude, longitude } ou null se o município não for encontrado
export async function buscarLocalizacao(municipio, { fetchFn = globalThis.fetch, cache = cacheLocais } = {}) {
  const alvo = interpretarMunicipio(municipio);
  if (alvo.nome.length < 2) return null;
  const chave = `${normalizar(alvo.nome)}|${alvo.uf ?? ''}`;
  if (cache.has(chave)) return cache.get(chave);

  const parametros = new URLSearchParams({
    name: alvo.nome, count: '10', language: 'pt', format: 'json', countryCode: 'BR'
  });
  const dados = await obterJson(`${URL_GEOCODIFICACAO}?${parametros}`, fetchFn);
  const local = escolherLocal(dados?.results, alvo);
  cache.set(chave, local);
  return local;
}

function numero(valor, nome) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new ErroClima(`Resposta do serviço de clima sem ${nome} válido`);
  }
  return valor;
}

export async function buscarClima({ latitude, longitude }, { fetchFn = globalThis.fetch } = {}) {
  const parametros = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'kmh',
    timezone: 'auto'
  });
  const dados = await obterJson(`${URL_PREVISAO}?${parametros}`, fetchFn);
  const atual = dados?.current;
  if (!atual || typeof atual !== 'object') throw new ErroClima('Resposta do serviço de clima sem dados atuais');

  const codigo = numero(atual.weather_code, 'código do tempo');
  const precipitacao = numero(atual.precipitation, 'precipitação');
  const tempo = descreverTempo(codigo);
  const direcao = numero(atual.wind_direction_10m, 'direção do vento');
  return {
    temperatura: numero(atual.temperature_2m, 'temperatura'),
    umidade: numero(atual.relative_humidity_2m, 'umidade'),
    precipitacao,
    chovendo: tempo.chuvoso || precipitacao > 0,
    descricao: tempo.descricao,
    icone: tempo.icone,
    ventoKmh: numero(atual.wind_speed_10m, 'velocidade do vento'),
    ventoGraus: direcao,
    ventoDirecao: direcaoCardeal(direcao),
    horario: typeof atual.time === 'string' ? atual.time : null
  };
}
