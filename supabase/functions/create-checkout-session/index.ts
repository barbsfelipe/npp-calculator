// Cria uma Stripe Checkout Session (pagamento único, R$69,90) pro usuário
// autenticado, e devolve a URL pra onde o navegador deve redirecionar.
//
// Chamada pelo app-web (botão "Comprar acesso vitalício"), autenticada com
// o token do usuário logado no Supabase — o email vem da sessão validada
// aqui no servidor, nunca confiamos num email mandado pelo cliente (evita
// alguém criar um checkout pra um email arbitrário).
//
// Variáveis de ambiente necessárias (Supabase → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY   — chave secreta do Stripe (sk_live_... ou sk_test_...)
//   STRIPE_PRICE_ID     — ID do Price de pagamento único criado no Stripe (price_...)
//   SUPABASE_URL, SUPABASE_ANON_KEY — já vêm automaticamente injetadas pelo Supabase.

import Stripe from 'https://esm.sh/stripe@17?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_URL = 'https://nppcalc.com.br';

const corsHeaders = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    });
    const priceId = Deno.env.get('STRIPE_PRICE_ID')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.email) {
      return new Response(JSON.stringify({ error: 'Não autenticado.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: user.email,
      success_url: `${SITE_URL}/app-web/?checkout=success`,
      cancel_url: `${SITE_URL}/app-web/?checkout=cancel`,
      metadata: { email: user.email, supabase_user_id: user.id },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Erro ao criar checkout session:', e);
    return new Response(JSON.stringify({ error: 'Não foi possível iniciar a compra.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
