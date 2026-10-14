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

function modal(page) {
  return page.getByRole('dialog');
}

let errosNoConsole;
let dialogosNativos;

test.beforeEach(async ({ page }) => {
  errosNoConsole = [];
  dialogosNativos = [];
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
});

test('exclui projeto pelo modal e restaura os dados de exemplo', async ({ page }) => {
  await page.getByRole('button', { name: /^Excluir Coleta Seletiva/ }).click();
  await expect(modal(page)).toBeVisible();
  await expect(modal(page)).toContainText('Excluir projeto');
  await expect(modal(page)).toContainText('Coleta Seletiva nas Escolas Modelo');
  await modal(page).getByRole('button', { name: 'Excluir' }).click();
  await expect(modal(page)).toBeHidden();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO - 1);
  await expect(page.getByTestId('lista-projetos')).not.toContainText('Coleta Seletiva');

  await page.reload();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO - 1);

  await page.getByRole('button', { name: 'Restaurar dados de exemplo' }).click();
  await expect(modal(page)).toContainText('Restaurar dados de exemplo');
  await modal(page).getByRole('button', { name: 'Restaurar' }).click();
  await expect(modal(page)).toBeHidden();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO);
  await expect(page.getByTestId('lista-projetos')).toContainText('Coleta Seletiva');
});

test('modal abre com foco em Cancelar e cancelar não exclui', async ({ page }) => {
  await page.getByRole('button', { name: /^Excluir Coleta Seletiva/ }).click();
  await expect(modal(page)).toBeVisible();
  await expect(modal(page).getByRole('button', { name: 'Cancelar' })).toBeFocused();

  await modal(page).getByRole('button', { name: 'Cancelar' }).click();
  await expect(modal(page)).toBeHidden();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO);
});

test('Esc e clique fora do modal cancelam a ação', async ({ page }) => {
  const excluir = page.getByRole('button', { name: /^Excluir Coleta Seletiva/ });

  await excluir.click();
  await expect(modal(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(modal(page)).toBeHidden();

  await excluir.click();
  await expect(modal(page)).toBeVisible();
  await page.mouse.click(5, 5); // fundo escurecido, fora da caixa
  await expect(modal(page)).toBeHidden();

  await page.getByRole('button', { name: 'Restaurar dados de exemplo' }).click();
  await page.keyboard.press('Escape');
  await expect(modal(page)).toBeHidden();

  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO);
});

test('clicar dentro da caixa do modal não cancela', async ({ page }) => {
  await page.getByRole('button', { name: /^Excluir Coleta Seletiva/ }).click();
  await modal(page).locator('#modal-mensagem').click();
  await expect(modal(page)).toBeVisible();
  await modal(page).getByRole('button', { name: 'Cancelar' }).click();
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
  await expect(page.getByRole('button', { name: /^Excluir / }).first()).toHaveCSS('color', VERMELHO);
  const coresStatus = {
    planejamento: 'rgb(21, 101, 192)',
    em_execucao: VERDE,
    atrasado: VERMELHO,
    concluido: 'rgb(106, 27, 154)'
  };
  for (const [status, cor] of Object.entries(coresStatus)) {
    await expect(page.locator(`.selo-${status}`).first()).toHaveCSS('color', cor);
  }

  // Modal de exclusão: botão de confirmar com texto avermelhado
  await page.getByRole('button', { name: /^Excluir Coleta Seletiva/ }).click();
  await expect(modal(page).getByRole('button', { name: 'Excluir' })).toHaveCSS('color', VERMELHO);
  await modal(page).getByRole('button', { name: 'Cancelar' }).click();

  // Todo o restante do texto visível deve ser preto ou branco
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
