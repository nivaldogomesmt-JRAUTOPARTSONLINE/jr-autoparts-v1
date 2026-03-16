-- CreateTable: whatsapp_sessions
CREATE TABLE "whatsapp_sessions" (
    "id"            TEXT NOT NULL,
    "waId"          TEXT NOT NULL,
    "currentIntent" TEXT,
    "currentStep"   TEXT,
    "collectedData" JSONB NOT NULL DEFAULT '{}',
    "attempts"      INTEGER NOT NULL DEFAULT 0,
    "status"        TEXT NOT NULL DEFAULT 'active',
    "expiresAt"     TIMESTAMP(3) NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: whatsapp_events
CREATE TABLE "whatsapp_events" (
    "id"             TEXT NOT NULL,
    "sessionId"      TEXT NOT NULL,
    "waId"           TEXT NOT NULL,
    "direction"      TEXT NOT NULL,
    "messageId"      TEXT,
    "payloadSummary" JSONB,
    "detectedIntent" TEXT,
    "endpointHit"    TEXT,
    "status"         TEXT NOT NULL DEFAULT 'ok',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: sessions by waId + status (active session lookup)
CREATE INDEX "whatsapp_sessions_waId_status_idx" ON "whatsapp_sessions"("waId", "status");

-- CreateIndex: sessions by expiresAt (TTL cleanup)
CREATE INDEX "whatsapp_sessions_expiresAt_idx" ON "whatsapp_sessions"("expiresAt");

-- CreateIndex: events by sessionId
CREATE INDEX "whatsapp_events_sessionId_idx" ON "whatsapp_events"("sessionId");

-- CreateIndex: events by waId
CREATE INDEX "whatsapp_events_waId_idx" ON "whatsapp_events"("waId");

-- CreateIndex: unique messageId (partial — NULLs allowed)
CREATE UNIQUE INDEX "whatsapp_events_messageId_key" ON "whatsapp_events"("messageId") WHERE "messageId" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "whatsapp_events"
    ADD CONSTRAINT "whatsapp_events_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "whatsapp_sessions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
