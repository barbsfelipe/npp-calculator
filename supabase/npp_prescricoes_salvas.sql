-- supabase/npp_prescricoes_salvas.sql
-- Run once in the Supabase SQL Editor (dashboard) for the same project
-- app-web already uses for Auth (see app-web/config.js: supabaseUrl).
-- Design: docs/superpowers/specs/2026-09-02-npp-salvar-prescricao-design.md

create table if not exists npp_prescricoes_salvas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome_paciente text not null,
  data_prescricao date not null,
  hospital text,
  setor text,
  leito text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, nome_paciente, data_prescricao)
);

alter table npp_prescricoes_salvas enable row level security;

create policy "usuario_so_ve_e_edita_as_proprias_prescricoes_salvas"
  on npp_prescricoes_salvas
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists npp_prescricoes_salvas_user_nome_idx
  on npp_prescricoes_salvas (user_id, nome_paciente);
