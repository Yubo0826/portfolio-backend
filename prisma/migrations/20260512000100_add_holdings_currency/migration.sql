ALTER TABLE "holdings"
ADD COLUMN "currency" VARCHAR(10) NOT NULL DEFAULT 'USD';

UPDATE "holdings" h
SET "currency" = COALESCE(t."currency", 'USD')
FROM (
    SELECT DISTINCT ON ("uid", "portfolio_id", "symbol")
        "uid",
        "portfolio_id",
        "symbol",
        "currency"
    FROM "transactions"
    WHERE "currency" IS NOT NULL
    ORDER BY "uid", "portfolio_id", "symbol", "transaction_date" DESC, "created_at" DESC, "id" DESC
) t
WHERE h."uid" = t."uid"
  AND h."portfolio_id" = t."portfolio_id"
  AND h."symbol" = t."symbol";