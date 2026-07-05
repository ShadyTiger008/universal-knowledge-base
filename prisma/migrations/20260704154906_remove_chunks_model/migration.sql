/*
  Warnings:

  - You are about to drop the `chunks` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "chunks" DROP CONSTRAINT "chunks_documentId_fkey";

-- DropTable
DROP TABLE "chunks";
