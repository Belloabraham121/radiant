-- CreateTable
CREATE TABLE "AppInstallation" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "source_project_id" UUID NOT NULL,
    "pinned_revision" INTEGER,
    "installed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppInstallation_user_id_installed_at_idx" ON "AppInstallation"("user_id", "installed_at" DESC);

-- CreateIndex
CREATE INDEX "AppInstallation_source_project_id_idx" ON "AppInstallation"("source_project_id");

-- CreateIndex
CREATE UNIQUE INDEX "AppInstallation_user_id_source_project_id_key" ON "AppInstallation"("user_id", "source_project_id");

-- AddForeignKey
ALTER TABLE "AppInstallation" ADD CONSTRAINT "AppInstallation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppInstallation" ADD CONSTRAINT "AppInstallation_source_project_id_fkey" FOREIGN KEY ("source_project_id") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
