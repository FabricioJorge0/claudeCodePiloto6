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

let errosNoConsole;

test.beforeEach(async ({ page }) => {
  errosNoConsole = [];
  page.on('pageerror', (erro) => errosNoConsole.push(erro.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errosNoConsole.push(msg.text());
  });
  await page.goto('/');
});

test.afterEach(() => {
  // Também detecta violações de CSP, que aparecem como erro no console
  expect(errosNoConsole).toEqual([]);
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
  let alertaDisparado = false;
  page.on('dialog', async (dialogo) => {
    alertaDisparado = true;
    await dialogo.dismiss();
  });

  const nomeMalicioso = '<img src=x onerror=alert(1)>';
  await page.getByText('Novo projeto').click();
  await preencherFormulario(page, { ...projetoNovo, nome: nomeMalicioso });
  await page.getByRole('button', { name: 'Salvar projeto' }).click();

  await expect(page.getByRole('heading', { name: nomeMalicioso })).toBeVisible();
  await expect(page.getByTestId('lista-projetos').locator('img')).toHaveCount(0);
  expect(alertaDisparado).toBe(false);
});

test('exclui projeto e restaura os dados de exemplo', async ({ page }) => {
  page.on('dialog', (dialogo) => dialogo.accept());

  await page.getByRole('button', { name: /^Excluir Coleta Seletiva/ }).click();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO - 1);
  await expect(page.getByTestId('lista-projetos')).not.toContainText('Coleta Seletiva');

  await page.reload();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO - 1);

  await page.getByRole('button', { name: 'Restaurar dados de exemplo' }).click();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO);
  await expect(page.getByTestId('lista-projetos')).toContainText('Coleta Seletiva');
});

test('cancelar a confirmação não exclui o projeto', async ({ page }) => {
  page.on('dialog', (dialogo) => dialogo.dismiss());
  await page.getByRole('button', { name: /^Excluir Coleta Seletiva/ }).click();
  await expect(page.getByTestId('projeto')).toHaveCount(TOTAL_EXEMPLO);
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
