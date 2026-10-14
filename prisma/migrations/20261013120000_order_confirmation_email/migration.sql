-- AlterTable (additive, nullable -- safe to apply ahead of the code deploy)
ALTER TABLE "Order" ADD COLUMN "confirmationEmailSentAt" TIMESTAMP(3);
