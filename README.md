# Governança de Projetos Ambientais

Sistema web responsivo para acompanhar projetos ambientais (status, responsável e prazo), criado para mostrar um ciclo de desenvolvimento seguro na atividade da SEMA.

> **Aviso:** todos os dados do sistema são **fictícios**. Nenhum projeto, pessoa ou organização real está representado.

## Objetivos

- Estrutura básica de um sistema web com Node.js
- Testes automatizados de unidade/API (`node:test`) e de ponta a ponta (Playwright)
- Integração contínua com GitHub Actions
- Controle de versão com Git

## Situação

| Etapa | Descrição | Status |
|---|---|---|
| 1 | Controle de versão (Git, `.gitignore`, README) | Concluída |
| 2 | Estrutura básica (servidor Node + página responsiva) | Concluída |
| 3 | Testes Node | Pendente |
| 4 | Testes Playwright | Pendente |
| 5 | CI com GitHub Actions | Pendente |

## Como executar

Requisito: Node.js 20 ou superior.

```bash
npm start
# acesse http://localhost:3000
```

## Estrutura

```
src/
  server.js          servidor HTTP (Node puro) + API
  projetos.js        regras de negócio (funções puras)
  data/projetos.js   dados fictícios
public/
  index.html, styles.css, app.js   interface responsiva
```

### API

| Rota | Descrição |
|---|---|
| `GET /health` | Verificação de saúde |
| `GET /api/projetos?status=` | Lista os projetos (filtro opcional por status) |
| `GET /api/projetos/:id` | Detalhe de um projeto |
| `GET /api/resumo` | Totais por status e orçamento total |

Status válidos: `planejamento`, `em_execucao`, `atrasado`, `concluido`.

## Segurança

- Cabeçalhos de segurança em todas as respostas (CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`)
- Proteção contra *path traversal* nos arquivos estáticos
- Somente os métodos `GET` e `HEAD` são aceitos
- O front-end usa `textContent` em vez de `innerHTML`, o que previne XSS
- Nenhuma dependência de execução em produção

## Governança

O processo de desenvolvimento assistido por IA está registrado em [`docs/RELATORIO_GOVERNANCA.md`](docs/RELATORIO_GOVERNANCA.md).
