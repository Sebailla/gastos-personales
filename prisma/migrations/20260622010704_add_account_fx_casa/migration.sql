-- CreateEnum
CREATE TYPE "AccountFxCasa" AS ENUM ('OFICIAL', 'BLUE', 'MEP', 'CCL', 'CRIPTO', 'TARJETA');

-- AlterTable
ALTER TABLE "FinancialAccount" ADD COLUMN     "casa" "AccountFxCasa";
