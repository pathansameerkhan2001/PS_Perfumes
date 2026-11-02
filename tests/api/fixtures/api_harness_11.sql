-- Disposable test database only, and only where Migration 11 is applied.
-- PIN code shipping with one test PIN code (a fixture, not a business rate), or back to legacy
create function public.test_shipping(p_pincode text, p_charge numeric) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.shipping_config set mode = 'legacy' where id;
  delete from public.shipping_pincodes where true;
  if p_pincode is not null then
    insert into public.shipping_pincodes (pincode, charge) values (p_pincode, p_charge);
    update public.shipping_config set fallback_allowed = false, free_shipping_rule = 'none', mode = 'pincode' where id;
  end if;
end $$;
