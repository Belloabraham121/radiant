-- CreateTable
CREATE TABLE "WaitlistEmail" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEmail_email_key" ON "WaitlistEmail"("email");
