/*
  Warnings:

  - Added the required column `encoded` to the `ExamQuestion` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."ExamQuestion" ADD COLUMN     "encoded" BOOLEAN NOT NULL;
