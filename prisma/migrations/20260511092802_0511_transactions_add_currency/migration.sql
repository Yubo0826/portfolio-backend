/*
  Warnings:

  - You are about to drop the column `rate` on the `allocation` table. All the data in the column will be lost.
  - Added the required column `target` to the `allocation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."allocation" DROP COLUMN "rate",
ADD COLUMN     "target" DECIMAL(10,2) NOT NULL;

-- AlterTable
ALTER TABLE "public"."portfolios" ADD COLUMN     "drift_threshold" DECIMAL(5,4) DEFAULT 0.05,
ADD COLUMN     "enable_email_alert" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."transactions" ADD COLUMN     "cash_account_id" INTEGER;

-- CreateTable
CREATE TABLE "public"."cash_accounts" (
    "id" SERIAL NOT NULL,
    "uid" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "balance" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cash_flows" (
    "id" SERIAL NOT NULL,
    "uid" VARCHAR(255) NOT NULL,
    "account_id" INTEGER NOT NULL,
    "portfolio_id" INTEGER,
    "related_transaction_id" INTEGER,
    "related_dividend_id" INTEGER,
    "related_symbol" VARCHAR(10),
    "amount" DECIMAL(15,2) NOT NULL,
    "flow_type" VARCHAR(20) NOT NULL,
    "description" VARCHAR(255),
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dividends" (
    "id" SERIAL NOT NULL,
    "uid" VARCHAR(255) NOT NULL,
    "symbol" VARCHAR(10) NOT NULL,
    "name" VARCHAR(255),
    "portfolio_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(10,4) NOT NULL,
    "shares" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dividends_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dividends_uid_symbol_portfolio_id_date_key" ON "public"."dividends"("uid", "symbol", "portfolio_id", "date");

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_accounts" ADD CONSTRAINT "cash_accounts_uid_fkey" FOREIGN KEY ("uid") REFERENCES "public"."users"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_flows" ADD CONSTRAINT "cash_flows_uid_fkey" FOREIGN KEY ("uid") REFERENCES "public"."users"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_flows" ADD CONSTRAINT "cash_flows_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cash_flows" ADD CONSTRAINT "cash_flows_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dividends" ADD CONSTRAINT "dividends_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
