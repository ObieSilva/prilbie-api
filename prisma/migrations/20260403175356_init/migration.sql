-- CreateEnum
CREATE TYPE "EffortLevel" AS ENUM ('baseline', 'normal', 'stretch');

-- CreateEnum
CREATE TYPE "TimeAnchor" AS ENUM ('morning', 'midday', 'afternoon', 'evening', 'anytime');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('coaching', 'system_builder', 'general_chat');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system');

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "clerk_user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "onboarded" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "last_review_date" TIMESTAMP(3),
    "last_milestone_seen" INTEGER NOT NULL DEFAULT 0,
    "focused_action_id" TEXT,
    "focused_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "systems" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "replaced_habit" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "areas" (
    "id" TEXT NOT NULL,
    "system_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_bundles" (
    "id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "bundle_title" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actions" (
    "id" TEXT NOT NULL,
    "bundle_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "effort_level" "EffortLevel" NOT NULL,
    "anchor" "TimeAnchor" NOT NULL DEFAULT 'anytime',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkins" (
    "id" TEXT NOT NULL,
    "system_id" TEXT NOT NULL,
    "area_id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "energy_level" "EffortLevel" NOT NULL,
    "note" TEXT,
    "date" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_energies" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "global_level" "EffortLevel" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_energies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_energy_overrides" (
    "id" TEXT NOT NULL,
    "daily_energy_id" TEXT NOT NULL,
    "system_id" TEXT NOT NULL,
    "level" "EffortLevel" NOT NULL,

    CONSTRAINT "system_energy_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_reflections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_reflections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "ConversationType" NOT NULL DEFAULT 'general_chat',
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_clerk_user_id_key" ON "user_profiles"("clerk_user_id");

-- CreateIndex
CREATE INDEX "systems_user_id_idx" ON "systems"("user_id");

-- CreateIndex
CREATE INDEX "systems_user_id_deleted_at_idx" ON "systems"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "areas_system_id_idx" ON "areas"("system_id");

-- CreateIndex
CREATE INDEX "areas_system_id_deleted_at_idx" ON "areas"("system_id", "deleted_at");

-- CreateIndex
CREATE INDEX "action_bundles_area_id_idx" ON "action_bundles"("area_id");

-- CreateIndex
CREATE INDEX "action_bundles_area_id_deleted_at_idx" ON "action_bundles"("area_id", "deleted_at");

-- CreateIndex
CREATE INDEX "actions_bundle_id_idx" ON "actions"("bundle_id");

-- CreateIndex
CREATE UNIQUE INDEX "actions_bundle_id_effort_level_key" ON "actions"("bundle_id", "effort_level");

-- CreateIndex
CREATE INDEX "checkins_system_id_idx" ON "checkins"("system_id");

-- CreateIndex
CREATE INDEX "checkins_area_id_idx" ON "checkins"("area_id");

-- CreateIndex
CREATE INDEX "checkins_date_idx" ON "checkins"("date");

-- CreateIndex
CREATE INDEX "checkins_system_id_date_idx" ON "checkins"("system_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "checkins_action_id_date_key" ON "checkins"("action_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_energies_user_id_date_key" ON "daily_energies"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "system_energy_overrides_daily_energy_id_system_id_key" ON "system_energy_overrides"("daily_energy_id", "system_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reflections_user_id_date_key" ON "daily_reflections"("user_id", "date");

-- CreateIndex
CREATE INDEX "ai_conversations_user_id_idx" ON "ai_conversations"("user_id");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_idx" ON "ai_messages"("conversation_id");

-- AddForeignKey
ALTER TABLE "systems" ADD CONSTRAINT "systems_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "areas" ADD CONSTRAINT "areas_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_bundles" ADD CONSTRAINT "action_bundles_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actions" ADD CONSTRAINT "actions_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "action_bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_energies" ADD CONSTRAINT "daily_energies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_energy_overrides" ADD CONSTRAINT "system_energy_overrides_daily_energy_id_fkey" FOREIGN KEY ("daily_energy_id") REFERENCES "daily_energies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reflections" ADD CONSTRAINT "daily_reflections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
