# Project Specs: dbuild

## Plan

### staging
stg_orders and stg_customers: one file each, one row per source row.

### marts
fct_orders: grain one row per order; joins stg_orders to stg_customers.

### tests
schema.yml with unique + not_null on fct_orders.order_id.
