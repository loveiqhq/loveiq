create or replace function public.set_admin_investigation_case_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists admin_investigation_case_set_updated_at on public.admin_investigation_case;
create trigger admin_investigation_case_set_updated_at
before update on public.admin_investigation_case
for each row
execute function public.set_admin_investigation_case_updated_at();

create index if not exists admin_investigation_case_updated_at_idx on public.admin_investigation_case(updated_at desc);;
