// Interface (DOM). Usa textContent (nunca innerHTML com dados) para evitar XSS.

import { ROTULOS_STATUS, listarProjetos, resumoPorStatus } from './projetos.js';
import { ErroValidacao, criarRepositorio } from './repositorio.js';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const data = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

function armazenamentoDisponivel() {
  try {
    return window.localStorage;
  } catch {
    // Sem localStorage: mantém os dados apenas em memória nesta aba
    const memoria = new Map();
    return {
      getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
      setItem: (k, v) => memoria.set(k, String(v)),
      removeItem: (k) => memoria.delete(k)
    };
  }
}

const repositorio = criarRepositorio(armazenamentoDisponivel());

function el(tag, props = {}, filhos = []) {
  const elemento = document.createElement(tag);
  Object.assign(elemento, props);
  for (const filho of filhos) elemento.append(filho);
  return elemento;
}

// Confirmação em modal (<dialog>) no lugar de window.confirm.
// Resolve true só ao clicar em "Confirmar"; Cancelar, Esc ou clique fora resolvem false.
function confirmar({ titulo, mensagem, textoConfirmar = 'Confirmar' }) {
  const modal = document.getElementById('modal-confirmacao');
  const botaoConfirmar = document.getElementById('modal-confirmar');
  const botaoCancelar = document.getElementById('modal-cancelar');
  document.getElementById('modal-titulo').textContent = titulo;
  document.getElementById('modal-mensagem').textContent = mensagem;
  botaoConfirmar.textContent = textoConfirmar;

  return new Promise((resolver) => {
    const fechar = (resultado) => () => modal.close(resultado);
    const aoConfirmar = fechar('confirmar');
    const aoCancelar = fechar('cancelar');
    // Clique no fundo escurecido (fora da caixa do modal) cancela
    const aoClicarFora = (evento) => {
      if (evento.target !== modal) return;
      const caixa = modal.getBoundingClientRect();
      const dentro = evento.clientX >= caixa.left && evento.clientX <= caixa.right
        && evento.clientY >= caixa.top && evento.clientY <= caixa.bottom;
      if (!dentro) modal.close('cancelar');
    };

    botaoConfirmar.addEventListener('click', aoConfirmar);
    botaoCancelar.addEventListener('click', aoCancelar);
    modal.addEventListener('click', aoClicarFora);
    modal.addEventListener('close', () => {
      botaoConfirmar.removeEventListener('click', aoConfirmar);
      botaoCancelar.removeEventListener('click', aoCancelar);
      modal.removeEventListener('click', aoClicarFora);
      resolver(modal.returnValue === 'confirmar');
    }, { once: true });

    modal.returnValue = '';
    modal.showModal();
    // Ação destrutiva: o foco inicial fica no botão seguro
    botaoCancelar.focus();
  });
}

function renderizarResumo(projetos) {
  const resumo = resumoPorStatus(projetos);
  const cartoes = [
    ['Total', resumo.total],
    ...Object.entries(resumo.porStatus).map(([s, n]) => [ROTULOS_STATUS[s] ?? s, n]),
    ['Orçamento total', moeda.format(resumo.orcamentoTotal)]
  ];
  document.getElementById('resumo').replaceChildren(
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
    ['Prazo', data.format(new Date(`${p.prazo}T00:00:00Z`))],
    ['Orçamento', moeda.format(p.orcamento)],
    ['Progresso', `${progresso}%`]
  ];

  const excluir = el('button', { type: 'button', className: 'botao-secundario', textContent: 'Excluir' });
  excluir.setAttribute('aria-label', `Excluir ${p.nome}`);
  excluir.addEventListener('click', async () => {
    const confirmado = await confirmar({
      titulo: 'Excluir projeto',
      mensagem: `Excluir o projeto "${p.nome}"? Esta ação não pode ser desfeita.`,
      textoConfirmar: 'Excluir'
    });
    if (confirmado) {
      repositorio.remover(p.id);
      atualizar();
    }
  });

  const item = el('li', { className: 'projeto' }, [
    el('span', { className: `selo selo-${p.status}`, textContent: ROTULOS_STATUS[p.status] ?? p.status }),
    el('h3', { textContent: p.nome }),
    el('dl', {}, campos.flatMap(([dt, dd]) => [el('dt', { textContent: dt }), el('dd', { textContent: dd })])),
    barra,
    excluir
  ]);
  item.dataset.testid = 'projeto';
  item.dataset.status = p.status;
  return item;
}

function atualizar() {
  const mensagem = document.getElementById('mensagem');
  const lista = document.getElementById('lista-projetos');
  const status = document.getElementById('filtro-status').value;
  try {
    const todos = repositorio.listar();
    renderizarResumo(todos);
    const projetos = listarProjetos(todos, { status });
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

function configurarFormulario() {
  const form = document.getElementById('form-projeto');
  const erros = document.getElementById('erros-form');
  form.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const campos = new FormData(form);
    try {
      repositorio.adicionar({
        nome: campos.get('nome'),
        municipio: campos.get('municipio'),
        responsavel: campos.get('responsavel'),
        status: campos.get('status'),
        prazo: campos.get('prazo'),
        orcamento: campos.get('orcamento'),
        progresso: campos.get('progresso')
      });
      form.reset();
      erros.replaceChildren();
      atualizar();
    } catch (erro) {
      const lista = erro instanceof ErroValidacao ? erro.erros : [erro.message];
      erros.replaceChildren(...lista.map((texto) => el('li', { textContent: texto })));
    }
  });
}

function iniciar() {
  document.getElementById('filtro-status').addEventListener('change', atualizar);
  document.getElementById('restaurar').addEventListener('click', async () => {
    const confirmado = await confirmar({
      titulo: 'Restaurar dados de exemplo',
      mensagem: 'Substituir todos os projetos pelos dados fictícios de exemplo? Os projetos cadastrados serão perdidos.',
      textoConfirmar: 'Restaurar'
    });
    if (confirmado) {
      repositorio.restaurar();
      atualizar();
    }
  });
  configurarFormulario();
  atualizar();
}

iniciar();
