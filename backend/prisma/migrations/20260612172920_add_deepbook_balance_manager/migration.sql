-- CreateTable
CREATE TABLE "DeepBookBalanceManager" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "chain_id" TEXT NOT NULL DEFAULT 'sui',
    "manager_object_id" TEXT NOT NULL,
    "manager_key" TEXT NOT NULL,
    "trade_cap_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeepBookBalanceManager_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeepBookBalanceManager_user_id_key" ON "DeepBookBalanceManager"("user_id");

-- AddForeignKey
ALTER TABLE "DeepBookBalanceManager" ADD CONSTRAINT "DeepBookBalanceManager_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
