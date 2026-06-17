-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "exchangeRate" DECIMAL(10,6),
ADD COLUMN     "originalAmount" DECIMAL(10,2),
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'EXPENSE';

-- AlterTable
ALTER TABLE "import_jobs" ADD COLUMN     "rowData" JSONB;

-- CreateTable
CREATE TABLE "user_aliases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_aliases_userId_alias_key" ON "user_aliases"("userId", "alias");

-- AddForeignKey
ALTER TABLE "user_aliases" ADD CONSTRAINT "user_aliases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
