CREATE TABLE "PlanCatalogue" (
  "plan" "Plan" NOT NULL,
  "staffLimit" INTEGER NOT NULL,
  "activeEventLimit" INTEGER NOT NULL,
  "storageLimitBytes" BIGINT NOT NULL,
  "canEditDocuments" BOOLEAN NOT NULL,
  "canScanDocuments" BOOLEAN NOT NULL,
  "advancedTeamManagement" BOOLEAN NOT NULL,
  "monthlyPriceMinor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanCatalogue_pkey" PRIMARY KEY ("plan")
);

-- Seed the limits and prices currently advertised by the product catalogue.
-- Prices are NGN minor units (kobo); no payment or billing state is implied.
INSERT INTO "PlanCatalogue" (
  "plan", "staffLimit", "activeEventLimit", "storageLimitBytes",
  "canEditDocuments", "canScanDocuments", "advancedTeamManagement",
  "monthlyPriceMinor", "currency", "updatedAt"
) VALUES
  ('FREE', 3, 3, 5368709120, FALSE, FALSE, FALSE, 0, 'NGN', CURRENT_TIMESTAMP),
  ('PRO', 10, 10, 16106127360, TRUE, TRUE, FALSE, 500000, 'NGN', CURRENT_TIMESTAMP),
  ('BUSINESS', 30, 20, 26843545600, TRUE, TRUE, TRUE, 1500000, 'NGN', CURRENT_TIMESTAMP);
