-- v244 出貨紀錄 / 今日異動 / 扣除來源明細一致性
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS source_label TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS source_detail_json TEXT;
ALTER TABLE shipping_records ADD COLUMN IF NOT EXISTS source_plan_json TEXT;
CREATE INDEX IF NOT EXISTS ix_shipping_records_source_table_v244 ON shipping_records(source_table);
CREATE INDEX IF NOT EXISTS ix_shipping_records_customer_time_v244 ON shipping_records(customer_name, shipped_at DESC);
