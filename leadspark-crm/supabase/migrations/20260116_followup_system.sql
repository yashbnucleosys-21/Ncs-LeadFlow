-- 1. Add tracking columns
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS upcoming_reminder_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS overdue_reminder_sent BOOLEAN DEFAULT FALSE;

-- 2. Create a function to reset flags when the date changes
CREATE OR REPLACE FUNCTION handle_followup_date_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only reset flags if the date actually changed
  IF (OLD.next_follow_up_date IS DISTINCT FROM NEW.next_follow_up_date) THEN
    NEW.upcoming_reminder_sent := FALSE;
    NEW.overdue_reminder_sent := FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create the trigger
CREATE TRIGGER tr_reset_followup_reminders
BEFORE UPDATE ON leads
FOR EACH ROW
EXECUTE FUNCTION handle_followup_date_change();

-- 4. Schedule the Daily Cron (8 AM)
-- Replace [PROJECT_REF] and [SERVICE_ROLE_KEY] with your values
SELECT cron.schedule(
  'daily-followup-reminders',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://vopqlguxqazuwlutcdbv.supabase.co/functions/v1/process-followup-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer [SERVICE_ROLE_KEY]')
  )
  $$
);