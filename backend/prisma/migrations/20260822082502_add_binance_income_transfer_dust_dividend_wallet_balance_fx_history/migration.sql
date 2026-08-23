-- AlterTable
ALTER TABLE "portfolio"."snapshots" ADD COLUMN     "realized_pnl" DECIMAL;

-- CreateTable
CREATE TABLE "market"."fx_rate_history" (
    "id" UUID NOT NULL,
    "currency" VARCHAR NOT NULL,
    "date" DATE NOT NULL,
    "rate_to_inr" DECIMAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_fx_rate_history" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portfolio"."broker_wallet_balances" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "broker" VARCHAR NOT NULL,
    "wallet" VARCHAR NOT NULL,
    "asset" VARCHAR NOT NULL,
    "balance" DECIMAL NOT NULL,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "pk_broker_wallet_balances" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_fx_rate_history_currency_date" ON "market"."fx_rate_history"("currency", "date");

-- CreateIndex
CREATE UNIQUE INDEX "uq_broker_wallet_balances_portfolio_broker_wallet_asset" ON "portfolio"."broker_wallet_balances"("portfolio_id", "broker", "wallet", "asset");

-- AddForeignKey
ALTER TABLE "portfolio"."broker_wallet_balances" ADD CONSTRAINT "fk_broker_wallet_balances_portfolio_id" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"."portfolios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
