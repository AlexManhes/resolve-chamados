# Resolve — Central de chamados

Plataforma demonstrativa em português para acompanhar solicitações, prioridades, responsáveis, comentários e prazos. Feita com HTML, CSS e JavaScript, sem dependências de interface.

## Funcionalidades

- Painel com indicadores, prioridades e visão das etapas de atendimento.
- Abertura de tickets com assunto, categoria, prioridade e descrição.
- Um print opcional por chamado, com prévia, troca e remoção antes do envio e visualização ampliada nos detalhes.
- Filas pesquisáveis, filtros por prioridade, responsável, status e prazo.
- Distribuição pelo gestor e opção de assumir um chamado livre pelo atendente.
- Conversa pública, notas internas e histórico das ações.
- Resposta do solicitante retoma automaticamente um atendimento que aguardava o cliente.
- Solução obrigatória antes da resolução; fechamento exclusivo do gestor.
- Reabertura com novo prazo e preservação do histórico da solução anterior.
- Exportação dos tickets visíveis ao perfil em JSON.

## Perfis e permissões

| Perfil | Ações |
| --- | --- |
| Solicitante | Abre em seu nome, vê apenas seus tickets, envia comentários públicos e reabre os próprios chamados resolvidos. |
| Atendente | Consulta a central, assume chamados livres, atende os atribuídos a si e cria notas internas nesses tickets. |
| Gestor | Distribui responsáveis, altera prioridade e prazo, acompanha todas as etapas e fecha tickets resolvidos. |

O seletor no topo **simula identidades** para demonstrar as regras. As permissões são validadas nas funções do modelo e a interface oferece apenas as ações permitidas. **Esta versão não implementa autenticação ou autorização de servidor.** Como os dados estão no navegador, não existe isolamento contra alguém com acesso ao armazenamento ou às ferramentas de desenvolvimento. Para uso real com dados privados, é necessário um servidor autenticado que imponha essas regras, um banco compartilhado e validação de acesso em cada requisição.

## Fluxo

`Aberto → Em atendimento → Aguardando cliente → Em atendimento → Resolvido → Fechado`

Também é possível resolver diretamente a partir do atendimento ou da espera pelo cliente. Iniciar o atendimento exige um responsável. O solicitante pode reabrir um ticket resolvido; o gestor e o atendente responsável também podem reabrir os tickets concluídos. A reabertura volta para Aberto, preserva o responsável e inicia um novo prazo. A solução anterior permanece no histórico.

## Prazos

O prazo inicial usa horas corridas: urgente **4 h**, alta **24 h**, normal **72 h**, baixa **120 h**. Fins de semana contam. Datas são armazenadas em ISO UTC e exibidas em **America/Sao_Paulo**. A troca da prioridade preserva o prazo atual, que o gestor pode ajustar explicitamente. Um novo prazo deve estar no futuro. Tickets resolvidos e fechados não contam como atrasados.

## Executar

Com Node.js instalado:

```sh
node serve.cjs
```

Abra http://127.0.0.1:8792/.

## Verificar

```sh
node --check js/app.js
node tests/model.cjs
```

Os testes cobrem visibilidade por perfil, ocultação de notas internas, acesso indevido, autoria, atribuição, fluxo, encerramento, reabertura, SLA, indicadores e validação dos dados persistidos.

## Organização

```text
index.html       Estrutura da interface
css/styles.css   Estilos responsivos
js/model.js      Regras de negócio e dados fictícios
js/app.js        Interface, perfis e persistência
tests/model.cjs       Testes das regras e permissões simuladas
serve.cjs             Servidor de prévia local
```

## Dados

O print aceita PNG, JPG ou WebP de até 5 MB. Imagens maiores são otimizadas para até 1920 pixels por dimensão e 600 KB antes de salvar. O anexo acompanha o ticket no armazenamento local e na exportação. Se o navegador estiver sem espaço, o formulário permanece aberto e os dados anteriores são preservados.

Os registros são fictícios. Os dados ficam no armazenamento local de cada navegador e não são sincronizados entre dispositivos ou usuários. Limpar os dados do site remove os registros. A exportação gera uma cópia em JSON; ainda não existe interface de importação. A publicação estática disponibiliza a demonstração, sem enviar os tickets a um servidor.
