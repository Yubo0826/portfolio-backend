-- 換匯紀錄：記下實際成交金額，與當天市場匯率比較出價差成本
CREATE TABLE "public"."fx_exchanges" (
    "id" SERIAL NOT NULL,
    "uid" VARCHAR(255) NOT NULL,
    "date" DATE NOT NULL,
    "side" VARCHAR(4) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "foreign_amount" DECIMAL(18,4) NOT NULL,
    "twd_amount" DECIMAL(18,4) NOT NULL,
    "fee" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "market_rate" DECIMAL(18,8),
    "note" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_exchanges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fx_exchanges_uid_date_idx" ON "public"."fx_exchanges"("uid", "date");

ALTER TABLE "public"."fx_exchanges" ADD CONSTRAINT "fx_exchanges_uid_fkey" FOREIGN KEY ("uid") REFERENCES "public"."users"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
