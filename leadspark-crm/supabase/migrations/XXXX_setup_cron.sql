-- Schedule to run every day at 8:00 AM
SELECT cron.schedule(
  'daily-followup-reminder',
  '0 8 * * *', -- Standard Cron syntax for 8 AM Daily
  $$
  SELECT net.http_post(
    url := 'https://[YOUR_PROJECT_REF].supabase.co/functions/v1/scheduled-followup-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [YOUR_SERVICE_ROLE_KEY]'
    )
  )
  $$
);