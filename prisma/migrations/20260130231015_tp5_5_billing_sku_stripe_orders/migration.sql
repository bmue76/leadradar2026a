-- CreateEnum
CREATE TYPE "StripeEventStatus" AS ENUM ('PROCESSED', 'IGNORED', 'FAILED');

-- CreateEnum
CREATE TYPE "BillingOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- AlterEnum
ALTER TYPE "TenantCreditLedgerReason" ADD VALUE 'STRIPE_PURCHASE';

-- CreateTable
CREATE TABLE "BillingSku" (
    "id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stripePriceId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountCents" INTEGER,
    "grantLicense30d" INTEGER NOT NULL DEFAULT 0,
    "grantLicense365d" INTEGER NOT NULL DEFAULT 0,
    "grantDeviceSlots" INTEGER NOT NULL DEFAULT 0,
    "creditExpiresInDays" INTEGER NOT NULL DEFAULT 365,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "status" "BillingOrderStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT,
    "amountCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "BillingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "StripeEventStatus" NOT NULL,
    "processedAt" TIMESTAMP(3),
    "tenantId" TEXT,
    "payloadJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingSku_stripePriceId_key" ON "BillingSku"("stripePriceId");

-- CreateIndex
CREATE INDEX "BillingSku_active_sortOrder_idx" ON "BillingSku"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "BillingSku_stripePriceId_idx" ON "BillingSku"("stripePriceId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingOrder_stripeCheckoutSessionId_key" ON "BillingOrder"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "BillingOrder_tenantId_createdAt_idx" ON "BillingOrder"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingOrder_tenantId_status_createdAt_idx" ON "BillingOrder"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BillingOrder_skuId_idx" ON "BillingOrder"("skuId");

-- CreateIndex
CREATE UNIQUE INDEX "StripeEvent_stripeEventId_key" ON "StripeEvent"("stripeEventId");

-- CreateIndex
CREATE INDEX "StripeEvent_type_createdAt_idx" ON "StripeEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "StripeEvent_tenantId_createdAt_idx" ON "StripeEvent"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "StripeEvent_status_createdAt_idx" ON "StripeEvent"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "BillingOrder" ADD CONSTRAINT "BillingOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingOrder" ADD CONSTRAINT "BillingOrder_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "BillingSku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StripeEvent" ADD CONSTRAINT "StripeEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
