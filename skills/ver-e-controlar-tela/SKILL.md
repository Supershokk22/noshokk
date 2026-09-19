---
name: ver-e-controlar-tela
description: Use quando o usuário pedir para ver a tela, operar o navegador ou aplicativos do Windows, clicar, digitar, rolar ou verificar visualmente uma ação. Usa o MCP local open-computer-use.
---

# Ver e controlar a tela no OpenCode

Você tem acesso ao servidor MCP `open-computer-use` no Windows. Uma skill por si só não vê a tela; os recursos reais vêm das ferramentas MCP. Use-as para observar o estado e depois agir.

## Fluxo

1. Chame `list_apps` ou `list_windows` para localizar o aplicativo e a janela desejados. Para sites já autenticados, use a janela do navegador que o usuário indicou.
2. Chame `get_app_state` para obter a árvore de acessibilidade **e uma captura de tela**. Leia a imagem e os índices dos elementos. Para verificar um detalhe visual, peça nova captura após a ação.
3. Prefira `click` com `element_index` da captura mais recente. Use coordenadas somente quando não existir elemento acessível adequado. Use `type_text`, `press_key`, `scroll`, `drag` ou `set_value` conforme a ação.
4. Após clicar ou digitar, chame `get_app_state` outra vez e confirme que a página realmente mudou. Não anuncie sucesso apenas porque a chamada de clique retornou sem erro.
5. Se um índice ficou desatualizado, obtenha novo estado antes de agir. Se a janela estiver fechada ou fora do alcance, reporte isso claramente.

## Regras práticas para navegador

- Acesse a página pela barra de endereço do navegador com `press_key` e `type_text` quando a tarefa exigir navegação. Evite abrir outra conta ou perfil sem necessidade.
- Use o texto da árvore de acessibilidade para encontrar botões, campos, menus e links. A captura de tela complementa a árvore quando o layout importa.
- Faça uma mudança por vez e confira o resultado visual. Para notebooks, execute somente a célula que alterou; não use `Run All` sem necessidade.
- Ao trabalhar com o agente Kaggle deste usuário, o notebook é `https://www.kaggle.com/code/supershokkk/qwen3-8b-painel-pt-br/edit`. O painel público pode mudar de URL quando o túnel reinicia. Verifique o endereço atual antes de usar.
- Se um aplicativo não aparecer em `list_apps`, tente `list_windows` ou peça ao usuário que o deixe aberto na sessão Windows atual.

## Limites

- As ferramentas operam na sessão Windows local. Elas não compartilham automaticamente as abas internas do Codex; use o Opera ou outro navegador externo aberto.
- O servidor MCP pode retornar captura de tela como imagem. Para interpretá-la, o modelo selecionado no OpenCode precisa aceitar imagens. Sem visão, use a árvore de acessibilidade, que ainda permite localizar muitos elementos.
- Acesso a senhas, pagamentos, compartilhamento público ou alterações irreversíveis exigem cuidado e confirmação adequada. Não copie dados sensíveis da tela para respostas ou serviços externos.

## Teste rápido

Peça ao OpenCode: `Use a skill ver-e-controlar-tela. Liste as janelas abertas, veja o estado do Opera e me diga o título da aba atual. Não clique em nada.`

Se isso funcionar, teste: `Abra uma nova aba no Opera e navegue até example.com; confirme pelo estado da tela que carregou.`
