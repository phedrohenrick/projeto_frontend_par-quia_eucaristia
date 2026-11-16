# Galeria de fotos do evento

Site que mostra as fotos de uma pasta do Google Drive e permite baixá-las em qualidade original.
As fotos continuam no Drive; a Vercel hospeda só o site e uma função que lista as fotos.

## 1. Deixar a pasta do Drive pública

1. No Google Drive, clique com o botão direito na pasta → **Compartilhar**.
2. Em "Acesso geral", escolha **Qualquer pessoa com o link** (permissão "Leitor").
3. Copie o link. O ID da pasta é o trecho depois de `/folders/`:
   `https://drive.google.com/drive/folders/`**`1AbC...xyz`**

Cada subpasta vira uma sessão no site. As pastas `meninos`, `meninas`, `cerimonia` e `familias`
aparecem nessa ordem (com ou sem acento/maiúscula); outras pastas aparecem depois, e fotos
soltas na pasta principal ficam em "Outras fotos".

## 2. Criar a chave de API do Google

1. Acesse https://console.cloud.google.com e crie um projeto.
2. Em **APIs e serviços → Biblioteca**, ative a **Google Drive API**.
3. Em **APIs e serviços → Credenciais → Criar credenciais → Chave de API**.
4. Em "Restrições de API", restrinja a chave à **Google Drive API**.

## 3. Publicar na Vercel

1. Suba esta pasta para um repositório no GitHub e importe na Vercel
   (ou rode `npx vercel` aqui na pasta). Framework: **Other**, sem build.
2. Em **Settings → Environment Variables**, adicione:
   - `GOOGLE_API_KEY` = a chave criada no passo 2
   - `DRIVE_FOLDER_ID` = o ID da pasta do passo 1
3. Faça o deploy (ou "Redeploy", se já tinha publicado antes de criar as variáveis).

## Personalizar

Edite os textos marcados com `EDITE` no `index.html` (nome da igreja, evento, data).
As cores ficam no topo do `style.css`.

## Rodar localmente

```bash
cp .env.example .env   # preencha as duas variáveis
npm run dev            # abre em http://localhost:3000
```

## Downloads

As fotos originais estão em HEIC (formato do iPhone), que muitos celulares e computadores
não abrem. Por isso o botão "Baixar" entrega a versão JPG em resolução cheia que o próprio
Drive gera. No celular ele abre o menu de compartilhar ("Salvar imagem" → vai para a galeria).
"Baixar sessão" / "Baixar todas" abrem a pasta no Drive (arquivos originais).

## Como funciona

- `api/photos.js` lista as imagens da pasta (e subpastas) pela API do Drive. A resposta fica
  em cache na Vercel por 5 minutos, então fotos novas aparecem em até ~5 min.
- As miniaturas e os downloads vêm direto do Drive (`drive.google.com/thumbnail` e `uc?export=download`).
- "Baixar todas" abre a pasta no Drive, onde dá pra baixar tudo em .zip.
