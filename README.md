# Governança de Projetos Ambientais

Sistema web responsivo para acompanhar projetos ambientais (status, responsável e prazo), criado para mostrar um ciclo de desenvolvimento seguro na atividade da SEMA.

> **Aviso:** todos os dados do sistema são **fictícios**. Nenhum projeto, pessoa ou organização real está representado.

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
| 5 | CI com GitHub Actions | Pendente |

## Arquitetura

**Não há banco de dados.** Os projetos ficam no `localStorage` do navegador (chave `gpa:projetos:v1`). Na primeira visita, os dados fictícios de exemplo são carregados automaticamente. O servidor Node apenas entrega os arquivos estáticos.

Funcionalidades: resumo por status, filtro, cadastro de projeto com validação, exclusão e restauração dos dados de exemplo.

## Como executar

Requisito: Node.js 20 ou superior.

```bash
npm install                          # instala o Playwright (apenas desenvolvimento)
npx playwright install chromium      # baixa o navegador dos testes E2E

npm start           # acesse http://localhost:3000
npm test            # testes de unidade e servidor (node:test)
npm run test:e2e    # testes de ponta a ponta (Playwright, desktop e celular)
npm run test:all    # todos os testes
```

## Estrutura

```
src/
  server.js              servidor HTTP estático (Node puro) + /health
public/
  index.html, styles.css interface responsiva
  js/app.js              interface (DOM)
  js/repositorio.js      persistência no localStorage
  js/projetos.js         regras de negócio e validação (funções puras)
  js/dados-exemplo.js    dados fictícios
test/
  projetos.test.js       regras de negócio e validação
  repositorio.test.js    localStorage (com armazenamento simulado)
  server.test.js         servidor e segurança
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

## Governança

O processo de desenvolvimento assistido por IA está registrado em [`docs/RELATORIO_GOVERNANCA.md`](docs/RELATORIO_GOVERNANCA.md).
