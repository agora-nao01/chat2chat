# Chat2Chat

## Versões

- `index.html`: sala principal (`main`). A página principal não aceita nomes `dev:`.
- `debug/index.html`: permite alternar entre sala principal e debug; a sala debug exige nomes começando com `dev:`. Ao alternar para a sala principal pela versão debug, esses nomes também podem enviar mensagens lá.
- As duas páginas compartilham `chat.js`, `style.css` e o mesmo backend. A sala debug usa a mesma API com `room=debug`.

Como o chat não tem contas ou senhas, `dev:` identifica a versão debug, mas não é autenticação: clientes podem falsificar essa identificação.

## Mensagens com mídia

- Emojis: use os botões ou o teclado do dispositivo.
- GIFs: use o botão `GIF KLIPY`, pesquise e escolha um resultado dentro do chat.
- Imgur: use URL direta no formato `{img:https://i.imgur.com/arquivo.gif}`. Links de páginas/álbuns podem não ser incorporáveis.

## Backend e KLIPY

Configure `KLIPY_API_KEY` no arquivo `.env` na raiz do projeto e inicie o backend:

```bash
nano .env
# Preencha: KLIPY_API_KEY=sua_chave
python3 backend/server.py
```

O backend lê a chave do `.env` e a interface consulta a API KLIPY diretamente para buscar GIFs; portanto, a chave ficará visível para visitantes do site no navegador. Use uma chave apropriada para cliente e limites/restrições disponíveis na sua conta. Sem chave, chat e salas funcionam normalmente, mas a busca de GIFs fica desativada.

O túnel Cloudflare deve encaminhar para `http://localhost:8765`. Inicie com `cloudflared tunnel --protocol http2 --url http://localhost:8765`; copie o hostname `trycloudflare.com` que aparecer no terminal e atualize `API` no início de `chat.js`. O hostname Quick Tunnel muda quando o túnel é recriado.

## Histórico

O SQLite existente é preservado. A inicialização adiciona a coluna `room` com valor padrão `main` quando necessário; não apaga banco nem backup. O backup JSON só é importado se a tabela estiver vazia.
