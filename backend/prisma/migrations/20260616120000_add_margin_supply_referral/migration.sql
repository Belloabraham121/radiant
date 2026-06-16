-- CreateTable
CREATE TABLE "DeepBookMarginSupplyReferral" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "chain_id" TEXT NOT NULL DEFAULT 'sui',
    "coin_key" TEXT NOT NULL,
    "referral_object_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeepBookMarginSupplyReferral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeepBookMarginSupplyReferral_user_id_coin_key_key" ON "DeepBookMarginSupplyReferral"("user_id", "coin_key");

-- AddForeignKey
ALTER TABLE "DeepBookMarginSupplyReferral" ADD CONSTRAINT "DeepBookMarginSupplyReferral_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
