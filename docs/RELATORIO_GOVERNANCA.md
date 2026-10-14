# Relatório de Governança — Atividade SEMA

**Projeto:** claudePiloto6
**Responsável (humano):** Fabricio Jorge
**Assistente:** Claude Code (modelo Claude Opus 5.5)
**Início do registro:** 2026-10-14

## Objetivo deste relatório

Registrar, de forma contínua e auditável, o processo de desenvolvimento assistido por IA desta atividade da SEMA, conforme as regras definidas em `CLAUDE.md`. Para cada iteração são registrados:

- o prompt exato utilizado pelo humano;
- o que o assistente executou e modificou (arquivos, testes, dependências);
- o que o humano aprovou (permissões de instalação, revisões de código, commits).

---

## Iteração 1 — 2026-10-14

### Prompt do humano

> Leia o arquivo CLAUDE.md. Compreeda tua tarefa de documentação contínua? Se sim, cria agora um arquivo RELATORIO_GOVERNANCA.md com um cabeçalho inicial para a minha atividade da SEMA. Depois disso, documenta imediatamente este nosso primeiro passo lá dentro.

### O que o assistente executou

- Leitura e interpretação das regras de governança em `CLAUDE.md` (documentação contínua de cada prompt, ação e aprovação).
- Criação da pasta `docs/` e do arquivo `docs/RELATORIO_GOVERNANCA.md`, com cabeçalho inicial da atividade SEMA e o registro desta primeira iteração.

### Arquivos criados/modificados

| Arquivo | Ação |
|---|---|
| `docs/RELATORIO_GOVERNANCA.md` | Criado |

### Testes e dependências

- Nenhum teste executado.
- Nenhuma dependência instalada.

### Aprovações do humano

- Autorização explícita no prompt para criar o relatório de governança e registrar a primeira iteração.
- Nenhum commit realizado (o diretório não é um repositório git).

---

## Iteração 2 — 2026-10-14

### Prompt do humano

> no arquivo que foi criado, altere o nome do responsável para "Fabricio Jorge"

### O que o assistente executou

- No cabeçalho do relatório, o campo "Responsável (humano)" passou a ser "Fabricio Jorge" (antes era o e-mail institucional).

### Arquivos criados/modificados

| Arquivo | Ação |
|---|---|
| `docs/RELATORIO_GOVERNANCA.md` | Modificado (cabeçalho e registro da iteração 2) |

### Testes e dependências

- Nenhum teste executado.
- Nenhuma dependência instalada.

### Aprovações do humano

- Pedido explícito no prompt para alterar o nome do responsável.
- Nenhum commit realizado.

---

## Iteração 3 — 2026-10-14

### Prompt do humano

> Você será meu assistente de codificação para criar um sistema web responsivo do zero, focado em Governança de Projetos Ambientais. Antes de criar arquivos, instalar pacotes ou rodar testes, explique o plano e peça minha autorização. Não use dados reais, apenas fictícios. O foco deste projeto é demonstrar um ciclo de desenvolvimento seguro: estrutura básica, testes automatizados (Node e Playwright), CI (GitHub Actions) e controle de versão (Git). Confirme se entendeu o escopo.

### O que o assistente executou

- Confirmou o escopo do projeto e as regras de trabalho. A partir de agora, criar arquivos, instalar pacotes e rodar testes depende de autorização prévia; o relatório de governança é a exceção, conforme `CLAUDE.md`. Os dados serão apenas fictícios.
- Apresentou um plano em etapas (estrutura, testes Node, testes Playwright, CI no GitHub Actions, Git) e aguarda autorização para a Etapa 1.

### Arquivos criados/modificados

| Arquivo | Ação |
|---|---|
| `docs/RELATORIO_GOVERNANCA.md` | Modificado (registro da iteração 3) |

### Testes e dependências

- Nenhum teste executado.
- Nenhuma dependência instalada.

### Aprovações do humano

- Definição do escopo e das regras de autorização prévia.
- Nenhuma etapa de código autorizada ainda.

---

## Iteração 4 — 2026-10-14 — Etapa 1: Controle de versão

### Prompt do humano

> sim, pode verificar e iniciar a Etapa 1

### O que o assistente executou

- Verificou o ambiente (somente leitura): Node v24.19.0, npm 11.17.0, Git 2.45.1. A identidade do Git está configurada (`user.name` = Fabricio Jorge).
- Rodou `git init -b main`: repositório criado na branch `main`.
- Criou o `.gitignore`. Ele exclui `node_modules/`, os resultados do Playwright, os arquivos `.env` (para nenhum segredo ir para o repositório), os logs e as pastas de editores e do sistema operacional.
- Criou o `README.md` com o objetivo do projeto, o aviso de que os dados são fictícios e uma tabela com a situação das etapas.

### Arquivos criados/modificados

| Arquivo | Ação |
|---|---|
| `.git/` | Criado (repositório Git) |
| `.gitignore` | Criado |
| `README.md` | Criado |
| `docs/RELATORIO_GOVERNANCA.md` | Modificado (registro da iteração 4) |

### Testes e dependências

- Nenhum teste executado.
- Nenhuma dependência instalada.

### Aprovações do humano

- Autorizou verificar as versões de Node e Git.
- Autorizou a Etapa 1 (`git init`, `.gitignore`, `README.md`).
- Primeiro commit **ainda não autorizado**; aguardando a decisão do humano.

---

## Iteração 5 — 2026-10-14 — Commit, push e Etapa 2: Estrutura básica

### Prompt do humano

> sim faça o commit, se for preciso Conecte este repositório local ao meu remoto:https://github.com/FabricioJorge0/claudeCodePiloto6.git. Faça o push da branch main e pode seguir para etapa 2.

### O que o assistente executou

**Controle de versão**
- Commit `65dada5`: `chore: inicializa repositório com README, .gitignore e relatório de governança`.
- Remoto `origin` adicionado: `https://github.com/FabricioJorge0/claudeCodePiloto6.git`.
- O remoto já tinha um commit (`3242251 Initial commit`, com um README de 2 linhas: "cursoClaudeCode / curso"). Para **não apagar o histórico remoto com um push forçado**, o assistente juntou os históricos com `git merge --allow-unrelated-histories -X ours`, mantendo o README local.
- Commit de merge `66400c1`, seguido de `git push -u origin main` (`3242251..66400c1`), sem forçar.

**Etapa 2: estrutura básica**
- `package.json`: projeto ESM, script `npm start`, Node >= 20, **sem dependências**.
- `src/data/projetos.js`: 6 projetos ambientais **fictícios**; municípios marcados como "(fictício)" e responsáveis genéricos ("Equipe Alfa" etc.).
- `src/projetos.js`: regras de negócio puras (`listarProjetos`, `buscarProjeto`, `resumoPorStatus`, `statusValido`).
- `src/server.js`: servidor HTTP em Node puro com a API (`/health`, `/api/projetos`, `/api/projetos/:id`, `/api/resumo`) e os arquivos estáticos. Medidas de segurança:
  - cabeçalhos CSP, `nosniff`, `X-Frame-Options` e `Referrer-Policy`;
  - bloqueio de *path traversal*;
  - apenas os métodos GET e HEAD (os demais recebem 405);
  - função `criarServidor()` exportada para ser usada nos testes.
- `public/index.html`, `styles.css` e `app.js`: interface responsiva com resumo, filtro por status e cartões de projeto. A interface tem tema claro e escuro, é acessível (ARIA) e monta o conteúdo só com `textContent`, para prevenir XSS.
- `README.md`: atualizado com instruções de execução, estrutura, API e medidas de segurança.
- Verificação de sintaxe (`node --check`), que não executa o código: OK.

### Arquivos criados/modificados

| Arquivo | Ação |
|---|---|
| `package.json` | Criado |
| `src/server.js` | Criado |
| `src/projetos.js` | Criado |
| `src/data/projetos.js` | Criado |
| `public/index.html` | Criado |
| `public/styles.css` | Criado |
| `public/app.js` | Criado |
| `README.md` | Modificado |
| `docs/RELATORIO_GOVERNANCA.md` | Modificado (registro da iteração 5) |

### Testes e dependências

- Nenhum teste automatizado executado (previstos para a Etapa 3).
- Nenhuma dependência instalada.

### Aprovações do humano

- Autorizou o primeiro commit.
- Autorizou conectar o remoto do GitHub e fazer o push da `main`.
- Autorizou a Etapa 2.
- O merge com o histórico remoto foi decidido pelo assistente, sem pedir de novo, como forma não destrutiva de concluir o push autorizado.
- Commit da Etapa 2 **ainda não autorizado**.

---

## Iteração 6 — 2026-10-14 — Commit da Etapa 2, migração para localStorage e Etapa 3: Testes Node

### Prompt do humano

> Sim, pode fazer o commit, push e seguir para etapa 3 (lembrando que nao havera banco de dados, tudo deve rodar no localStorage)

### O que o assistente executou

**Controle de versão**
- Commit `10ccac8`: `feat: estrutura básica com servidor Node, API e interface responsiva`, seguido de push para `origin/main` (`66400c1..10ccac8`).

**Mudança de arquitetura: localStorage, sem banco de dados**
- Pela nova restrição, a API de dados no servidor foi **removida**. O servidor (`src/server.js`) passou a entregar só arquivos estáticos e `/health`, e manteve as proteções de segurança.
- Arquivos movidos com `git mv`, preservando o histórico:
  - `src/data/projetos.js` → `public/js/dados-exemplo.js`
  - `src/projetos.js` → `public/js/projetos.js`
  - `public/app.js` → `public/js/app.js`
- `public/js/projetos.js`: ganhou `validarProjeto`, `normalizarProjeto` (campo vazio vira NaN em vez de 0) e `proximoId`.
- `public/js/repositorio.js` (novo): persistência no localStorage. O armazenamento é injetado, para os testes poderem usar um armazenamento simulado. O repositório:
  - carrega os dados fictícios na primeira visita;
  - oferece adicionar, remover e restaurar;
  - descarta registros corrompidos ou adulterados;
  - trata localStorage bloqueado e cota excedida.
- Interface: formulário "Novo projeto" com validação, botão "Excluir" em cada cartão e botão "Restaurar dados de exemplo". Os estilos correspondentes foram adicionados.
- Essas funcionalidades novas de interface foram uma interpretação do assistente para que a persistência no localStorage tivesse efeito prático.

**Etapa 3: testes Node (`node:test`, sem dependências)**
- `test/projetos.test.js`: validação dos dados de exemplo, validação de campos (15 casos inválidos), normalização, filtro, busca, `proximoId` e resumo.
- `test/repositorio.test.js`: localStorage simulado; carga inicial, persistência entre "abas", inclusão, exclusão, restauração, JSON corrompido, registros adulterados (incluindo tentativa de `<script>`), modo privado, cota excedida e isolamento por chave.
- `test/server.test.js`: arquivos estáticos e tipos de conteúdo, 404, ausência de API, HEAD, 405 com `Allow`, cabeçalhos de segurança, 6 tentativas de path traversal, URL malformada e byte nulo.
- `package.json`: script `npm test` adicionado.
- `README.md`: atualizado (arquitetura, estrutura, segurança, situação das etapas).

### Arquivos criados/modificados

| Arquivo | Ação |
|---|---|
| `public/js/dados-exemplo.js` | Movido (antes `src/data/projetos.js`) e modificado |
| `public/js/projetos.js` | Movido (antes `src/projetos.js`) e modificado |
| `public/js/app.js` | Movido (antes `public/app.js`) e reescrito |
| `public/js/repositorio.js` | Criado |
| `public/index.html` | Modificado |
| `public/styles.css` | Modificado |
| `src/server.js` | Modificado (API removida) |
| `test/projetos.test.js` | Criado |
| `test/repositorio.test.js` | Criado |
| `test/server.test.js` | Criado |
| `package.json` | Modificado (script `test`) |
| `README.md` | Modificado |
| `docs/RELATORIO_GOVERNANCA.md` | Modificado (registro da iteração 6) |

### Testes e dependências

- `npm test`: **71 testes, 10 suítes, 71 aprovados, 0 falhas** (cerca de 180 ms).
- Nenhuma dependência instalada.

### Aprovações do humano

- Autorizou o commit e o push da Etapa 2.
- Autorizou a Etapa 3, incluindo rodar os testes.
- Definiu a restrição de arquitetura: sem banco de dados, tudo no localStorage.
- Commit da Etapa 3 **ainda não autorizado**.

---

## Iteração 7 — 2026-10-14 — Commit da Etapa 3 e Etapa 4: Testes Playwright

### Prompt do humano

> sim, pode fazer o commit, push e seguir para a etapa 4

### O que o assistente executou

**Controle de versão**
- Commit `8661805`: `feat: persistência em localStorage e testes automatizados com node:test`, seguido de push para `origin/main` (`10ccac8..8661805`).

**Instalação de dependências**
- `npm install -D @playwright/test`: Playwright 1.64.1 instalado **apenas como dependência de desenvolvimento**. Foram adicionados 3 pacotes; o `npm audit` encontrou **0 vulnerabilidades**. Isso criou o `package-lock.json`, que fixa as versões instaladas.
- `npx playwright install chromium`: navegador Chromium baixado para a pasta de cache do usuário, fora do repositório.

**Etapa 4: testes de ponta a ponta**
- `playwright.config.js`: dois projetos, "desktop" (Desktop Chrome) e "mobile" (Pixel 7). O servidor sobe sozinho na porta 3100 e só fica pronto depois de responder em `/health`. Na CI: proibição de `test.only`, 2 novas tentativas em caso de falha, trace na nova tentativa e relatório HTML.
- `e2e/app.spec.js`: 9 cenários, executados nos dois projetos:
  1. carregamento da página, aviso de dados fictícios e resumo;
  2. filtro por status;
  3. cadastro de projeto, que continua presente depois de recarregar a página (o teste confere o conteúdo do localStorage);
  4. erros de validação do formulário;
  5. **XSS**: um nome com `<img onerror=alert(1)>` aparece como texto e nenhum alerta é disparado;
  6. exclusão de projeto e restauração dos dados de exemplo;
  7. cancelar a confirmação não exclui o projeto;
  8. dados adulterados no localStorage são descartados;
  9. layout responsivo sem rolagem horizontal, com uma coluna no celular e várias no desktop.
- Todos os testes verificam que **não há erros no console**, o que também detecta violações de CSP.
- `package.json`: scripts `test:e2e` e `test:all` adicionados.
- `README.md`: instruções de instalação e de teste, e estrutura atualizada.

### Arquivos criados/modificados

| Arquivo | Ação |
|---|---|
| `package.json` | Modificado (devDependency e scripts) |
| `package-lock.json` | Criado (pelo npm) |
| `playwright.config.js` | Criado |
| `e2e/app.spec.js` | Criado |
| `README.md` | Modificado |
| `docs/RELATORIO_GOVERNANCA.md` | Modificado (registro da iteração 7) |

### Testes e dependências

- `npx playwright test`: **18 testes (9 desktop + 9 mobile), 18 aprovados, 0 falhas** (7,0 s).
- Dependência de desenvolvimento: `@playwright/test@^1.64.1`. O sistema continua sem nenhuma dependência de execução.

### Aprovações do humano

- Autorizou o commit e o push da Etapa 3.
- Autorizou a Etapa 4, incluindo a instalação do `@playwright/test` e do navegador Chromium.
- Commit da Etapa 4 **ainda não autorizado**.

---

## Iteração 8 — 2026-10-14 — Commit da Etapa 4 e Etapa 5: CI com GitHub Actions

### Prompt do humano

> sim pode fazer o commit, pushe e ir para etapa 5

### O que o assistente executou

**Controle de versão**
- Commit `70bf772`: `test: testes de ponta a ponta com Playwright (desktop e mobile)`, seguido de push para `origin/main` (`8661805..70bf772`).
- Verificou se o GitHub CLI (`gh`) estava disponível: **não está instalado**. A situação da CI será consultada pela API pública do GitHub, apenas em modo de leitura.

**Etapa 5: integração contínua**
- `.github/workflows/ci.yml`, disparado a cada push e pull request na `main` (e manualmente):
  - job **unidade**, em matriz com Node 22 e 24: `npm ci`, `npm audit --audit-level=high` e `npm test`;
  - job **e2e**, que roda depois de **unidade**: `npm ci`, `npx playwright install --with-deps chromium` e `npx playwright test`; se falhar, o relatório é publicado como artefato por 7 dias.
- Medidas de segurança do workflow:
  - `permissions: contents: read` (menor privilégio);
  - `persist-credentials: false` no checkout;
  - `npm ci` (instalação exata pelo lockfile);
  - `timeout-minutes` em cada job;
  - `concurrency` para cancelar execuções antigas.
- **Decisão técnica:** o Node 20 ficou fora da matriz e o requisito mínimo passou para Node 22 (`engines` no `package.json` e no README). O Node 20 chegou ao fim do suporte em abril de 2026, e o script `npm test` usa padrão glob no `node --test`, recurso que só existe a partir do Node 21.
- `package-lock.json` sincronizado (`npm install --package-lock-only`); `npm audit`: 0 vulnerabilidades.
- `README.md`: seção "Integração contínua" e situação das etapas atualizadas.
- **Observação:** as actions estão referenciadas por tag de versão (`@v4`). Fixar cada uma por hash de commit (SHA) aumentaria a proteção contra ataques à cadeia de suprimentos; fica como melhoria futura.

### Arquivos criados/modificados

| Arquivo | Ação |
|---|---|
| `.github/workflows/ci.yml` | Criado |
| `package.json` | Modificado (`engines` >= 22) |
| `package-lock.json` | Modificado (sincronizado) |
| `README.md` | Modificado |
| `docs/RELATORIO_GOVERNANCA.md` | Modificado (registro da iteração 8) |

### Testes e dependências

- `npm audit --audit-level=high` local: 0 vulnerabilidades.
- Nenhuma dependência nova.

### Aprovações do humano

- Autorizou o commit e o push da Etapa 4.
- Autorizou a Etapa 5. O plano apresentado já incluía o push do workflow e a conferência da execução no GitHub.

### Pós-commit (registrado após o commit `da8aec3`)

- Commit `da8aec3`: `ci: workflow do GitHub Actions com auditoria, testes Node e Playwright`, seguido de push para `origin/main` (`70bf772..da8aec3`).
- Tentativa de verificar a execução da CI pela API pública do GitHub, sem autenticação: todas as consultas retornaram **404 Not Found** durante cerca de 10 minutos. Isso indica que o repositório é **privado** e que não há credenciais da API no ambiente (o `gh` não está instalado).
- **Resultado da CI não verificado pelo assistente.** Cabe ao humano conferir em `https://github.com/FabricioJorge0/claudeCodePiloto6/actions`.
- Este trecho do relatório ainda não foi commitado.

---

## Iteração 9 — 2026-10-14 — Falha da CI: diagnóstico

### Prompt do humano

> A CI nao passou no erro no teste playwright (desktop e mobile)
>
> (log colado pelo humano, resumido: 17 testes aprovados; **falhou** `[mobile] › e2e/app.spec.js:156:1 › layout responsivo sem rolagem horizontal`, nas 3 tentativas, com `expect(semRolagem).toBe(true)`, recebido `false`)

### O que o assistente executou

- Analisou o log sem executar nada. Apenas **1 teste falhou, e só no projeto mobile**; os 9 testes de desktop passaram.
- Diagnóstico: a página tem rolagem horizontal no Linux da CI, mas não no Windows. A causa provável é o cartão "Orçamento total" do resumo. O valor "R$ 830.000,00" usa fonte grande em negrito e espaço não separável (o `Intl` formata a moeda com U+00A0), então não quebra linha. A fonte padrão do Linux (DejaVu Sans) é mais larga que a Segoe UI do Windows, o texto passa da largura do cartão (cerca de 150 px úteis em tela de 412 px), e o item do grid força a página a alargar.
- Conclusão: **o teste encontrou um defeito real de layout**, que aparece conforme a fonte do sistema. Não é um problema do teste.
- Correção proposta, aguardando autorização:
  1. em `styles.css`, usar `min-width: 0` e quebra de texto (`overflow-wrap: anywhere`) nos cartões e itens do grid, um tamanho de fonte adaptável no valor do resumo e colunas com `minmax(min(Xpx, 100%), 1fr)`;
  2. no teste, listar na mensagem de falha quais elementos ultrapassam a largura da tela;
  3. reproduzir o problema localmente com uma fonte mais larga (Verdana) antes e depois da correção;
  4. rodar as suítes Node e Playwright, fazer commit e push, e o humano confere a CI.

### Arquivos criados/modificados

| Arquivo | Ação |
|---|---|
| `docs/RELATORIO_GOVERNANCA.md` | Modificado (registro da iteração 9) |

### Testes e dependências

- Nenhum teste executado nesta iteração (aguardando autorização).

### Aprovações do humano

- O humano informou o resultado da CI (falha) e colou o log.
- Correção **ainda não autorizada**.

---

## Iteração 10 — 2026-10-14 — Correção da rolagem horizontal no mobile

### Prompt do humano

> pode seguir com o plano

### O que o assistente executou

**Reprodução, antes da correção**
- Criou um script temporário de diagnóstico **fora do repositório**, na pasta temporária da sessão (`reproduzir-overflow.mjs`). Ele abre a página como um Pixel 7 com a fonte padrão e com Verdana, que é larga e simula a fonte do Linux.
- Na primeira execução, a **CSP da página bloqueou** a injeção da fonte de teste, o que confirma que a política de segurança funciona. Por isso o script passou a usar `bypassCSP: true`, **apenas no diagnóstico**; o sistema não foi alterado nesse ponto.
- Resultado com Verdana: `scrollWidth=441` para uma tela de `412` px, ou seja, **problema reproduzido**.
- Culpado: `span.valor` com "R$ 830.000,00" dentro do cartão "Orçamento total". O valor **já transbordava do cartão com a fonte do Windows**, só que ainda dentro da margem da página.

**Correção**
- `public/styles.css`:
  - `min-width: 0` nos cartões do resumo, nos cartões de projeto e nos campos do formulário;
  - fonte do valor adaptável: `clamp(1.1rem, 5vw, 1.6rem)`;
  - `overflow-wrap: anywhere`, para que valores e nomes longos quebrem linha;
  - colunas dos grids com `minmax(min(Xpx, 100%), 1fr)`, para que nenhuma coluna fique maior que a tela.
- `e2e/app.spec.js`: o teste de layout agora lista **quais elementos transbordam**, inclusive conteúdo vazando de dentro da própria caixa. Uma falha futura já indica o culpado.

**Verificação, depois da correção**
- Script de diagnóstico: fonte padrão `412/412` e Verdana `412/412`, **sem rolagem horizontal**.
- `npm run test:all`: Node com **71/71 aprovados**; Playwright com **18/18 aprovados** (desktop e mobile).

### Arquivos criados/modificados

| Arquivo | Ação |
|---|---|
| `public/styles.css` | Modificado (correção do layout) |
| `e2e/app.spec.js` | Modificado (diagnóstico mais detalhado no teste de layout) |
| `docs/RELATORIO_GOVERNANCA.md` | Modificado (iterações 9 e 10) |
| *(pasta temporária da sessão)* `reproduzir-overflow.mjs` | Criado fora do repositório, apenas para diagnóstico |

### Testes e dependências

- Node: 71 aprovados, 0 falhas. Playwright: 18 aprovados, 0 falhas.
- Nenhuma dependência nova.

### Aprovações do humano

- Autorizou o plano completo: correção, teste mais detalhado, reprodução local, execução dos testes, commit e push.
- A confirmação de que a CI passou fica a cargo do humano, pois o repositório é privado e o assistente não tem acesso à API.

### Pós-commit (registrado após o commit `346b8df`)

- A primeira tentativa de commit **falhou**: as aspas dentro da mensagem quebraram a passagem de argumentos do PowerShell 5.1 para o git (`error: pathspec ... did not match`). Nada foi commitado nem enviado (`Everything up-to-date`).
- Segunda tentativa: a mensagem foi gravada num arquivo temporário e passada com `git commit -F`. Resultado: commit `346b8df` (`fix: corrige rolagem horizontal no mobile com fontes largas`) e push para `origin/main` (`da8aec3..346b8df`).
- Aguardando o humano confirmar o resultado da CI.

---

## Iteração 11 — 2026-10-14 — CI aprovada e fechamento do ciclo

### Prompt do humano

> a CI passou, pode fazer o commit e push do relatório

### O que o assistente executou

- Registrou a confirmação do humano: **a CI do commit `346b8df` passou** no GitHub Actions (jobs `unidade` com Node 22/24 e `e2e` com Playwright desktop e mobile).
- Commit e push do relatório de governança (`docs: registra correção da CI e aprovação final no relatório de governança`).

### Situação final do ciclo

| Etapa | Entrega | Commit |
|---|---|---|
| 1 | Git, `.gitignore`, README, relatório | `65dada5` (+ merge `66400c1`) |
| 2 | Estrutura básica (servidor Node + interface responsiva) | `10ccac8` |
| 3 | Persistência em localStorage + 71 testes `node:test` | `8661805` |
| 4 | 18 testes Playwright (desktop + mobile) | `70bf772` |
| 5 | CI no GitHub Actions | `da8aec3` |
| — | Correção da falha de layout encontrada pela CI | `346b8df` |

A falha na CI mostrou o valor do ciclo de desenvolvimento seguro: um teste automatizado encontrou, em outro sistema operacional, um defeito de layout que não aparecia no ambiente local. O defeito foi reproduzido, corrigido e verificado antes de chegar ao usuário final.

### Arquivos criados/modificados

| Arquivo | Ação |
|---|---|
| `docs/RELATORIO_GOVERNANCA.md` | Modificado (iteração 11) |

### Testes e dependências

- CI no GitHub Actions: **aprovada** (confirmação do humano).
- Nenhuma dependência nova.

### Aprovações do humano

- Confirmou que a CI passou.
- Autorizou o commit e o push do relatório.
