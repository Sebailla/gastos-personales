-- CreateEnum
CREATE TYPE "TransactionDirection" AS ENUM ('INCOME', 'EXPENSE');

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" "AccountCurrency" NOT NULL,
    "memo" TEXT,
    "category" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "convertedAmountMinor" INTEGER NOT NULL,
    "convertedCurrency" "AccountCurrency" NOT NULL,
    "fxAsOfSnapshot" TIMESTAMP(3),
    "casaSnapshot" "AccountFxCasa",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (cursor pagination: transactionDate DESC, id for tie-break)
CREATE INDEX "Transaction_userId_transactionDate_id_idx" ON "Transaction"("userId", "transactionDate" DESC, "id");

-- CreateIndex (list filter by accountId)
CREATE INDEX "Transaction_userId_accountId_idx" ON "Transaction"("userId", "accountId");

-- AddForeignKey (cross-module invariant: userId from auth-foundation spec)
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (cross-module invariant: accountId from accounts-ledger spec)
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
