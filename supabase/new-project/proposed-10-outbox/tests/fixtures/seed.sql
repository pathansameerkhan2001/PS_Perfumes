-- Representative existing store on Migration 08: catalogue, customers, legacy and checkout COD orders
insert into public.categories (id, name, slug) values ('00000000-0000-0000-0000-0000000000c1','Attars','attars'),('00000000-0000-0000-0000-0000000000c2','Sprays','sprays');
update public.products set category_id='00000000-0000-0000-0000-0000000000c1' where slug='oud';
insert into public.products (id, name, slug, category_id) values ('00000000-0000-0000-0000-000000000002','Rose','rose','00000000-0000-0000-0000-0000000000c2'),('00000000-0000-0000-0000-000000000003','Musk','musk','00000000-0000-0000-0000-0000000000c2');
insert into public.product_variants (id, product_id, bottle_type, size_ml, price, sale_price, stock_quantity) values
 ('00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000002','Glass Bottle','100 ml',1800,1500,40),
 ('00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-000000000003','Roll On','10 ml',350,null,75);
insert into public.combos (id, name, slug, price, sale_price, stock_quantity, is_active) values ('00000000-0000-0000-0000-0000000000d1','Gift Set','gift-set',2500,2200,10,true);
insert into public.combo_items (combo_id, product_id) values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000003');
insert into public.coupons (code, discount_type, discount_value, usage_limit, used_count) values ('SEED','fixed',50,100,7),('ONCE','fixed',50,1,0);
insert into public.customers (id, email, phone, first_name, last_name, total_orders, total_spent) values
 ('00000000-0000-0000-0000-0000000000f1','old1@example.com','9876500001','Asha','K',4,8200),('00000000-0000-0000-0000-0000000000f2','old2@example.com','9876500002','Ravi','M',1,1099);
insert into public.store_settings (setting_key, setting_value) values ('free_shipping_threshold','"1500"'),('standard_shipping_fee','"99"') on conflict do nothing;
-- Legacy rows that predate place_order: no idempotency key, every fulfilment state, odd but legal values
insert into public.orders (id, order_number, customer_id, customer_name, customer_email, customer_phone, shipping_address, subtotal, shipping_amount, discount_amount, total_amount, payment_method, payment_status, order_status, notes, created_at, updated_at) values
 ('00000000-0000-0000-0000-00000000aa01','PS-900001','00000000-0000-0000-0000-0000000000f1','Asha K','old1@example.com','9876500001','{"city":"Kadapa"}',2000,0,0,2000,'COD','pending','delivered',null,'2026-01-05','2026-01-09'),
 ('00000000-0000-0000-0000-00000000aa02','PS-900002','00000000-0000-0000-0000-0000000000f1','Asha K','old1@example.com','9876500001','{"city":"Kadapa"}',1000,99,0,1099,'COD','paid','delivered','paid in cash','2026-02-05','2026-02-09'),
 ('00000000-0000-0000-0000-00000000aa03','PS-900003','00000000-0000-0000-0000-0000000000f2','Ravi M','old2@example.com',null,'{}',1000,99,50,1049,'COD','pending','cancelled','Coupon: SEED (redeemed)','2026-03-05','2026-03-06'),
 ('00000000-0000-0000-0000-00000000aa04','PS-900004',null,'Guest O',null,null,'{}',350,99,0,449,'COD','pending','processing',null,'2026-04-05','2026-04-05'),
 ('00000000-0000-0000-0000-00000000aa05','PS-900005',null,'Guest P','p@example.com','9876500005','{"city":"Vizag"}',3500,0,0,3500,'COD','pending','shipped',null,'2026-05-05','2026-05-07');
insert into public.order_items (order_id, product_id, variant_id, product_name, bottle_type, size_ml, quantity, unit_price, total_price) values
 ('00000000-0000-0000-0000-00000000aa01','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Oud','Glass Bottle','50 ml',2,1000,2000),
 ('00000000-0000-0000-0000-00000000aa02','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Oud','Glass Bottle','50 ml',1,1000,1000),
 ('00000000-0000-0000-0000-00000000aa03','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','Oud','Glass Bottle','50 ml',1,1000,1000),
 ('00000000-0000-0000-0000-00000000aa04','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000c','Musk','Roll On','10 ml',1,350,350),
 ('00000000-0000-0000-0000-00000000aa05',null,null,'Gift Set','Combo Collection','Complete Set',1,3500,3500);
-- Current checkout: variant with coupon, then a combo
select t.run('anon', null, t.sql('place_order','a0000000-0000-0000-0000-000000000001','SEED','COD',3));
select t.run('anon', null, format('select public.place_order(%L::jsonb,%L::jsonb,null,%L,%L::uuid)::text', t.cust(), '[{"type":"combo","combo_id":"00000000-0000-0000-0000-0000000000d1","quantity":1}]', 'COD', 'a0000000-0000-0000-0000-000000000002'));
