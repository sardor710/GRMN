CREATE TABLE "notification_cursors" (
	"channel" text PRIMARY KEY NOT NULL,
	"last_recorded_at" timestamp with time zone NOT NULL,
	"last_event_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_cursors_channel_valid" CHECK ("notification_cursors"."channel" ~ '^[a-z][a-z0-9_.-]{0,62}$')
);
