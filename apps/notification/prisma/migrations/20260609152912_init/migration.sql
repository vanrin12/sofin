-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_eventId_key" ON "Notification"("eventId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
