-- 成交當時的匯率，讓成本不再隨今日匯率浮動
-- 既有資料留 null：呼叫端會退回用當下匯率換算，與加欄位前的行為一致
ALTER TABLE "public"."transactions" ADD COLUMN "fx_rate" DECIMAL(18,8);

-- 以各筆買入當時匯率換算的美金總成本（由 recalcHolding 重算時寫入）
ALTER TABLE "public"."holdings" ADD COLUMN "total_cost_usd" DECIMAL(18,4);
