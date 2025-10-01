/*
  Warnings:

  - Added the required column `label` to the `ExamPaper` table without a default value. This is not possible if the table is not empty.
  - Added the required column `label` to the `ExamQuestion` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."ExamPaper" ADD COLUMN     "label" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."ExamQuestion" ADD COLUMN     "label" TEXT NOT NULL;
