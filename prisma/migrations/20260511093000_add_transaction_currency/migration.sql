ALTER TABLE "transactions"
ADD COLUMN "currency" VARCHAR(10) NOT NULL DEFAULT 'USD';

UPDATE "transactions"
SET "currency" = 'USD'
WHERE "currency" IS NULL;