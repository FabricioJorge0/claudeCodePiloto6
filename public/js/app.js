// Interface (DOM). Usa textContent (nunca innerHTML com dados) para evitar XSS.

import { ROTULOS_STATUS, STATUS_VALIDOS, filtrarProjetos, opcoesDeFiltro, resumoPorStatus } from './projetos.js';
import { ErroValidacao, criarRepositorio } from './repositorio.js';
import { buscarClima, buscarLocalizacao } from './clima.js';
import { destruirMapa, mostrarMapa } from './mapa.js';

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const data = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
// excluir: true deixa o botão de confirmação com o estilo de exclusão (texto avermelhado).
function confirmar({ titulo, mensagem, textoConfirmar = 'Confirmar', excluir = false }) {
  const modal = document.getElementById('modal-confirmacao');
  const botaoConfirmar = document.getElementById('modal-confirmar');
  const botaoCancelar = document.getElementById('modal-cancelar');
  document.getElementById('modal-titulo').textContent = titulo;
  document.getElementById('modal-mensagem').textContent = mensagem;
  botaoConfirmar.textContent = textoConfirmar;
  botaoConfirmar.className = excluir ? 'botao-excluir' : 'botao-primario';

  return new Promise((resolver) => {
    const fechar = (resultado) => () => modal.close(resultado);
    const aoConfirmar = fechar('confirmar');
    const aoCancelar = fechar('cancelar');
    const aoClicarFora = (evento) => {
      if (cliqueForaDaCaixa(modal, evento)) modal.close('cancelar');
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
    ['Orçamento total', moeda.format(resumo.orcamentoTotal), 'valor valor-moeda']
  ];
  document.getElementById('resumo').replaceChildren(
    ...cartoes.map(([rotulo, valor, classe = 'valor']) =>
      el('div', { className: 'cartao-resumo' }, [
        el('span', { className: classe, textContent: String(valor) }),
        el('span', { className: 'rotulo', textContent: rotulo })
      ])
    )
  );
}

function formatarPrazo(prazo) {
  return data.format(new Date(`${prazo}T00:00:00Z`));
}

function limitarProgresso(valor) {
  return Math.max(0, Math.min(100, Number(valor) || 0));
}

function criarBarraProgresso(p) {
  const progresso = limitarProgresso(p.progresso);
  const barra = el('div', { className: 'progresso' }, [el('span')]);
  barra.firstChild.style.width = `${progresso}%`;
  barra.setAttribute('role', 'progressbar');
  barra.setAttribute('aria-valuenow', String(progresso));
  barra.setAttribute('aria-valuemin', '0');
  barra.setAttribute('aria-valuemax', '100');
  barra.setAttribute('aria-label', `Progresso de ${p.nome}`);
  return barra;
}

function criarSelo(status) {
  return el('span', { className: `selo selo-${status}`, textContent: ROTULOS_STATUS[status] ?? status });
}

function listaDeCampos(campos) {
  return campos.flatMap(([dt, dd]) => [el('dt', { textContent: dt }), el('dd', { textContent: dd })]);
}

// Fecha o modal ao clicar no fundo escurecido (fora da caixa)
function cliqueForaDaCaixa(modal, evento) {
  if (evento.target !== modal) return false;
  const caixa = modal.getBoundingClientRect();
  return evento.clientX < caixa.left || evento.clientX > caixa.right
    || evento.clientY < caixa.top || evento.clientY > caixa.bottom;
}

// ---------------------------------------------------------------- Detalhes

let idEmDetalhe = null;

function renderizarDetalhes(p) {
  const progresso = limitarProgresso(p.progresso);
  document.getElementById('detalhes-titulo').textContent = p.nome;
  document.getElementById('detalhes-selo').replaceWith(
    Object.assign(criarSelo(p.status), { id: 'detalhes-selo' })
  );
  document.getElementById('detalhes-campos').replaceChildren(...listaDeCampos([
    ['Município', p.municipio],
    ['Equipe responsável', p.responsavel],
    ['Status', ROTULOS_STATUS[p.status] ?? p.status],
    ['Prazo', formatarPrazo(p.prazo)],
    ['Orçamento', moeda.format(p.orcamento)],
    ['Progresso', `${progresso}%`],
    ['Código', `#${p.id}`]
  ]));
  document.getElementById('detalhes-status').value = p.status;
}

// ---------------------------------------------------------------- Mapa e clima

// Cada abertura do modal gera uma consulta; respostas de consultas antigas são ignoradas
let consultaAtual = 0;

function mensagemClima(texto) {
  document.getElementById('clima-conteudo').replaceChildren(el('p', { className: 'mensagem', textContent: texto }));
}

function renderizarClima(clima) {
  const seta = el('span', { className: 'vento-seta', textContent: '↑' });
  // A direção meteorológica indica de onde o vento vem; a seta aponta para onde ele vai
  seta.style.transform = `rotate(${(clima.ventoGraus + 180) % 360}deg)`;
  seta.setAttribute('aria-hidden', 'true');

  const chuva = clima.chovendo
    ? `Sim${clima.precipitacao > 0 ? ` (${decimal.format(clima.precipitacao)} mm)` : ''}`
    : 'Não';

  document.getElementById('clima-conteudo').replaceChildren(
    el('div', { className: 'clima-principal' }, [
      el('span', { className: 'clima-icone', textContent: clima.icone }),
      el('span', { className: 'clima-temperatura', textContent: `${decimal.format(clima.temperatura)} °C` }),
      el('span', { className: 'clima-descricao', textContent: clima.descricao })
    ]),
    el('dl', { className: 'detalhes clima-dados' }, listaDeCampos([
      ['Chovendo agora', chuva],
      ['Umidade', `${Math.round(clima.umidade)}%`],
      ['Vento', `${decimal.format(clima.ventoKmh)} km/h`],
      ['Direção', `${clima.ventoDirecao.nome} (${clima.ventoDirecao.sigla}, ${Math.round(clima.ventoGraus)}°)`]
    ])),
    el('div', { className: 'clima-rosa' }, [seta, el('span', { textContent: `Vento vindo de ${clima.ventoDirecao.nome}` })]),
    el('p', {
      className: 'clima-fonte',
      textContent: `${clima.horario ? `Atualizado às ${clima.horario.slice(11, 16)} (horário local) · ` : ''}Dados: Open-Meteo.com`
    })
  );
}

async function carregarLocalEClima(projeto) {
  const consulta = ++consultaAtual;
  const aviso = document.getElementById('mapa-aviso');
  const mapa = document.getElementById('detalhes-mapa');
  const vigente = () => consulta === consultaAtual;

  destruirMapa();
  mapa.hidden = true;
  aviso.textContent = 'Localizando município…';
  mensagemClima('Carregando clima…');

  let local;
  try {
    local = await buscarLocalizacao(projeto.municipio);
  } catch {
    if (!vigente()) return;
    aviso.textContent = 'Não foi possível consultar a localização agora.';
    mensagemClima('Clima indisponível no momento.');
    return;
  }
  if (!vigente()) return;
  if (!local) {
    aviso.textContent = `Município "${projeto.municipio}" não encontrado no mapa. Use o formato "Cidade - UF".`;
    mensagemClima('Sem a localização do município, não é possível consultar o clima.');
    return;
  }

  const rotulo = local.estado ? `${local.nome}, ${local.estado}` : local.nome;
  aviso.textContent = rotulo;
  mapa.hidden = false;
  try {
    mostrarMapa(mapa, { ...local, rotulo });
  } catch {
    mapa.hidden = true;
    aviso.textContent = `${rotulo} (mapa indisponível)`;
  }

  try {
    const clima = await buscarClima(local);
    if (vigente()) renderizarClima(clima);
  } catch {
    if (vigente()) mensagemClima('Não foi possível obter o clima agora.');
  }
}

function abrirDetalhes(id) {
  const projeto = repositorio.buscar(id);
  if (!projeto) return;
  idEmDetalhe = projeto.id;
  renderizarDetalhes(projeto);
  document.getElementById('detalhes-mensagem').textContent = '';
  document.getElementById('modal-detalhes').showModal();
  document.getElementById('detalhes-fechar').focus();
  carregarLocalEClima(projeto);
}

function configurarDetalhes() {
  const modal = document.getElementById('modal-detalhes');
  const seletor = document.getElementById('detalhes-status');
  const mensagem = document.getElementById('detalhes-mensagem');

  seletor.replaceChildren(
    ...STATUS_VALIDOS.map((s) => el('option', { value: s, textContent: ROTULOS_STATUS[s] }))
  );

  seletor.addEventListener('change', () => {
    try {
      const atualizado = repositorio.atualizarStatus(idEmDetalhe, seletor.value);
      if (!atualizado) {
        modal.close();
        atualizar();
        return;
      }
      renderizarDetalhes(atualizado);
      mensagem.textContent = `Status alterado para "${ROTULOS_STATUS[atualizado.status]}".`;
      atualizar();
    } catch (erro) {
      mensagem.textContent = 'Não foi possível alterar o status.';
      console.error(erro);
    }
  });

  document.getElementById('detalhes-excluir').addEventListener('click', async () => {
    const projeto = repositorio.buscar(idEmDetalhe);
    if (!projeto) return;
    const confirmado = await confirmar({
      titulo: 'Excluir projeto',
      mensagem: `Excluir o projeto "${projeto.nome}"? Esta ação não pode ser desfeita.`,
      textoConfirmar: 'Excluir',
      excluir: true
    });
    if (confirmado) {
      repositorio.remover(projeto.id);
      modal.close();
      atualizar();
    }
  });

  document.getElementById('detalhes-fechar').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (evento) => {
    if (cliqueForaDaCaixa(modal, evento)) modal.close();
  });
  modal.addEventListener('close', () => {
    idEmDetalhe = null;
    consultaAtual += 1;
    destruirMapa();
  });
}

// ---------------------------------------------------------------- Lista

// O título do cartão é um botão; o CSS estende a área clicável a todo o cartão
function renderizarProjeto(p) {
  const abrir = el('button', { type: 'button', className: 'projeto-abrir', textContent: p.nome });
  abrir.setAttribute('aria-haspopup', 'dialog');
  abrir.addEventListener('click', () => abrirDetalhes(p.id));

  const item = el('li', { className: 'projeto' }, [
    criarSelo(p.status),
    el('h3', {}, [abrir]),
    el('dl', {}, listaDeCampos([
      ['Município', p.municipio],
      ['Responsável', p.responsavel],
      ['Prazo', formatarPrazo(p.prazo)],
      ['Orçamento', moeda.format(p.orcamento)],
      ['Progresso', `${limitarProgresso(p.progresso)}%`]
    ])),
    criarBarraProgresso(p)
  ]);
  item.dataset.testid = 'projeto';
  item.dataset.status = p.status;
  return item;
}

// ---------------------------------------------------------------- Filtros

function lerFiltros() {
  const valor = (id) => document.getElementById(id).value;
  return {
    status: valor('filtro-status'),
    municipio: valor('filtro-municipio'),
    responsavel: valor('filtro-equipe'),
    prazoDe: valor('filtro-prazo-de'),
    prazoAte: valor('filtro-prazo-ate'),
    orcamentoMin: valor('filtro-orcamento-min'),
    orcamentoMax: valor('filtro-orcamento-max')
  };
}

// Recria as opções a partir dos projetos cadastrados, mantendo a seleção se ela ainda existir
function preencherOpcoes(id, valores, rotuloTodos) {
  const seletor = document.getElementById(id);
  const atual = seletor.value;
  seletor.replaceChildren(
    el('option', { value: '', textContent: rotuloTodos }),
    ...valores.map((v) => el('option', { value: v, textContent: v }))
  );
  seletor.value = valores.includes(atual) ? atual : '';
}

function atualizar() {
  const mensagem = document.getElementById('mensagem');
  const lista = document.getElementById('lista-projetos');
  let todos;
  try {
    todos = repositorio.listar();
  } catch (erro) {
    lista.replaceChildren();
    mensagem.textContent = 'Não foi possível carregar os projetos.';
    console.error(erro);
    return;
  }

  renderizarResumo(todos);
  const { municipios, equipes } = opcoesDeFiltro(todos);
  preencherOpcoes('filtro-municipio', municipios, 'Todos');
  preencherOpcoes('filtro-equipe', equipes, 'Todas');

  try {
    const projetos = filtrarProjetos(todos, lerFiltros());
    lista.replaceChildren(...projetos.map(renderizarProjeto));
    mensagem.textContent = projetos.length === 0
      ? 'Nenhum projeto encontrado.'
      : `${projetos.length} projeto(s) exibido(s).`;
  } catch (erro) {
    if (!(erro instanceof RangeError)) throw erro;
    lista.replaceChildren();
    mensagem.textContent = `Filtro inválido: ${erro.message}.`;
  }
}

function configurarFiltros() {
  const form = document.getElementById('filtros');
  form.addEventListener('input', atualizar);
  form.addEventListener('change', atualizar);
  form.addEventListener('submit', (evento) => evento.preventDefault());
  document.getElementById('limpar-filtros').addEventListener('click', () => {
    form.reset();
    atualizar();
  });
}

// ---------------------------------------------------------------- Cadastro

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
  configurarFiltros();
  configurarDetalhes();
  configurarFormulario();
  atualizar();
}

iniciar();
