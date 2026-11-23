-- AlterTable
ALTER TABLE "Setting" ADD COLUMN     "sizeSystems" TEXT NOT NULL DEFAULT 'UK/India,EU,US,Alpha,Custom';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "articleId" TEXT,
ADD COLUMN     "internalSku" TEXT,
ADD COLUMN     "minimumStock" INTEGER,
ADD COLUMN     "sellingPrice" INTEGER;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "referenceId" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "articleSnapshot" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "brandSnapshot" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "articleNumber" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "gender" TEXT NOT NULL DEFAULT 'Unisex',
    "sizeSystem" TEXT NOT NULL DEFAULT 'UK/India',
    "image" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Barcode" (
    "id" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "variantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Barcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOperation" (
    "id" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductChange" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Article_identityKey_key" ON "Article"("identityKey");

-- CreateIndex
CREATE INDEX "Article_brand_articleNumber_idx" ON "Article"("brand", "articleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Barcode_targetKey_key" ON "Barcode"("targetKey");

-- CreateIndex
CREATE INDEX "Barcode_value_idx" ON "Barcode"("value");

-- CreateIndex
CREATE INDEX "Barcode_articleId_idx" ON "Barcode"("articleId");

-- CreateIndex
CREATE INDEX "Barcode_variantId_idx" ON "Barcode"("variantId");

-- CreateIndex
CREATE INDEX "ProductChange_productId_createdAt_idx" ON "ProductChange"("productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_internalSku_key" ON "Product"("internalSku");

-- CreateIndex
CREATE UNIQUE INDEX "Product_articleId_size_color_key" ON "Product"("articleId", "size", "color");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barcode" ADD CONSTRAINT "Barcode_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Barcode" ADD CONSTRAINT "Barcode_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

