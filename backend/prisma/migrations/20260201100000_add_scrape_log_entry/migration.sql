-- CreateTable
CREATE TABLE "ScrapeLogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "upserted" INTEGER NOT NULL,
    "detectedPageParam" TEXT,
    "nextPageCount" INTEGER NOT NULL,
    "skippedRows" INTEGER NOT NULL,
    "sampleSkippedKeys" TEXT NOT NULL,
    "errors" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
