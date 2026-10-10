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

## Assistente

A tela **Assistente** responde perguntas como "quero gastar R$ 400 num tênis, cabe?",
"celular de R$ 3.000 em 10x ou à vista?", "quanto consigo guardar por mês?" e
"como planejar meus investimentos?".

Por padrão ele é **gratuito**: uma calculadora em `src/lib/advisor.ts` que entende essas perguntas
e responde com regras fixas sobre os números do painel, sem sair do navegador.

- Livre do mês menos o que ainda deve sair do dia a dia (pela média dos últimos 3 meses).
- **Cabe tranquilo** se sobrar uma folga (10% da renda, mínimo R$ 300); **cabe, mas aperta** se
  sobrar algo; **melhor não agora** se ficar negativo, dizendo em que mês dá para pagar à vista.
- Parcelado: olha o mês mais apertado da projeção pagando a parcela.
- Comida e mercado: sugere pagar com VR/VA quando o saldo cobre.
- Investimentos: primeiro a reserva de emergência (6 meses de custo), depois orientações gerais.

### Opcional: usar o Claude (pago)

Existe uma versão com IA em `src/app/api/assistente/route.ts`. Para ligar, defina
`NEXT_PUBLIC_ASSISTANT_MODE=ai` e `ANTHROPIC_API_KEY` (chave em
[platform.claude.com](https://platform.claude.com)). Em produção ela só funciona com login (Supabase).

## Publicar na Vercel

Importe o repositório na [Vercel](https://vercel.com), adicione as variáveis de ambiente do Supabase
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
