-- CreateTable
CREATE TABLE "DeepBookMarginSupplierCap" (
    "id" UUID NOT NULL,
    "user_id" BIGINT NOT NULL,
    "chain_id" TEXT NOT NULL DEFAULT 'sui',
    "supplier_cap_object_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeepBookMarginSupplierCap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeepBookMarginSupplierCap_user_id_key" ON "DeepBookMarginSupplierCap"("user_id");

-- AddForeignKey
ALTER TABLE "DeepBookMarginSupplierCap" ADD CONSTRAINT "DeepBookMarginSupplierCap_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
