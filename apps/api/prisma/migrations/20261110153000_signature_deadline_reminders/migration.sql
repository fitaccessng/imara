ALTER TABLE "SignatureRequest"
  ADD COLUMN "dueAt" TIMESTAMP(3);

ALTER TABLE "Reminder"
  ADD COLUMN "signatureSignerId" UUID;

CREATE UNIQUE INDEX "Reminder_signatureSignerId_key" ON "Reminder"("signatureSignerId");

ALTER TABLE "Reminder"
  ADD CONSTRAINT "Reminder_signatureSignerId_fkey"
  FOREIGN KEY ("signatureSignerId") REFERENCES "SignatureSigner"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
