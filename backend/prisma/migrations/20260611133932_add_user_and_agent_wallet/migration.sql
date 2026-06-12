-- CreateTable
CREATE TABLE "User" (
    "id" BIGSERIAL NOT NULL,
    "privy_user_id" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentWallet" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "privy_wallet_id" TEXT NOT NULL,
    "sui_address" TEXT NOT NULL,
    "signer_added" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_privy_user_id_key" ON "User"("privy_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AgentWallet_user_id_key" ON "AgentWallet"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentWallet_privy_wallet_id_key" ON "AgentWallet"("privy_wallet_id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentWallet_sui_address_key" ON "AgentWallet"("sui_address");

-- AddForeignKey
ALTER TABLE "AgentWallet" ADD CONSTRAINT "AgentWallet_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
