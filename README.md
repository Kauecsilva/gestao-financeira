# Gestão Financeira

App pessoal (celular e PC) para ver a situação financeira: dinheiro em conta, benefícios como VR,
compromissos fixos e parcelamentos, e quanto sobra livre no mês.

## Rodar localmente

```bash
npm install
npm run dev     # http://localhost:3000
npm test        # regras de cálculo
```

Sem configurar nada, o app abre em **modo local**: os dados ficam só no navegador.

## Ligar ao Supabase (sincroniza celular e PC)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No SQL Editor, rode `supabase/migrations/0001_init.sql`.
3. Copie `.env.example` para `.env.local` e preencha com a URL e a anon key do projeto
   (Project Settings → API).
4. Reinicie o `npm run dev`. O app passa a pedir login; crie sua conta pela própria tela.

## Assistente com IA

A tela **Assistente** responde perguntas como "quero gastar R$ 400 num tênis, cabe?" ou "como planejar
meus próximos investimentos?" olhando os números do painel. Usa a API do Claude no servidor
(`src/app/api/assistente/route.ts`); o app manda um resumo em texto da situação
(`src/lib/snapshot.ts`) e as instruções ficam em `src/lib/assistant-prompt.ts`.

1. Gere uma chave em [platform.claude.com](https://platform.claude.com) e coloque em `ANTHROPIC_API_KEY`
   (no `.env.local` e nas variáveis da Vercel).
2. Com Supabase configurado, só quem está logado usa o assistente. Sem Supabase, ele funciona no
   `npm run dev` mas fica bloqueado em produção, para ninguém gastar sua chave.

## Publicar na Vercel

Importe o repositório na [Vercel](https://vercel.com), adicione as variáveis de ambiente acima (Supabase e `ANTHROPIC_API_KEY`)
e faça o deploy. No celular, abra o site e use "Adicionar à tela inicial" para instalar.

## Como o painel calcula

As regras ficam em `src/lib/finance.ts`, com testes em `src/lib/finance.test.ts`.

- **Em conta**: corrente + poupança + dinheiro.
- **Benefícios**: saldo de VR/VA, mostrado à parte.
- **Comprometido no mês**: fixos e parcelas de hoje até o fim do mês + faturas de cartão em aberto.
- **Livre no mês**: em conta + receitas previstas no mês − comprometido.
- **Próximos 6 meses**: o livre acumulado mês a mês, somando receitas e subtraindo fixos e parcelas.

Compromissos com data anterior a hoje são considerados já pagos (refletidos no saldo).
Valores são guardados em centavos.
