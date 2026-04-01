-- Add indexes for operational filters and paginated lists
CREATE INDEX IF NOT EXISTS "vehicles_client_id_idx" ON "vehicles"("client_id");
CREATE INDEX IF NOT EXISTS "vehicles_active_plate_idx" ON "vehicles"("active", "plate");

CREATE INDEX IF NOT EXISTS "service_orders_status_idx" ON "service_orders"("status");
CREATE INDEX IF NOT EXISTS "service_orders_client_id_idx" ON "service_orders"("client_id");
CREATE INDEX IF NOT EXISTS "service_orders_vehicle_id_idx" ON "service_orders"("vehicle_id");
CREATE INDEX IF NOT EXISTS "service_orders_created_at_idx" ON "service_orders"("created_at");
CREATE INDEX IF NOT EXISTS "service_orders_updated_at_idx" ON "service_orders"("updated_at");

CREATE INDEX IF NOT EXISTS "so_items_so_id_idx" ON "so_items"("so_id");
CREATE INDEX IF NOT EXISTS "so_items_product_id_idx" ON "so_items"("product_id");
CREATE INDEX IF NOT EXISTS "so_items_service_id_idx" ON "so_items"("service_id");

CREATE INDEX IF NOT EXISTS "so_status_logs_so_id_idx" ON "so_status_logs"("so_id");
CREATE INDEX IF NOT EXISTS "so_status_logs_created_at_idx" ON "so_status_logs"("created_at");

CREATE INDEX IF NOT EXISTS "whatsapp_messages_status_idx" ON "whatsapp_messages"("status");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_client_id_idx" ON "whatsapp_messages"("client_id");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_so_id_idx" ON "whatsapp_messages"("so_id");
CREATE INDEX IF NOT EXISTS "whatsapp_messages_created_at_idx" ON "whatsapp_messages"("created_at");
