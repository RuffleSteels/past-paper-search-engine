-- CreateTable
CREATE TABLE "public"."QuestionText" (
    "id" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "QuestionText_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuestionText_questionId_key" ON "public"."QuestionText"("questionId");

-- AddForeignKey
ALTER TABLE "public"."QuestionText" ADD CONSTRAINT "QuestionText_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "public"."ExamQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
