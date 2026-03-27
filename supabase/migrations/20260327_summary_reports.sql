-- ============================================
-- SUMMARY REPORTS
-- ============================================

create index if not exists idx_invoices_customer_date
on public.invoices (customer_id, invoice_date);

create index if not exists idx_invoices_sales_rep_date
on public.invoices (sales_rep, invoice_date);

create index if not exists idx_payments_customer_date
on public.payments (customer_id, payment_date);

create index if not exists idx_credit_notes_customer_date
on public.credit_notes (customer_id, credit_note_date);

create index if not exists idx_credit_notes_sales_rep_date
on public.credit_notes (sales_rep, credit_note_date);

-- ============================================
-- CUSTOMER ACCOUNT TRANSACTIONS VIEW
-- credit = invoices
-- debit  = payments + credit notes
-- ============================================
create or replace view public.v_customer_account_transactions as
with invoice_tx as (
  select
    i.id::bigint as source_id,
    i.customer_id,
    i.invoice_date::date as tx_date,
    i.invoice_number::text as particular,
    0::numeric(12,2) as debit,
    coalesce(i.total_amount, 0)::numeric(12,2) as credit,
    'INVOICE'::text as source_type,
    coalesce(i.sales_rep, '')::text as sales_rep
  from public.invoices i
  where coalesce(i.status, 'DRAFT') <> 'DRAFT'
),
payment_tx as (
  select
    p.id::bigint as source_id,
    p.customer_id,
    p.payment_date::date as tx_date,
    coalesce(nullif(trim(p.notes), ''), 'PAYMENT')::text as particular,
    coalesce(p.amount, 0)::numeric(12,2) as debit,
    0::numeric(12,2) as credit,
    'PAYMENT'::text as source_type,
    ''::text as sales_rep
  from public.payments p
),
credit_note_tx as (
  select
    cn.id::bigint as source_id,
    cn.customer_id,
    cn.credit_note_date::date as tx_date,
    coalesce(cn.credit_note_number, 'CREDIT NOTE')::text as particular,
    coalesce(cn.total_amount, 0)::numeric(12,2) as debit,
    0::numeric(12,2) as credit,
    'CREDIT_NOTE'::text as source_type,
    coalesce(cn.sales_rep, '')::text as sales_rep
  from public.credit_notes cn
  where coalesce(cn.status, 'ISSUED') <> 'VOID'
)
select * from invoice_tx
union all
select * from payment_tx
union all
select * from credit_note_tx;

-- ============================================
-- SALES REP TRANSACTIONS VIEW
-- invoices + credit notes
-- ============================================
create or replace view public.v_sales_rep_transactions as
select
  'INVOICE'::text as source_type,
  i.id::bigint as source_id,
  i.invoice_date::date as tx_date,
  trim(to_char(i.invoice_date::date, 'Day')) as day_name,
  coalesce(i.sales_rep, '')::text as sales_rep,
  i.invoice_number::text as doc_no,
  c.name::text as customer_name,
  coalesce(c.address, '')::text as customer_address,
  coalesce(c.phone, c.whatsapp, '')::text as mobile_no,
  coalesce(i.total_amount, 0)::numeric(12,2) as amount,
  coalesce(i.status, '')::text as status
from public.invoices i
left join public.customers c on c.id = i.customer_id
where coalesce(i.status, 'DRAFT') <> 'DRAFT'

union all

select
  'CREDIT_NOTE'::text as source_type,
  cn.id::bigint as source_id,
  cn.credit_note_date::date as tx_date,
  trim(to_char(cn.credit_note_date::date, 'Day')) as day_name,
  coalesce(cn.sales_rep, '')::text as sales_rep,
  cn.credit_note_number::text as doc_no,
  c.name::text as customer_name,
  coalesce(c.address, '')::text as customer_address,
  coalesce(c.phone, c.whatsapp, '')::text as mobile_no,
  (coalesce(cn.total_amount, 0) * -1)::numeric(12,2) as amount,
  coalesce(cn.status, '')::text as status
from public.credit_notes cn
left join public.customers c on c.id = cn.customer_id
where coalesce(cn.status, 'ISSUED') <> 'VOID';