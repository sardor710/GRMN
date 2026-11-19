CREATE TABLE "translation_memory" (
	"source_sha256" text NOT NULL,
	"locale" text NOT NULL,
	"translated" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_memory_source_sha256_locale_pk" PRIMARY KEY("source_sha256","locale"),
	CONSTRAINT "translation_memory_valid" CHECK ("translation_memory"."locale" IN ('ru','kk') AND "translation_memory"."source_sha256" ~ '^[0-9a-f]{64}$' AND length(btrim("translation_memory"."translated"))>0)
);
