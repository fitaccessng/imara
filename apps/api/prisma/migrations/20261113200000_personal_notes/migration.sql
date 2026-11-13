CREATE TABLE "PersonalNote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(20000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PersonalNote_userId_updatedAt_idx" ON "PersonalNote"("userId", "updatedAt");

ALTER TABLE "PersonalNote"
ADD CONSTRAINT "PersonalNote_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
