-- CreateTable
CREATE TABLE "portfolio"."snapshot_history" (
    "id" UUID NOT NULL,
    "portfolio_id" UUID NOT NULL,
    "captured_on" DATE NOT NULL,
    "market_value" DECIMAL,
    "cash_balance" DECIMAL,
    "total_return" DECIMAL,
    "realized_pnl" DECIMAL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pk_snapshot_history" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_snapshot_history_portfolio_captured_on" ON "portfolio"."snapshot_history"("portfolio_id", "captured_on");

-- AddForeignKey
ALTER TABLE "portfolio"."snapshot_history" ADD CONSTRAINT "fk_snapshot_history_portfolio_id" FOREIGN KEY ("portfolio_id") REFERENCES "portfolio"."portfolios"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
