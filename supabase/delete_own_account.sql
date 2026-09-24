-- Permite que um usuário autenticado exclua a própria conta, sem precisar
-- expor a service_role key no cliente nem depender de uma Edge Function.
--
-- Exigência da Apple (App Store Review Guideline 5.1.1(v)): apps que
-- permitem criar conta precisam permitir excluir a conta direto pelo app.
--
-- SECURITY DEFINER faz a função rodar com os privilégios de quem a criou
-- (o dono do schema, que tem acesso a auth.users), não do usuário que
-- chama via RPC — por isso um usuário comum (role "authenticated",
-- sem acesso direto a auth.users) consegue excluir só a própria linha,
-- identificada por auth.uid(), sem conseguir tocar em outras contas.
--
-- Rodar uma vez no SQL Editor do painel do Supabase.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_own_account() to authenticated;
