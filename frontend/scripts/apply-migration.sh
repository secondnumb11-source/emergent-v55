#!/bin/bash
# تنفيذ ترحيل قاعدة البيانات باستخدام curl و Supabase REST API
# Execute DB migration using curl and Supabase SQL

SUPABASE_URL="https://sofurxihjwgmbosyzeib.supabase.co"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"
PROJECT_ID="sofurxihjwgmbosyzeib"

if [ -z "$SERVICE_ROLE_KEY" ]; then
  echo "❌ SUPABASE_SERVICE_ROLE_KEY environment variable is required"
  exit 1
fi

# Read migration SQL
MIGRATION_FILE="../db/pending/20260702120000_add_portal_config_and_najiz.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Migration file not found: $MIGRATION_FILE"
  exit 1
fi

SQL_CONTENT=$(cat "$MIGRATION_FILE")

echo "🚀 Starting DB migration via Supabase REST API...\n"
echo "📄 SQL file loaded. Attempting to execute...\n"

# Try method 1: Direct SQL execution via Supabase Dashboard/SQL endpoint (if available)
echo "📤 Attempting direct SQL execution via REST API..."

# Supabase doesn't have a direct SQL execution API for authenticated users without RPC
# The best approach is to execute via their pg_net or a custom RPC function

# Try using psql if available (requires DATABASE_URL)
if command -v psql &> /dev/null; then
  echo "psql found! Attempting to connect to database..."
  
  if [ ! -z "$DATABASE_URL" ]; then
    echo "Using DATABASE_URL..."
    psql "$DATABASE_URL" -f "$MIGRATION_FILE" && {
      echo "✅ Migration executed successfully via psql!"
      exit 0
    }
  fi
fi

# Fallback: Provide instructions for manual execution
echo "⚠️  Could not auto-execute migration. Please run manually:"
echo ""
echo "Option 1: Via Supabase Web Dashboard"
echo "  1. Go to: https://app.supabase.com/project/${PROJECT_ID}/sql/new"
echo "  2. Paste this SQL:"
echo "─────────────────────────────────────────────────────"
cat "$MIGRATION_FILE"
echo ""
echo "─────────────────────────────────────────────────────"
echo "  3. Click 'Run' button or press CTRL+Enter"
echo ""
echo "Option 2: Via psql (if you have DATABASE_URL)"
echo "  psql \"\$DATABASE_URL\" -f $(pwd)/$MIGRATION_FILE"
echo ""
echo "⚠️  Migration NOT yet applied. Run one of the above options."
exit 1
