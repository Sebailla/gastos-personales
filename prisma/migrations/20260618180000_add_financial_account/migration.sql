-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BANK', 'CREDIT', 'INVESTMENT', 'CRYPTO', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('SAVINGS', 'CHECKING');

-- CreateEnum
CREATE TYPE "InvestmentType" AS ENUM ('STOCKS', 'BONDS', 'MUTUAL_FUNDS', 'CERTS_OF_DEPOSIT', 'OTHER');

-- CreateEnum
CREATE TYPE "OpeningBalanceMode" AS ENUM ('FRESH', 'HISTORICAL');

-- CreateEnum
CREATE TYPE "AccountCurrency" AS ENUM ('ARS', 'USD', 'EUR');

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "name" TEXT NOT NULL,
    "currency" "AccountCurrency" NOT NULL,
    "openingBalanceMinor" INTEGER NOT NULL,
    "openingBalanceMode" "OpeningBalanceMode" NOT NULL,
    "openingBalanceDate" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "bankName" TEXT,
    "accountKind" "AccountKind",
    "issuer" TEXT,
    "creditLimitMinor" INTEGER,
    "statementDay" INTEGER,
    "paymentDueDay" INTEGER,
    "broker" TEXT,
    "investmentType" "InvestmentType",
    "walletAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialAccount_userId_archivedAt_idx" ON "FinancialAccount"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "FinancialAccount_userId_createdAt_idx" ON "FinancialAccount"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_userId_type_name_key" ON "FinancialAccount"("userId", "type", "name");

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;