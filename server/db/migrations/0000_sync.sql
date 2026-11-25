CREATE TABLE "lists" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"order_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_clients" (
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"last_seq" bigint NOT NULL,
	CONSTRAINT "sync_clients_user_id_client_id_pk" PRIMARY KEY("user_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "sync_users" (
	"user_id" text PRIMARY KEY NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"list_id" text NOT NULL,
	"title" text NOT NULL,
	"order_key" text NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"version" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lists_owner_version" ON "lists" USING btree ("owner_id","version");--> statement-breakpoint
CREATE INDEX "tasks_owner_version" ON "tasks" USING btree ("owner_id","version");