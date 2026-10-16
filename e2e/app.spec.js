import { test, expect } from '@playwright/test';

// Cada teste roda em um contexto novo do navegador, ou seja, com
// localStorage vazio, e começa com os 6 projetos fictícios de exemplo.

const TOTAL_EXEMPLO = 6;

function valorResumo(page, rotulo) {
  return page
    .getByTestId('resumo')
    .locator('.cartao-resumo')
    .filter({ has: page.locator('.rotulo', { hasText: new RegExp(`^${rotulo}$`) }) })
    .locator('.valor');
}

async function preencherFormulario(page, dados) {
  const form = page.getByTestId('form-projeto');
  await form.getByLabel('Nome').fill(dados.nome);
  await form.getByLabel('Município').fill(dados.municipio);
  await form.getByLabel('Responsável').fill(dados.responsavel);
  await form.getByLabel('Status').selectOption(dados.status);
  await form.getByLabel('Prazo').fill(dados.prazo);
  await form.getByLabel('Orçamento (R$)').fill(dados.orcamento);
  await form.getByLabel('Progresso (%)').fill(dados.progresso);
}

const projetoNovo = {
  nome: 'Horta Comunitária Fictícia',
  municipio: 'Cidade Imaginária',
  responsavel: 'Equipe E2E',
  status: 'em_execucao',
  prazo: '2027-12-31',
  orcamento: '12000',
  progresso: '20'
};

function modalDetalhes(page) {
  return page.getByTestId('modal-detalhes');
}

function modalConfirmacao(page) {
  return page.getByTestId('modal-confirmacao');
}

function cartao(page, nome) {
  return page.getByTestId('projeto').filter({ hasText: nome });
}

async function abrirDetalhes(page, nome) {
  await page.getByRole('button', { name: nome }).click();
  await expect(modalDetalhes(page)).toBeVisible();
}

async function filtrar(page, testid, valor) {
  const campo = page.getByTestId(testid);
  if ((await campo.evaluate((e) => e.tagName)) === 'SELECT') await campo.selectOption(valor);
  else await campo.fill(valor);
}

// Serviços externos simulados: os testes não dependem da internet nem do clima real.
// Cada teste pode sobrescrever uma rota com page.route (a última registrada vence).
const LOCAIS_FALSOS = {
  'Cuiabá': { latitude: -15.6, longitude: -56.1 },
  'Rondonópolis': { latitude: -16.47, longitude: -54.64 },
  'Sinop': { latitude: -11.86, longitude: -55.5 },
  'Cáceres': { latitude: -16.07, longitude: -57.68 }
};
const CLIMA_FALSO = {
  current: {
    time: '2026-10-16T14:45',
    temperature_2m: 31.2,
    relative_humidity_2m: 54,
    precipitation: 0.6,
    weather_code: 61,
    wind_speed_10m: 12.3,
    wind_direction_10m: 90
  }
};
// PNG transparente de 1×1 px para as imagens do mapa
const TILE_FALSO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'
);

let errosNoConsole;
let dialogosNativos;
let requisicoes;

test.beforeEach(async ({ page }) => {
  errosNoConsole = [];
  dialogosNativos = [];
  requisicoes = { geocodificacao: [], previsao: [], tiles: 0 };

  await page.route('https://geocoding-api.open-meteo.com/**', (rota) => {
    const url = new URL(rota.request().url());
    requisicoes.geocodificacao.push(url);
    const nome = url.searchParams.get('name');
    const local = LOCAIS_FALSOS[nome];
    rota.fulfill({
      json: local ? { results: [{ name: nome, admin1: 'Mato Grosso', country_code: 'BR', ...local }] } : {}
    });
  });
  await page.route('https://api.open-meteo.com/**', (rota) => {
    requisicoes.previsao.push(new URL(rota.request().url()));
    rota.fulfill({ json: CLIMA_FALSO });
  });
  await page.route('https://tile.openstreetmap.org/**', (rota) => {
    requisicoes.tiles += 1;
    rota.fulfill({ body: TILE_FALSO, contentType: 'image/png' });
  });

  page.on('pageerror', (erro) => errosNoConsole.push(erro.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errosNoConsole.push(msg.text());
  });
  // Regra do sistema: nenhuma janela nativa (alert, confirm, prompt).
  // Se alguma aparecer, é registrada e o teste falha no afterEach.
  page.on('dialog', async (dialogo) => {
    dialogosNativos.push(`${dialogo.type()}: ${dialogo.message()}`);
    await dialogo.dismiss();
  });
  await page.goto('/');
});

test.afterEach(() => {
  // Também detecta violações de CSP, que aparecem como erro no console
  expect(errosNoConsole).toEqual([]);
  expect(dialogosNativos, 'janelas nativas (alert/confirm/prompt) não são permitidas').toEqual([]);
});

test('carrega a página com aviso de dados fictícios e resumo', async ({ page }) => {
  await expect(page).toHaveTitle('Governança de Projetos Ambientais');
  await expect(page.getByRole('note')).toContainText('fictícios');
  await expect(valorResumo(page, 'Total')).toHaveText(String(TOTAL_EXEMPLO));
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO);
  await expect(page.getByRole('status')).toHaveText(`${TOTAL_EXEMPLO} projeto(s) exibido(s).`);
});

test('filtra projetos por status', async ({ page }) => {
  const filtro = page.getByTestId('filtro-status');

  await filtro.selectOption('planejamento');
  await expect(page.getByTestId('projeto')).toHaveCount(2);
  for (const card of await page.getByTestId('projeto').all()) {
    await expect(card).toHaveAttribute('data-status', 'planejamento');
  }

  await filtro.selectOption('atrasado');
  await expect(page.getByTestId('projeto')).toHaveCount(1);
  await expect(page.getByTestId('projeto')).toContainText('Corredor Ecológico');

  await filtro.selectOption('');
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO);
});

test('cadastra projeto e mantém após recarregar (localStorage)', async ({ page }) => {
  await page.getByText('Novo projeto').click();
  await preencherFormulario(page, projetoNovo);
  await page.getByRole('button', { name: 'Salvar projeto' }).click();

  await expect(page.getByTestId('erros-form')).toBeEmpty();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO + 1);
  await expect(page.getByTestId('lista-projetos')).toContainText(projetoNovo.nome);
  await expect(valorResumo(page, 'Total')).toHaveText(String(TOTAL_EXEMPLO + 1));

  await page.reload();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO + 1);
  await expect(page.getByTestId('lista-projetos')).toContainText(projetoNovo.nome);

  const salvo = await page.evaluate(() => JSON.parse(localStorage.getItem('gpa:projetos:v1')));
  expect(salvo.at(-1)).toMatchObject({ nome: projetoNovo.nome, orcamento: 12000, progresso: 20 });
});

test('mostra erros de validação e não salva projeto inválido', async ({ page }) => {
  await page.getByText('Novo projeto').click();
  await preencherFormulario(page, { ...projetoNovo, nome: 'ab', progresso: '150' });
  await page.getByRole('button', { name: 'Salvar projeto' }).click();

  const erros = page.getByTestId('erros-form');
  await expect(erros).toContainText('Nome deve ter entre 3 e 120 caracteres');
  await expect(erros).toContainText('Progresso deve ser um inteiro entre 0 e 100');
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO);
});

test('exibe HTML digitado como texto, sem executá-lo (XSS)', async ({ page }) => {
  // Um alert(1) executado seria capturado como janela nativa no afterEach
  const nomeMalicioso = '<img src=x onerror=alert(1)>';
  await page.getByText('Novo projeto').click();
  await preencherFormulario(page, { ...projetoNovo, nome: nomeMalicioso });
  await page.getByRole('button', { name: 'Salvar projeto' }).click();

  await expect(page.getByRole('heading', { name: nomeMalicioso })).toBeVisible();
  await expect(page.getByTestId('lista-projetos').locator('img')).toHaveCount(0);

  await abrirDetalhes(page, nomeMalicioso);
  await expect(modalDetalhes(page).getByRole('heading', { name: nomeMalicioso })).toBeVisible();
  await expect(modalDetalhes(page).locator('img')).toHaveCount(0);
});

test('cartões não têm botão Excluir e não há botão de restaurar', async ({ page }) => {
  await expect(page.getByTestId('lista-projetos').getByRole('button', { name: /Excluir/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Restaurar dados de exemplo' })).toHaveCount(0);
});

test('clicar no cartão abre o modal com os detalhes completos', async ({ page }) => {
  // Clique perto do rodapé do cartão (longe do título): o cartão inteiro é clicável
  const alvo = cartao(page, 'Corredor Ecológico Mata Exemplo');
  const caixa = await alvo.boundingBox();
  await alvo.click({ position: { x: caixa.width / 2, y: caixa.height - 12 } });
  const detalhes = modalDetalhes(page);
  await expect(detalhes).toBeVisible();
  await expect(detalhes.getByRole('heading', { name: 'Corredor Ecológico Mata Exemplo' })).toBeVisible();
  const campos = detalhes.getByTestId('detalhes-campos');
  for (const texto of ['Sinop - MT', 'Equipe Gama', 'Atrasado', '30/06/2026', 'R$ 320.000,00', '60%', '#3']) {
    await expect(campos).toContainText(texto);
  }
  await expect(detalhes.getByTestId('detalhes-status')).toHaveValue('atrasado');
  await expect(detalhes.getByRole('button', { name: 'Excluir projeto' })).toBeVisible();

  await detalhes.getByRole('button', { name: 'Fechar' }).click();
  await expect(detalhes).toBeHidden();
});

test('detalhes abrem pelo teclado e o foco volta ao cartão ao fechar', async ({ page }) => {
  const titulo = page.getByRole('button', { name: 'Coleta Seletiva nas Escolas Modelo' });
  await titulo.focus();
  await page.keyboard.press('Enter');
  await expect(modalDetalhes(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modalDetalhes(page)).toBeHidden();
  await expect(titulo).toBeFocused();
});

test('altera o status no modal e mantém após recarregar', async ({ page }) => {
  await abrirDetalhes(page, 'Monitoramento da Qualidade do Ar');
  const detalhes = modalDetalhes(page);
  await detalhes.getByTestId('detalhes-status').selectOption('concluido');
  await expect(detalhes.getByRole('status')).toHaveText('Status alterado para "Concluído".');
  await expect(detalhes.locator('.selo')).toHaveText('Concluído');
  await expect(detalhes.getByTestId('detalhes-campos')).toContainText('Concluído');

  // A lista e o resumo atualizam por trás do modal
  await expect(cartao(page, 'Monitoramento da Qualidade do Ar')).toHaveAttribute('data-status', 'concluido');
  await expect(valorResumo(page, 'Concluído')).toHaveText('2');
  await expect(valorResumo(page, 'Planejamento')).toHaveText('1');

  await detalhes.getByRole('button', { name: 'Fechar' }).click();
  await page.reload();
  await expect(cartao(page, 'Monitoramento da Qualidade do Ar')).toHaveAttribute('data-status', 'concluido');
  await abrirDetalhes(page, 'Monitoramento da Qualidade do Ar');
  await expect(modalDetalhes(page).getByTestId('detalhes-status')).toHaveValue('concluido');
});

test('exclui projeto pelo modal de detalhes, com confirmação', async ({ page }) => {
  await abrirDetalhes(page, 'Coleta Seletiva nas Escolas Modelo');
  await modalDetalhes(page).getByRole('button', { name: 'Excluir projeto' }).click();

  const confirmacao = modalConfirmacao(page);
  await expect(confirmacao).toBeVisible();
  await expect(confirmacao).toContainText('Excluir projeto');
  await expect(confirmacao).toContainText('Coleta Seletiva nas Escolas Modelo');
  await confirmacao.getByRole('button', { name: 'Excluir' }).click();

  await expect(confirmacao).toBeHidden();
  await expect(modalDetalhes(page)).toBeHidden();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO - 1);
  await expect(page.getByTestId('lista-projetos')).not.toContainText('Coleta Seletiva');

  await page.reload();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO - 1);
});

test('cancelar a exclusão mantém o projeto e o modal de detalhes aberto', async ({ page }) => {
  await abrirDetalhes(page, 'Coleta Seletiva nas Escolas Modelo');
  await modalDetalhes(page).getByRole('button', { name: 'Excluir projeto' }).click();
  const confirmacao = modalConfirmacao(page);
  await expect(confirmacao.getByRole('button', { name: 'Cancelar' })).toBeFocused();

  await confirmacao.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirmacao).toBeHidden();
  await expect(modalDetalhes(page)).toBeVisible();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO);
});

test('Esc e clique fora fecham só o modal de cima', async ({ page }) => {
  await abrirDetalhes(page, 'Coleta Seletiva nas Escolas Modelo');
  const excluir = modalDetalhes(page).getByRole('button', { name: 'Excluir projeto' });

  await excluir.click();
  await page.keyboard.press('Escape');
  await expect(modalConfirmacao(page)).toBeHidden();
  await expect(modalDetalhes(page)).toBeVisible();

  await excluir.click();
  await page.mouse.click(5, 5); // fundo escurecido
  await expect(modalConfirmacao(page)).toBeHidden();
  await expect(modalDetalhes(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(modalDetalhes(page)).toBeHidden();

  await abrirDetalhes(page, 'Coleta Seletiva nas Escolas Modelo');
  await page.mouse.click(5, 5);
  await expect(modalDetalhes(page)).toBeHidden();

  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO);
});

test('clicar dentro da caixa dos modais não fecha', async ({ page }) => {
  await abrirDetalhes(page, 'Coleta Seletiva nas Escolas Modelo');
  await modalDetalhes(page).getByTestId('detalhes-campos').click();
  await expect(modalDetalhes(page)).toBeVisible();

  await modalDetalhes(page).getByRole('button', { name: 'Excluir projeto' }).click();
  await modalConfirmacao(page).locator('#modal-mensagem').click();
  await expect(modalConfirmacao(page)).toBeVisible();
  await modalConfirmacao(page).getByRole('button', { name: 'Cancelar' }).click();
});

test('filtra por município e equipe com opções dos projetos cadastrados', async ({ page }) => {
  const municipio = page.getByTestId('filtro-municipio');
  await expect(municipio.locator('option')).toHaveText([
    'Todos', 'Cáceres - MT', 'Cuiabá - MT', 'Rondonópolis - MT', 'Sinop - MT'
  ]);
  await expect(page.getByTestId('filtro-equipe').locator('option')).toHaveCount(7);

  await filtrar(page, 'filtro-municipio', 'Cuiabá - MT');
  await expect(page.getByTestId('projeto')).toHaveCount(2);
  await filtrar(page, 'filtro-equipe', 'Equipe Delta');
  await expect(page.getByTestId('projeto')).toHaveCount(1);
  await expect(page.getByTestId('lista-projetos')).toContainText('Coleta Seletiva');
});

test('filtra por intervalo de prazo', async ({ page }) => {
  await filtrar(page, 'filtro-prazo-de', '2027-01-01');
  await expect(page.getByTestId('projeto')).toHaveCount(4);
  await filtrar(page, 'filtro-prazo-ate', '2027-05-31');
  await expect(page.getByTestId('projeto')).toHaveCount(2);

  await filtrar(page, 'filtro-prazo-ate', '2026-01-01');
  await expect(page.getByTestId('projeto')).toHaveCount(0);
  await expect(page.locator('#mensagem')).toHaveText('Nenhum projeto encontrado.');
});

test('filtra por faixa de orçamento', async ({ page }) => {
  await filtrar(page, 'filtro-orcamento-min', '100000');
  await expect(page.getByTestId('projeto')).toHaveCount(3);
  await filtrar(page, 'filtro-orcamento-max', '200000');
  await expect(page.getByTestId('projeto')).toHaveCount(1);
  await expect(page.getByTestId('lista-projetos')).toContainText('Recuperação de Nascentes');

  await filtrar(page, 'filtro-orcamento-min', '-5');
  await expect(page.getByTestId('projeto')).toHaveCount(0);
  await expect(page.locator('#mensagem')).toContainText('Filtro inválido');
});

test('combina filtros e limpa todos', async ({ page }) => {
  await filtrar(page, 'filtro-status', 'em_execucao');
  await filtrar(page, 'filtro-municipio', 'Cáceres - MT');
  await expect(page.getByTestId('projeto')).toHaveCount(1);

  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO);
  await expect(page.getByTestId('filtro-status')).toHaveValue('');
  await expect(page.getByTestId('filtro-municipio')).toHaveValue('');
});

test('município e equipe de um projeto novo aparecem nos filtros', async ({ page }) => {
  await page.getByText('Novo projeto').click();
  await preencherFormulario(page, projetoNovo);
  await page.getByRole('button', { name: 'Salvar projeto' }).click();

  await filtrar(page, 'filtro-municipio', projetoNovo.municipio);
  await expect(page.getByTestId('projeto')).toHaveCount(1);
  await filtrar(page, 'filtro-municipio', '');
  await filtrar(page, 'filtro-equipe', projetoNovo.responsavel);
  await expect(page.getByTestId('projeto')).toHaveCount(1);
});

test('modal mostra o mapa e o tempo atual do município', async ({ page }) => {
  await abrirDetalhes(page, 'Corredor Ecológico Mata Exemplo');
  const detalhes = modalDetalhes(page);

  await expect(detalhes.getByTestId('mapa-aviso')).toHaveText('Sinop, Mato Grosso');
  const mapa = detalhes.getByTestId('detalhes-mapa');
  await expect(mapa).toBeVisible();
  await expect(mapa.locator('.leaflet-marker-icon')).toHaveCount(1);
  await expect(mapa.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
  await expect.poll(() => requisicoes.tiles).toBeGreaterThan(0);

  const clima = detalhes.getByTestId('cartao-clima');
  for (const texto of ['31,2 °C', 'Chuva', 'Chovendo agora', 'Sim (0,6 mm)', '54%', '12,3 km/h', 'Leste (L, 90°)', 'Vento vindo de Leste', 'Atualizado às 14:45', 'Dados: Open-Meteo.com']) {
    await expect(clima).toContainText(texto);
  }
  // A seta aponta para onde o vento vai (vento de leste → seta para oeste)
  await expect(clima.locator('.vento-seta')).toHaveCSS('transform', /matrix\(-?0(\.0+)?, -1, 1, -?0(\.0+)?, 0, 0\)|matrix\(-?[0-9.e-]+, -1, 1, -?[0-9.e-]+, 0, 0\)/);

  // Consultas corretas: município + UF restrito ao Brasil; previsão nas coordenadas encontradas, vento em km/h
  expect(requisicoes.geocodificacao.at(-1).searchParams.get('name')).toBe('Sinop');
  expect(requisicoes.geocodificacao.at(-1).searchParams.get('countryCode')).toBe('BR');
  const previsao = requisicoes.previsao.at(-1);
  expect(previsao.searchParams.get('latitude')).toBe('-11.86');
  expect(previsao.searchParams.get('longitude')).toBe('-55.5');
  expect(previsao.searchParams.get('wind_speed_unit')).toBe('kmh');

  // O modal cabe na tela (inclusive no celular)
  const caixa = await detalhes.boundingBox();
  const largura = page.viewportSize().width;
  expect(caixa.x).toBeGreaterThanOrEqual(0);
  expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura);
});

test('município não encontrado avisa e não consulta o clima', async ({ page }) => {
  await page.getByText('Novo projeto').click();
  await preencherFormulario(page, projetoNovo);
  await page.getByRole('button', { name: 'Salvar projeto' }).click();

  await abrirDetalhes(page, projetoNovo.nome);
  const detalhes = modalDetalhes(page);
  await expect(detalhes.getByTestId('mapa-aviso')).toContainText('não encontrado no mapa');
  await expect(detalhes.getByTestId('mapa-aviso')).toContainText('"Cidade - UF"');
  await expect(detalhes.getByTestId('detalhes-mapa')).toBeHidden();
  await expect(detalhes.getByTestId('cartao-clima')).toContainText('não é possível consultar o clima');
  expect(requisicoes.previsao).toHaveLength(0);
});

test('falha no serviço de clima mostra aviso e mantém o mapa', async ({ page }) => {
  await page.route('https://api.open-meteo.com/**', (rota) => rota.fulfill({ status: 503, body: 'indisponível' }));
  await abrirDetalhes(page, 'Coleta Seletiva nas Escolas Modelo');
  const detalhes = modalDetalhes(page);
  await expect(detalhes.getByTestId('cartao-clima')).toContainText('Não foi possível obter o clima agora.');
  await expect(detalhes.getByTestId('mapa-aviso')).toHaveText('Cuiabá, Mato Grosso');
  await expect(detalhes.getByTestId('detalhes-mapa')).toBeVisible();

  // O navegador registra no console o 503 simulado; só esse erro esperado é aceito
  const esperado = (erro) => erro.includes('status of 503');
  expect(errosNoConsole.filter(esperado)).toHaveLength(1);
  errosNoConsole = errosNoConsole.filter((erro) => !esperado(erro));
});

test('resposta atrasada de um projeto fechado não sobrescreve o projeto aberto', async ({ page }) => {
  // A localização de Cuiabá demora; antes dela chegar, o usuário troca de projeto
  await page.route('https://geocoding-api.open-meteo.com/**', async (rota) => {
    const url = new URL(rota.request().url());
    const nome = url.searchParams.get('name');
    if (nome === 'Cuiabá') await new Promise((ok) => setTimeout(ok, 800));
    await rota.fulfill({ json: { results: [{ name: nome, admin1: 'Mato Grosso', country_code: 'BR', ...LOCAIS_FALSOS[nome] }] } });
  });

  await abrirDetalhes(page, 'Coleta Seletiva nas Escolas Modelo');
  await modalDetalhes(page).getByRole('button', { name: 'Fechar' }).click();
  await abrirDetalhes(page, 'Corredor Ecológico Mata Exemplo');

  await expect(modalDetalhes(page).getByTestId('mapa-aviso')).toHaveText('Sinop, Mato Grosso');
  await page.waitForTimeout(1000);
  await expect(modalDetalhes(page).getByTestId('mapa-aviso')).toHaveText('Sinop, Mato Grosso');
});

test('nome vindo da API aparece como texto no popup do mapa (XSS)', async ({ page }) => {
  const nomeMalicioso = '<img src=x onerror=alert(1)>';
  await page.route('https://geocoding-api.open-meteo.com/**', (rota) => rota.fulfill({
    json: { results: [{ name: nomeMalicioso, admin1: 'Mato Grosso', country_code: 'BR', latitude: -15.6, longitude: -56.1 }] }
  }));

  await page.getByText('Novo projeto').click();
  await preencherFormulario(page, { ...projetoNovo, municipio: `${nomeMalicioso} - MT` });
  await page.getByRole('button', { name: 'Salvar projeto' }).click();
  await abrirDetalhes(page, projetoNovo.nome);

  const mapa = modalDetalhes(page).getByTestId('detalhes-mapa');
  await mapa.locator('.leaflet-marker-icon').click();
  await expect(mapa.locator('.leaflet-popup-content')).toHaveText(`${nomeMalicioso}, Mato Grosso`);
  await expect(mapa.locator('.leaflet-popup-content img')).toHaveCount(0);
  await expect(modalDetalhes(page).getByTestId('mapa-aviso')).toHaveText(`${nomeMalicioso}, Mato Grosso`);
});

test('paleta: fundo branco, verde de apoio e texto preto/branco com exceções', async ({ page }) => {
  const BRANCO = 'rgb(255, 255, 255)';
  const PRETO = 'rgb(0, 0, 0)';
  const VERDE = 'rgb(46, 125, 50)';
  const VERMELHO = 'rgb(198, 40, 40)';

  await expect(page.locator('body')).toHaveCSS('background-color', BRANCO);
  await expect(page.locator('body')).toHaveCSS('color', PRETO);
  await expect(page.locator('header.topo')).toHaveCSS('background-color', VERDE);

  // Exceções permitidas ("Salvar projeto" fica no painel recolhido)
  await page.getByText('Novo projeto').click();
  await expect(page.getByRole('button', { name: 'Salvar projeto' })).toHaveCSS('color', VERDE);
  const coresStatus = {
    planejamento: 'rgb(21, 101, 192)',
    em_execucao: VERDE,
    atrasado: VERMELHO,
    concluido: 'rgb(106, 27, 154)'
  };
  for (const [status, cor] of Object.entries(coresStatus)) {
    await expect(page.locator(`.lista .selo-${status}`).first()).toHaveCSS('color', cor);
  }

  // Excluir (no modal de detalhes e na confirmação) com texto avermelhado
  await abrirDetalhes(page, 'Coleta Seletiva nas Escolas Modelo');
  await expect(modalDetalhes(page).getByTestId('cartao-clima')).toContainText('°C');
  await expect(modalDetalhes(page).locator('.leaflet-control-attribution')).toBeVisible();
  await expect(modalDetalhes(page).getByRole('button', { name: 'Excluir projeto' })).toHaveCSS('color', VERMELHO);
  await modalDetalhes(page).getByRole('button', { name: 'Excluir projeto' }).click();
  await expect(modalConfirmacao(page).getByRole('button', { name: 'Excluir' })).toHaveCSS('color', VERMELHO);

  // Todo o restante do texto (incluindo os modais abertos) deve ser preto ou branco
  const foraDaRegra = await page.evaluate(({ permitidas, excecoes }) => {
    const problemas = [];
    for (const elemento of document.querySelectorAll('body *')) {
      if (elemento.closest(excecoes)) continue;
      const temTexto = [...elemento.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (!temTexto) continue;
      const cor = getComputedStyle(elemento).color;
      if (!permitidas.includes(cor)) {
        problemas.push(`<${elemento.tagName.toLowerCase()} class="${elemento.className}"> ${cor}`);
      }
    }
    return problemas;
  }, { permitidas: [PRETO, BRANCO], excecoes: '.selo, .botao-excluir, .botao-salvar' });
  expect(foraDaRegra).toEqual([]);

  await modalConfirmacao(page).getByRole('button', { name: 'Cancelar' }).click();
});

test('descarta dados adulterados no localStorage', async ({ page }) => {
  await page.evaluate(() => {
    const dados = JSON.parse(localStorage.getItem('gpa:projetos:v1'));
    dados[0].status = 'invalido';
    dados[1].progresso = 999;
    localStorage.setItem('gpa:projetos:v1', JSON.stringify(dados));
  });
  await page.reload();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO - 2);
});

test('layout responsivo sem rolagem horizontal', async ({ page }, testInfo) => {
  // Lista os elementos que ultrapassam a tela ou cujo conteúdo transborda,
  // para a mensagem de falha já apontar o culpado (as fontes variam por SO).
  const excedentes = await page.evaluate(() => {
    const largura = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter((e) => e.getBoundingClientRect().right > largura + 0.5 || e.scrollWidth > e.clientWidth + 1)
      .map((e) => `<${e.tagName.toLowerCase()} class="${e.className}"> "${e.textContent.trim().slice(0, 40)}"`);
  });
  expect(excedentes, 'elementos que transbordam a largura disponível').toEqual([]);

  const semRolagem = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
  );
  expect(semRolagem).toBe(true);

  const [primeiro, segundo] = await page.getByTestId('projeto').all();
  const a = await primeiro.boundingBox();
  const b = await segundo.boundingBox();

  if (testInfo.project.name === 'mobile') {
    // Uma coluna: cartões empilhados
    expect(Math.round(a.x)).toBe(Math.round(b.x));
    expect(b.y).toBeGreaterThan(a.y);
  } else {
    // Várias colunas: cartões lado a lado
    expect(Math.round(a.y)).toBe(Math.round(b.y));
    expect(b.x).toBeGreaterThan(a.x);
  }
});
