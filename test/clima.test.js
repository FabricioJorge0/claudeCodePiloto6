import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ErroClima,
  URL_GEOCODIFICACAO,
  URL_PREVISAO,
  buscarClima,
  buscarLocalizacao,
  descreverTempo,
  direcaoCardeal,
  escolherLocal,
  interpretarMunicipio
} from '../public/js/clima.js';

// fetch falso: registra as URLs chamadas e devolve a resposta configurada
function criarFetch(resposta, { status = 200, json = true } = {}) {
  const chamadas = [];
  const fetchFn = async (url) => {
    chamadas.push(new URL(url));
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (!json) throw new SyntaxError('JSON inválido');
        return typeof resposta === 'function' ? resposta(new URL(url)) : resposta;
      }
    };
  };
  return { fetchFn, chamadas };
}

const resultadosVarzeaGrande = {
  results: [
    { name: 'Várzea Grande', admin1: 'Piauí', country_code: 'BR', latitude: -6.54, longitude: -42.24 },
    { name: 'Várzea Grande', admin1: 'Mato Grosso', country_code: 'BR', latitude: -15.64, longitude: -56.13 }
  ]
};

const previsaoValida = {
  current: {
    time: '2026-10-16T12:30',
    temperature_2m: 28.4,
    relative_humidity_2m: 66,
    precipitation: 0,
    weather_code: 3,
    wind_speed_10m: 6.7,
    wind_direction_10m: 204
  }
};

describe('interpretarMunicipio', () => {
  test('separa cidade e UF em formatos comuns', () => {
    for (const texto of ['Cuiabá - MT', 'Cuiabá-MT', 'Cuiabá – mt', 'Cuiabá/MT', 'Cuiabá, MT', '  Cuiabá - MT  ']) {
      assert.deepEqual(interpretarMunicipio(texto), { nome: 'Cuiabá', uf: 'MT' }, texto);
    }
  });

  test('sem UF (ou UF inexistente) mantém o texto como nome', () => {
    assert.deepEqual(interpretarMunicipio('Cuiabá'), { nome: 'Cuiabá', uf: null });
    assert.deepEqual(interpretarMunicipio('Cidade - XX'), { nome: 'Cidade - XX', uf: null });
    assert.deepEqual(interpretarMunicipio(null), { nome: '', uf: null });
  });

  test('cidades com hífen no nome', () => {
    assert.deepEqual(interpretarMunicipio('Pau-Brasil - BA'), { nome: 'Pau-Brasil', uf: 'BA' });
  });
});

describe('escolherLocal', () => {
  test('desempata pela UF', () => {
    const local = escolherLocal(resultadosVarzeaGrande.results, { nome: 'Várzea Grande', uf: 'MT' });
    assert.deepEqual(local, { nome: 'Várzea Grande', estado: 'Mato Grosso', latitude: -15.64, longitude: -56.13 });
  });

  test('sem UF usa o primeiro resultado brasileiro com o mesmo nome (sem acentos e maiúsculas)', () => {
    const local = escolherLocal(resultadosVarzeaGrande.results, { nome: 'varzea grande', uf: null });
    assert.equal(local.estado, 'Piauí');
  });

  test('ignora resultados de outro país, outro nome ou sem coordenadas', () => {
    const resultados = [
      { name: 'Cuiabá', admin1: 'Mato Grosso', country_code: 'PT', latitude: 1, longitude: 1 },
      { name: 'Cuiabazinho', admin1: 'Mato Grosso', country_code: 'BR', latitude: 1, longitude: 1 },
      { name: 'Cuiabá', admin1: 'Mato Grosso', country_code: 'BR', latitude: 'x', longitude: 1 }
    ];
    assert.equal(escolherLocal(resultados, { nome: 'Cuiabá', uf: 'MT' }), null);
  });

  test('entrada que não é lista retorna null', () => {
    assert.equal(escolherLocal(undefined, { nome: 'Cuiabá', uf: 'MT' }), null);
  });
});

describe('descreverTempo e direcaoCardeal', () => {
  test('traduz códigos WMO e marca chuva', () => {
    assert.deepEqual(descreverTempo(0), { descricao: 'Céu limpo', icone: '☀️', chuvoso: false });
    assert.equal(descreverTempo(3).chuvoso, false);
    for (const codigo of [51, 61, 65, 80, 95, 99]) assert.equal(descreverTempo(codigo).chuvoso, true, String(codigo));
    assert.equal(descreverTempo(1234).descricao, 'Condição desconhecida');
  });

  test('converte graus em ponto cardeal', () => {
    const casos = [[0, 'N'], [44, 'NE'], [90, 'L'], [135, 'SE'], [180, 'S'], [204, 'SO'], [270, 'O'], [315, 'NO'], [359, 'N'], [360, 'N'], [-90, 'O']];
    for (const [graus, sigla] of casos) assert.equal(direcaoCardeal(graus).sigla, sigla, String(graus));
    assert.equal(direcaoCardeal(204).nome, 'Sudoeste');
  });
});

describe('buscarLocalizacao', () => {
  test('consulta a geocodificação do Open-Meteo restrita ao Brasil', async () => {
    const { fetchFn, chamadas } = criarFetch(resultadosVarzeaGrande);
    const local = await buscarLocalizacao('Várzea Grande - MT', { fetchFn, cache: new Map() });
    assert.equal(local.estado, 'Mato Grosso');
    assert.equal(chamadas.length, 1);
    assert.equal(`${chamadas[0].origin}${chamadas[0].pathname}`, URL_GEOCODIFICACAO);
    assert.equal(chamadas[0].searchParams.get('name'), 'Várzea Grande');
    assert.equal(chamadas[0].searchParams.get('countryCode'), 'BR');
  });

  test('usa cache para o mesmo município', async () => {
    const { fetchFn, chamadas } = criarFetch(resultadosVarzeaGrande);
    const cache = new Map();
    await buscarLocalizacao('Várzea Grande - MT', { fetchFn, cache });
    await buscarLocalizacao('varzea grande - mt', { fetchFn, cache });
    assert.equal(chamadas.length, 1);
  });

  test('município não encontrado retorna null', async () => {
    const { fetchFn } = criarFetch({});
    assert.equal(await buscarLocalizacao('Cidade Imaginária', { fetchFn, cache: new Map() }), null);
  });

  test('nome curto demais não consulta a API', async () => {
    const { fetchFn, chamadas } = criarFetch(resultadosVarzeaGrande);
    assert.equal(await buscarLocalizacao(' ', { fetchFn, cache: new Map() }), null);
    assert.equal(chamadas.length, 0);
  });

  test('erro HTTP, falha de rede ou JSON inválido viram ErroClima', async () => {
    await assert.rejects(buscarLocalizacao('Cuiabá - MT', { fetchFn: criarFetch({}, { status: 500 }).fetchFn, cache: new Map() }), ErroClima);
    await assert.rejects(buscarLocalizacao('Cuiabá - MT', { fetchFn: criarFetch({}, { json: false }).fetchFn, cache: new Map() }), ErroClima);
    const semRede = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(buscarLocalizacao('Cuiabá - MT', { fetchFn: semRede, cache: new Map() }), ErroClima);
  });
});

describe('buscarClima', () => {
  test('pede as variáveis atuais com vento em km/h e interpreta a resposta', async () => {
    const { fetchFn, chamadas } = criarFetch(previsaoValida);
    const clima = await buscarClima({ latitude: -15.6, longitude: -56.1 }, { fetchFn });

    const url = chamadas[0];
    assert.equal(`${url.origin}${url.pathname}`, URL_PREVISAO);
    assert.equal(url.searchParams.get('latitude'), '-15.6');
    assert.equal(url.searchParams.get('wind_speed_unit'), 'kmh');
    assert.match(url.searchParams.get('current'), /wind_direction_10m/);

    assert.deepEqual(clima, {
      temperatura: 28.4,
      umidade: 66,
      precipitacao: 0,
      chovendo: false,
      descricao: 'Nublado',
      icone: '☁️',
      ventoKmh: 6.7,
      ventoGraus: 204,
      ventoDirecao: { sigla: 'SO', nome: 'Sudoeste' },
      horario: '2026-10-16T12:30'
    });
  });

  test('precipitação maior que zero indica chuva mesmo com céu nublado', async () => {
    const { fetchFn } = criarFetch({ current: { ...previsaoValida.current, precipitation: 0.4 } });
    assert.equal((await buscarClima({ latitude: 0, longitude: 0 }, { fetchFn })).chovendo, true);
  });

  test('rejeita resposta sem dados atuais ou com valores inválidos', async () => {
    const invalidas = [
      {},
      { current: null },
      { current: { ...previsaoValida.current, temperature_2m: '28' } },
      { current: { ...previsaoValida.current, wind_speed_10m: null } },
      { current: { ...previsaoValida.current, weather_code: Number.NaN } }
    ];
    for (const resposta of invalidas) {
      await assert.rejects(buscarClima({ latitude: 0, longitude: 0 }, { fetchFn: criarFetch(resposta).fetchFn }), ErroClima);
    }
  });
});
