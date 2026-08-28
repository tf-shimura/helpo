CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Faq" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "AnswerHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "answer" TEXT,
    "reason" TEXT,
    "askedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnswerHistory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AnswerSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answerId" TEXT NOT NULL,
    "faqId" TEXT NOT NULL,
    "faqQuestion" TEXT NOT NULL,
    "exactQuote" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    CONSTRAINT "AnswerSource_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "AnswerHistory" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnswerSource_faqId_fkey" FOREIGN KEY ("faqId") REFERENCES "Faq" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "answerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "AnswerHistory" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Feedback_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Account_employeeId_key" ON "Account"("employeeId");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_accountId_expiresAt_idx" ON "Session"("accountId", "expiresAt");
CREATE UNIQUE INDEX "Faq_question_key" ON "Faq"("question");
CREATE INDEX "AnswerHistory_accountId_askedAt_idx" ON "AnswerHistory"("accountId", "askedAt" DESC);
CREATE UNIQUE INDEX "AnswerSource_answerId_ordinal_key" ON "AnswerSource"("answerId", "ordinal");
CREATE UNIQUE INDEX "Feedback_answerId_key" ON "Feedback"("answerId");
CREATE INDEX "Feedback_accountId_idx" ON "Feedback"("accountId");
