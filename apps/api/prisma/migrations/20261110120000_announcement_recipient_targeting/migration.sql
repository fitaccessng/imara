CREATE TYPE "PlatformAnnouncementTarget" AS ENUM ('AUDIENCE', 'SIGNUP_WINDOW', 'SELECTED');

ALTER TABLE "PlatformAnnouncement"
  ADD COLUMN "target" "PlatformAnnouncementTarget" NOT NULL DEFAULT 'AUDIENCE',
  ADD COLUMN "signupWindowMinutes" INTEGER;
