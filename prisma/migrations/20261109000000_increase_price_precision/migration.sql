-- AlterTable
ALTER TABLE "public"."holdings" ALTER COLUMN "avg_cost" SET DATA TYPE DECIMAL(10,3),
ALTER COLUMN "current_price" SET DATA TYPE DECIMAL(10,3);

-- AlterTable
ALTER TABLE "public"."transactions" ALTER COLUMN "price" SET DATA TYPE DECIMAL(10,3);

