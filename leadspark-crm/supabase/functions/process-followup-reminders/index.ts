import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const today = new Date();
  const fourDaysFromNow = new Date();
  fourDaysFromNow.setDate(today.getDate() + 4);
  const fourDaysStr = fourDaysFromNow.toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];

  // 1. Fetch Upcoming (4 days away)
  const { data: upcoming } = await supabase
    .from("leads")
    .select("id, first_name, last_name, next_follow_up_date, assigned_to_email")
    .eq("upcoming_reminder_sent", false)
    .eq("next_follow_up_date", fourDaysStr);

  // 2. Fetch Overdue (Date in past)
  const { data: overdue } = await supabase
    .from("leads")
    .select("id, first_name, last_name, next_follow_up_date, assigned_to_email")
    .eq("overdue_reminder_sent", false)
    .lt("next_follow_up_date", todayStr);

  // 3. Fetch All Admins (to notify them)
  const { data: admins } = await supabase
    .from("user_roles") // Adjust table name to your project's role table
    .select("email")
    .eq("role", "admin");

  const adminEmails = admins?.map(a => a.email) || [];
  const client = new SmtpClient();

  // Helper to connect and send
  const sendEmail = async (to: string, subject: string, body: string) => {
    try {
      await client.connectTLS({
        hostname: "smtp.gmail.com",
        port: 587,
        username: Deno.env.get("GMAIL_USER")!,
        password: Deno.env.get("GMAIL_APP_PASSWORD")!,
      });
      await client.send({
        from: Deno.env.get("GMAIL_USER")!,
        to,
        subject,
        content: body,
      });
    } catch (e) { console.error("Mail Error:", e); }
  };

  // Process Upcoming
  for (const lead of (upcoming || [])) {
    const msg = `Reminder: Follow-up with ${lead.first_name} ${lead.last_name} is scheduled for ${lead.next_follow_up_date} (4 days from now).`;
    await sendEmail(lead.assigned_to_email, "📅 Upcoming Follow-up", msg);
    for (const admin of adminEmails) await sendEmail(admin, "👀 Info: Upcoming Follow-up", `User ${lead.assigned_to_email} has a follow-up: ${msg}`);
    await supabase.from("leads").update({ upcoming_reminder_sent: true }).eq("id", lead.id);
  }

  // Process Overdue
  for (const lead of (overdue || [])) {
    const msg = `⚠️ OVERDUE: Follow-up with ${lead.first_name} ${lead.last_name} was due on ${lead.next_follow_up_date}. Please action this immediately.`;
    await sendEmail(lead.assigned_to_email, "🚨 Overdue Follow-up", msg);
    for (const admin of adminEmails) await sendEmail(admin, "🚨 Escalation: Overdue Follow-up", `User ${lead.assigned_to_email} missed a follow-up: ${msg}`);
    await supabase.from("leads").update({ overdue_reminder_sent: true }).eq("id", lead.id);
  }

  await client.close();
  return new Response("Daily reminders processed.");
});