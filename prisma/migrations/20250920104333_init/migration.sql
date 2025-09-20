-- CreateTable
CREATE TABLE "public"."ExamPaper" (
    "id" SERIAL NOT NULL,
    "examBoard" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "paper" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "path" TEXT NOT NULL,

    CONSTRAINT "ExamPaper_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaper_path_key" ON "public"."ExamPaper"("path");
