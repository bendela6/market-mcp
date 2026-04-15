CREATE TYPE "public"."plan_line_kind" AS ENUM('query', 'item');--> statement-breakpoint
CREATE TYPE "public"."plan_strategy" AS ENUM('cheapest-per-item', 'single-store', 'both');--> statement-breakpoint
CREATE TYPE "public"."plan_type" AS ENUM('mixed', 'item-based', 'query-based');--> statement-breakpoint
CREATE TYPE "public"."product_line" AS ENUM('restaurant', 'store', 'grocery', 'pharmacy', 'other');--> statement-breakpoint
CREATE TYPE "public"."vendor_id" AS ENUM('wolt', 'glovo', 'bolt-food', 'europroduct', 'goodwill');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"vendor_slug" text NOT NULL,
	"parent_slug" text,
	"name" text NOT NULL,
	"position" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "embedding_jobs" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"enqueued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_embeddings" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"model_version" text NOT NULL,
	"embedded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"store_id" uuid NOT NULL,
	"category_id" uuid,
	"vendor" "vendor_id" NOT NULL,
	"vendor_item_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"gtin" text,
	"image_url" text,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"search_text" text GENERATED ALWAYS AS (name || ' ' || coalesce(description, '')) STORED,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "plan_line_kind" NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"query" text,
	"item_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "plan_type" NOT NULL,
	"strategy" "plan_strategy" NOT NULL,
	"vendor" "vendor_id",
	"store_slugs" jsonb,
	"include_offline" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"available" boolean NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"vendor" "vendor_id" NOT NULL,
	"vendor_slug" text NOT NULL,
	"name" text NOT NULL,
	"product_line" "product_line",
	"online" boolean DEFAULT false NOT NULL,
	"currency" text NOT NULL,
	"lat" text,
	"lon" text,
	"address" text,
	"raw_content" jsonb,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_assortment_refresh_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "embedding_jobs" ADD CONSTRAINT "embedding_jobs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_embeddings" ADD CONSTRAINT "item_embeddings_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_lines" ADD CONSTRAINT "plan_lines_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plan_lines" ADD CONSTRAINT "plan_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_slug_uq" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_store_slug_uq" ON "categories" USING btree ("store_id","vendor_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embedding_jobs_enqueued_ix" ON "embedding_jobs" USING btree ("enqueued_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_embeddings_hnsw" ON "item_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_embeddings_model_ix" ON "item_embeddings" USING btree ("model_version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "items_slug_uq" ON "items" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "items_store_vendor_item_uq" ON "items" USING btree ("store_id","vendor_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_gtin_ix" ON "items" USING btree ("gtin");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_name_trgm" ON "items" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_fts_ix" ON "items" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_lines_plan_pos_ix" ON "plan_lines" USING btree ("plan_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "plans_slug_uq" ON "plans" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plans_user_ix" ON "plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plans_created_ix" ON "plans" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plans_name_trgm" ON "plans" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_observations_item_time_ix" ON "price_observations" USING btree ("item_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stores_slug_uq" ON "stores" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stores_vendor_slug_uq" ON "stores" USING btree ("vendor","vendor_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stores_name_trgm" ON "stores" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stores_product_line_ix" ON "stores" USING btree ("product_line");--> statement-breakpoint
ALTER TABLE "plan_lines" ADD CONSTRAINT "plan_lines_kind_check" CHECK (
  (kind = 'query' AND query IS NOT NULL) OR
  (kind = 'item'  AND item_id IS NOT NULL)
);