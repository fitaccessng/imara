CREATE TYPE "PersonalDocumentType" AS ENUM ('FORM', 'AGREEMENT', 'INVOICE');

CREATE TABLE "PersonalDocument" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "type" "PersonalDocumentType" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "content" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "tokenHash" CHAR(64),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PersonalDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonalDocumentResponse" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "respondentName" VARCHAR(120) NOT NULL,
    "respondentEmail" VARCHAR(320) NOT NULL,
    "answers" JSONB,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "signedAt" TIMESTAMP(3),
    "signedName" VARCHAR(120),
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonalDocumentResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonalDocument_tokenHash_key" ON "PersonalDocument"("tokenHash");
CREATE INDEX "PersonalDocument_ownerId_updatedAt_idx" ON "PersonalDocument"("ownerId", "updatedAt");
CREATE INDEX "PersonalDocument_type_published_revokedAt_idx" ON "PersonalDocument"("type", "published", "revokedAt");
CREATE INDEX "PersonalDocumentResponse_documentId_submittedAt_idx" ON "PersonalDocumentResponse"("documentId", "submittedAt");

ALTER TABLE "PersonalDocument"
ADD CONSTRAINT "PersonalDocument_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PersonalDocumentResponse"
ADD CONSTRAINT "PersonalDocumentResponse_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "PersonalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
