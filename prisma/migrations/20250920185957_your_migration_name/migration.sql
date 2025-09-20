-- CreateTable
CREATE TABLE "public"."ExamQuestion" (
    "id" SERIAL NOT NULL,
    "examBoard" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "paper" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "question" INTEGER NOT NULL,
    "path" TEXT NOT NULL,

    CONSTRAINT "ExamQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamQuestion_path_key" ON "public"."ExamQuestion"("path");
