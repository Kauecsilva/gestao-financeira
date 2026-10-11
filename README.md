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
2. No SQL Editor, rode os arquivos de `supabase/migrations/` em ordem (`0001_init.sql`, `0002_investments.sql` e assim por diante).
3. Copie `.env.example` para `.env.local` e preencha com a URL e a anon key do projeto
   (Project Settings → API).
4. Reinicie o `npm run dev`. O app passa a pedir login; crie sua conta pela própria tela.

## Bancos conectados (Open Finance)

Na tela **Contas**, o quadro **Bancos conectados** puxa saldos e lançamentos direto do banco, pelo
Open Finance, usando a [Pluggy](https://pluggy.ai). O acesso é só de leitura. Para uso pessoal dá
para fazer de graça com o **Meu Pluggy**:

1. Crie a conta em [dashboard.pluggy.ai](https://dashboard.pluggy.ai) e um app nela. Anote o
   **Client ID** e o **Client Secret**.
2. Em [meu.pluggy.ai](https://meu.pluggy.ai), conecte seus bancos. Faça isso enquanto o trial da
   Pluggy estiver ativo: depois dele as conexões continuam funcionando, mas não dá para adicionar
   bancos novos.
3. Na Vercel (e no `.env.local`), defina `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`. Elas ficam só
   no servidor.
4. Rode `supabase/migrations/0004_bank_sync.sql` no SQL Editor do Supabase.
5. No app, em Contas → **Conectar banco**, cole o **Item ID** de cada banco (no painel da Pluggy,
   abra a conexão e copie o id). Para cada conta encontrada você escolhe criar uma conta nova
   (traz os últimos 90 dias), usar uma conta que já existe no app (o saldo passa a vir do banco e
   os lançamentos entram a partir daquele dia, para não repetir o que você já digitou) ou não trazer.

Depois disso, toda vez que o app abre ele sincroniza sozinho (no máximo uma vez por hora), e há o
botão **Sincronizar** para forçar. O saldo de cada conta passa a ser o do banco. Lançamentos
pendentes ficam de fora até serem confirmados, e pagamentos de fatura e transferências entre as
suas próprias contas não entram como gasto (senão o gasto contaria em dobro). As categorias da
Pluggy são traduzidas para as do app em `src/lib/bank-sync.ts`.

## Investimentos

A tela **Investimentos** guarda a carteira: tipo, instituição, quanto foi aplicado, quanto vale hoje
(você atualiza), para que é o dinheiro (reserva, meta, longo prazo) e o prazo de resgate. Mostra o
rendimento e a divisão por tipo. Cálculos em `src/lib/portfolio.ts`.

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
- Investimentos: primeiro a reserva de emergência (6 meses de custo, contando a poupança e os
  investimentos marcados como reserva); com ela completa, olha a divisão da carteira cadastrada
  (excesso de renda variável, cripto acima de 10%, falta de longo prazo) e dá orientações gerais.

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
