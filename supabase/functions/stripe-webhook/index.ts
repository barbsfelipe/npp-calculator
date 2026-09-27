// Endpoint público que o Stripe chama depois de um pagamento concluído.
// Verifica a assinatura do webhook (prova que a chamada é do Stripe de
// verdade, não de qualquer um) e, no evento "checkout.session.completed",
// libera o acesso vitalício inserindo o email na tabela
// npp_acesso_liberado — a mesma tabela já usada pelo painel manual de
// acesso liberado (ver docs/superpowers/specs do acesso-liberado-manual).
//
// Variáveis de ambiente necessárias (Supabase → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY         — mesma chave da create-checkout-session
//   STRIPE_WEBHOOK_SECRET     — "Signing secret" do endpoint de webhook (whsec_...),
//                               gerado quando você cadastra esse endpoint no Stripe
//   SUPABASE_URL              — já vem injetada automaticamente
//   SUPABASE_SERVICE_ROLE_KEY — chave de serviço (não a anon key!) — necessária
//                               pra inserir na tabela ignorando RLS, já que
//                               esse endpoint não tem um usuário logado (é o
//                               Stripe chamando, não o navegador de ninguém)

import Stripe from 'https://esm.sh/stripe@17?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  });
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    console.error('Assinatura do webhook inválida:', err);
    return new Response(`Webhook signature verification failed`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const email = session.customer_email || (session.metadata?.email as string | undefined);

    if (email) {
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { error } = await supabaseAdmin
        .from('npp_acesso_liberado')
        .upsert(
          { email, motivo: `Compra vitalícia via Stripe (checkout ${session.id})` },
          { onConflict: 'email' },
        );
      if (error) {
        console.error('Erro ao liberar acesso após pagamento:', error, 'email:', email);
        // Retorna 500 pra o Stripe tentar reenviar o webhook depois —
        // melhor que "engolir" o erro e deixar o cliente sem acesso.
        return new Response(JSON.stringify({ error: 'db_error' }), { status: 500 });
      }
      console.log('Acesso liberado via Stripe pra:', email);
    } else {
      console.warn('checkout.session.completed sem email associado, sessão:', session.id);
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
