# Governança de Projetos Ambientais

Sistema web responsivo para acompanhar projetos ambientais (status, responsável e prazo), criado para mostrar um ciclo de desenvolvimento seguro na atividade da SEMA.

> **Aviso:** projetos, equipes, prazos e valores são **fictícios**. Nenhum projeto, pessoa ou organização real está representado. Os **municípios são reais** (formato "Cidade - UF") apenas para localizar o projeto no mapa e consultar o clima da região.

## Objetivos

- Estrutura básica de um sistema web com Node.js
- Testes automatizados de unidade (`node:test`) e de ponta a ponta (Playwright)
- Integração contínua com GitHub Actions
- Controle de versão com Git

## Situação

| Etapa | Descrição | Status |
|---|---|---|
| 1 | Controle de versão (Git, `.gitignore`, README) | Concluída |
| 2 | Estrutura básica (servidor Node + página responsiva) | Concluída |
| 3 | Testes Node + persistência em localStorage | Concluída |
| 4 | Testes Playwright (desktop + celular) | Concluída |
| 5 | CI com GitHub Actions | Concluída |

## Integração contínua

O workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda a cada push e pull request na `main`:

1. **unidade** (Node 22 e 24): `npm ci`, `npm audit --audit-level=high` e `npm test`
2. **e2e** (roda depois da anterior): instala o Chromium e roda o Playwright em desktop e celular; se falhar, publica o relatório como artefato

Segurança do workflow: permissão apenas de leitura (`contents: read`), checkout sem credenciais persistidas e instalação exata pelo lockfile.

## Arquitetura

**Não há banco de dados.** Os projetos ficam no `localStorage` do navegador (chave `gpa:projetos:v1`). Na primeira visita, os dados fictícios de exemplo são carregados automaticamente. O servidor Node apenas entrega os arquivos estáticos.

Funcionalidades:

- **Resumo** por status e orçamento total.
- **Cadastro** de projeto com validação.
- **Filtros** combináveis: status, município, equipe, intervalo de prazo e faixa de orçamento. As opções de município e equipe vêm dos projetos cadastrados. O botão "Limpar filtros" restaura a lista completa.
- **Detalhes em modal:** clicar em qualquer ponto do cartão de um projeto (ou focar o título e apertar Enter) abre um modal com todas as informações. Nele é possível **alterar o status**, que é salvo na hora, e **excluir o projeto**, com confirmação.
- **Mapa e clima do município** (no modal de detalhes): mapa com a localização do município (Leaflet + OpenStreetMap) e um cartão com o tempo atual: temperatura, condição, se está chovendo, umidade, velocidade do vento (km/h) e direção (ponto cardeal e seta). Município não encontrado ou serviço fora do ar geram mensagens claras, sem quebrar o modal. Adaptado do projeto [Projeto_clima](https://github.com/FabricioJorge0/Projeto_clima).
- Os cartões da lista não têm botão de exclusão, e não existe mais o botão de restaurar os dados de exemplo. Os dados de exemplo são carregados só na primeira visita.

**Paleta visual:** branco predominante e verde como cor de apoio (faixa do topo, bordas, barras de progresso, painel do formulário). O texto é sempre preto, ou branco sobre o verde. As exceções são os selos de status (cada um na sua cor), os botões **Excluir** (texto avermelhado) e **Salvar projeto** (texto verde). A regra é verificada por um teste E2E.

Toda confirmação é feita em **modal próprio** (`<dialog>`), nunca com `alert`, `confirm` ou `prompt` do navegador. O foco inicial fica em "Cancelar", e Esc ou clique fora do modal cancelam a ação. Essa regra é garantida por testes: uma verificação estática do código em `test/sem-dialogos-nativos.test.js` e uma verificação no navegador em todos os testes E2E.

## Como executar

Requisito: Node.js 22 ou superior.

```bash
npm install                          # instala o Playwright (apenas desenvolvimento)
npx playwright install chromium      # baixa o navegador dos testes E2E

npm start           # acesse http://localhost:3000
npm test            # testes de unidade e servidor (node:test)
npm run test:e2e    # testes de ponta a ponta (Playwright, desktop e celular)
npm run test:all    # todos os testes
```

### E2E contra o ambiente publicado (Vercel)

Com `BASE_URL` definida, o Playwright testa a URL informada (sem subir servidor local) e grava o **trace de todos os testes**:

```powershell
# PowerShell
$env:BASE_URL = "https://claude-code-piloto6.vercel.app"
npx playwright test
npx playwright show-report                          # relatório HTML (playwright-report/)
npx playwright show-trace test-results/<teste>/trace.zip
```

```bash
# bash
BASE_URL=https://claude-code-piloto6.vercel.app npx playwright test
```

URLs de deploy protegidas pela Vercel (ex.: `...-<hash>-<time>.vercel.app`) exigem o segredo de *Protection Bypass for Automation* na variável `VERCEL_AUTOMATION_BYPASS_SECRET`. Nunca coloque esse segredo no código.

## Estrutura

```
src/
  server.js              servidor HTTP estático (Node puro) + /health
public/
  index.html, styles.css interface responsiva
  js/app.js              interface (DOM)
  js/repositorio.js      persistência no localStorage
  js/projetos.js         regras de negócio e validação (funções puras)
  js/dados-exemplo.js    dados de exemplo (projetos fictícios, municípios reais)
  js/clima.js            localização e clima (Open-Meteo), com validação das respostas
  js/mapa.js             mapa do município (Leaflet)
  vendor/leaflet/        Leaflet 1.9.4 (cópia local, integridade SRI conferida; licença BSD-2)
test/
  projetos.test.js       regras de negócio e validação
  clima.test.js          clima e localização (fetch simulado, sem rede)
  repositorio.test.js    localStorage (com armazenamento simulado)
  server.test.js         servidor e segurança
  sem-dialogos-nativos.test.js  proíbe alert/confirm/prompt no front-end
e2e/
  app.spec.js            fluxos no navegador (Playwright)
playwright.config.js     projetos "desktop" e "mobile" (Pixel 7); sobe o servidor sozinho
```

Status válidos: `planejamento`, `em_execucao`, `atrasado`, `concluido`.

## Segurança

- Cabeçalhos de segurança em todas as respostas (CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`)
- Proteção contra *path traversal* nos arquivos estáticos (coberta por testes)
- Somente os métodos `GET` e `HEAD` são aceitos
- O front-end usa `textContent` em vez de `innerHTML`, o que previne XSS
- Os dados lidos do localStorage são validados, e registros corrompidos ou adulterados são descartados
- Tratamento de localStorage indisponível (modo privado) e de cota excedida
- Nenhuma dependência de execução em produção
- Serviços externos sem chave de API (nenhum segredo no código). A CSP do servidor libera só o necessário: imagens de `tile.openstreetmap.org` e chamadas a `api.open-meteo.com` e `geocoding-api.open-meteo.com`. Scripts e estilos vêm apenas do próprio site.
- O popup do mapa recebe o texto como elemento (`textContent`), pois o Leaflet interpretaria strings como HTML
- Respostas das APIs são validadas (números, tipos) antes de exibir; consultas antigas são descartadas ao trocar de projeto
- Testes E2E simulam as APIs e o mapa (não dependem da internet nem do clima do dia)

## Serviços externos e créditos

| Serviço | Uso | Licença / termos |
|---|---|---|
| [Open-Meteo](https://open-meteo.com) | Geocodificação do município e clima atual | Gratuito para uso não comercial, sem chave; dados CC BY 4.0 (créditos exibidos no cartão) |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Imagens do mapa | ODbL (créditos exibidos no mapa) |
| [Leaflet](https://leafletjs.com) | Biblioteca do mapa | BSD-2 (`public/vendor/leaflet/LICENSE`) |

## Governança

O processo de desenvolvimento assistido por IA está registrado em [`docs/RELATORIO_GOVERNANCA.md`](docs/RELATORIO_GOVERNANCA.md).
