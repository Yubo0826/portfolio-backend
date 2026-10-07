-- CreateTable
CREATE TABLE "public"."watchlist" (
    "id" SERIAL NOT NULL,
    "uid" VARCHAR(255) NOT NULL,
    "symbol" VARCHAR(10) NOT NULL,
    "name" VARCHAR(255),
    "asset_type" VARCHAR(255),
    "target_price" DECIMAL(10,3),
    "alert_above" BOOLEAN,
    "alerted_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_uid_symbol_key" ON "public"."watchlist"("uid", "symbol");

-- AddForeignKey
ALTER TABLE "public"."watchlist" ADD CONSTRAINT "watchlist_uid_fkey" FOREIGN KEY ("uid") REFERENCES "public"."users"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

