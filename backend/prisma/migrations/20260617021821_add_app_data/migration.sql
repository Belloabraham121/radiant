-- CreateTable
CREATE TABLE "AppData" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "installation_id" UUID,
    "user_id" BIGINT NOT NULL,
    "collection" VARCHAR(100) NOT NULL,
    "key" VARCHAR(255),
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppData_project_id_user_id_collection_created_at_idx" ON "AppData"("project_id", "user_id", "collection", "created_at" DESC);

-- CreateIndex
CREATE INDEX "AppData_project_id_installation_id_collection_created_at_idx" ON "AppData"("project_id", "installation_id", "collection", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "AppData_project_id_user_id_collection_key_key" ON "AppData"("project_id", "user_id", "collection", "key");
