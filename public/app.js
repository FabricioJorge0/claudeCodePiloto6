// Front-end sem dependências. Usa textContent (nunca innerHTML com dados)
// para evitar XSS.

const ROTULOS_STATUS = {
  planejamento: 'Planejamento',
  em_execucao: 'Em execução',
  atrasado: 'Atrasado',
  concluido: 'Concluído'
};

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const data = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

function el(tag, props = {}, filhos = []) {
  const elemento = document.createElement(tag);
  Object.assign(elemento, props);
  for (const filho of filhos) elemento.append(filho);
  return elemento;
}

async function buscarJson(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Falha ao carregar ${url} (${resposta.status})`);
  return resposta.json();
}

function renderizarResumo(resumo) {
  const alvo = document.getElementById('resumo');
  const cartoes = [
    ['Total', resumo.total],
    ...Object.entries(resumo.porStatus).map(([s, n]) => [ROTULOS_STATUS[s] ?? s, n]),
    ['Orçamento total', moeda.format(resumo.orcamentoTotal)]
  ];
  alvo.replaceChildren(
    ...cartoes.map(([rotulo, valor]) =>
      el('div', { className: 'cartao-resumo' }, [
        el('span', { className: 'valor', textContent: String(valor) }),
        el('span', { className: 'rotulo', textContent: rotulo })
      ])
    )
  );
}

function renderizarProjeto(p) {
  const progresso = Math.max(0, Math.min(100, Number(p.progresso) || 0));
  const barra = el('div', { className: 'progresso' }, [el('span')]);
  barra.firstChild.style.width = `${progresso}%`;
  barra.setAttribute('role', 'progressbar');
  barra.setAttribute('aria-valuenow', String(progresso));
  barra.setAttribute('aria-valuemin', '0');
  barra.setAttribute('aria-valuemax', '100');
  barra.setAttribute('aria-label', `Progresso de ${p.nome}`);

  const campos = [
    ['Município', p.municipio],
    ['Responsável', p.responsavel],
    ['Prazo', data.format(new Date(p.prazo))],
    ['Orçamento', moeda.format(p.orcamento)],
    ['Progresso', `${progresso}%`]
  ];

  const item = el('li', { className: 'projeto' }, [
    el('span', { className: `selo selo-${p.status}`, textContent: ROTULOS_STATUS[p.status] ?? p.status }),
    el('h3', { textContent: p.nome }),
    el('dl', {}, campos.flatMap(([dt, dd]) => [el('dt', { textContent: dt }), el('dd', { textContent: dd })])),
    barra
  ]);
  item.dataset.testid = 'projeto';
  item.dataset.status = p.status;
  return item;
}

async function carregarProjetos(status = '') {
  const lista = document.getElementById('lista-projetos');
  const mensagem = document.getElementById('mensagem');
  mensagem.textContent = 'Carregando…';
  try {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const projetos = await buscarJson(`/api/projetos${query}`);
    lista.replaceChildren(...projetos.map(renderizarProjeto));
    mensagem.textContent = projetos.length === 0
      ? 'Nenhum projeto encontrado.'
      : `${projetos.length} projeto(s) exibido(s).`;
  } catch (erro) {
    lista.replaceChildren();
    mensagem.textContent = 'Não foi possível carregar os projetos.';
    console.error(erro);
  }
}

async function iniciar() {
  try {
    renderizarResumo(await buscarJson('/api/resumo'));
  } catch (erro) {
    console.error(erro);
  }
  const filtro = document.getElementById('filtro-status');
  filtro.addEventListener('change', () => carregarProjetos(filtro.value));
  await carregarProjetos();
}

iniciar();
