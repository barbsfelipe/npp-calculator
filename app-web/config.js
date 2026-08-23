window.NPP_CONFIG = {
  // Mesmo projeto Supabase do app mobile (app-mobile/www/config.js) —
  // é intencional: a conta precisa ser a mesma nos dois lugares (spec:
  // docs/superpowers/specs/2026-08-17-npp-calculadora-app-pago-design.md).
  supabaseUrl: 'https://tawlbzdzpovpfybljkwc.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRhd2xiemR6cG92cGZ5Ymxqa3djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNTk5NTUsImV4cCI6MjEwMjYzNTk1NX0.kC5jiV02MNP892zaxkG8Mc4mW4VjTYh7B15k5Mkmtvo',
  // Chave pública do app "Web Billing" no painel da RevenueCat — ainda não
  // criado. Até isso ser feito, a assinatura fica indisponível na web (mesmo
  // padrão de app-mobile/www/config.js pra revenueCatApiKeyIOS).
  revenueCatApiKeyWeb: 'PENDENTE_REVENUECAT_WEB_BILLING',
};
