CREATE TABLE "hangul_daily_time" (
	"profile_id" uuid NOT NULL,
	"day" date NOT NULL,
	"seconds" integer NOT NULL,
	CONSTRAINT "hangul_daily_time_profile_id_day_pk" PRIMARY KEY("profile_id","day")
);
--> statement-breakpoint
CREATE TABLE "hangul_plays" (
	"profile_id" uuid NOT NULL,
	"id" uuid NOT NULL,
	"stage_id" varchar(16) NOT NULL,
	"correct" smallint NOT NULL,
	"total" smallint NOT NULL,
	"stars" smallint NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	CONSTRAINT "hangul_plays_profile_id_id_pk" PRIMARY KEY("profile_id","id")
);
--> statement-breakpoint
CREATE TABLE "hangul_progress" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"epoch" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nickname" varchar(20) NOT NULL,
	"avatar" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hangul_daily_time" ADD CONSTRAINT "hangul_daily_time_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hangul_plays" ADD CONSTRAINT "hangul_plays_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hangul_progress" ADD CONSTRAINT "hangul_progress_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hangul_plays_profile_time" ON "hangul_plays" USING btree ("profile_id","played_at");