import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    console.log("🚀 Job started...");
    console.log("API KEY EXISTS:", !!BREVO_API_KEY);

    if (!BREVO_API_KEY) {
      throw new Error("Missing BREVO_API_KEY");
    }

    // ✅ 1. Fetch Admins
    const { data: admins, error: adminError } = await supabase
      .from('User')
      .select('email')
      .eq('role', 'Admin');

    if (adminError) throw adminError;

    const adminEmails = (admins || [])
      .map(a => a.email?.trim())
      .filter(Boolean);

    console.log("👤 Admins:", adminEmails);

    // ✅ 2. Date Setup (UTC SAFE)
    const now = new Date();

    const todayStart = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0, 0, 0
    ));

    const day4 = new Date(todayStart);
    day4.setUTCDate(day4.getUTCDate() + 4);

    console.log("📅 Today:", todayStart.toISOString());
    console.log("📅 Day+4:", day4.toISOString());

    // 🔴 Overdue Leads
    const { data: overdueLeads, error: overdueError } = await supabase
      .from('Lead')
      .select('*')
      .lt('nextFollowUpDate', todayStart.toISOString())
      .eq('overdue_reminder_sent', false);

    if (overdueError) throw overdueError;

    // 🟡 Upcoming Leads (4-day reminder)
    const { data: upcomingLeads, error: upcomingError } = await supabase
      .from('Lead')
      .select('*')
      .gte('nextFollowUpDate', day4.toISOString())
      .lt('nextFollowUpDate', new Date(day4.getTime() + 86400000).toISOString())
      .eq('four_day_reminder_sent', false);

    if (upcomingError) throw upcomingError;

    const leads = [
      ...(overdueLeads || []).map(l => ({ ...l, type: 'overdue' })),
      ...(upcomingLeads || []).map(l => ({ ...l, type: 'upcoming' }))
    ];

    if (leads.length === 0) {
      console.log("✅ No leads to process");
      return new Response(JSON.stringify({ message: "No leads" }));
    }

    console.log(`📊 Processing ${leads.length} leads`);

    // ✅ 4. Process Leads
    for (const lead of leads) {
      const isOverdue = lead.type === 'overdue';

      let assigneeEmail = lead.assignee || "";

      if (assigneeEmail && !assigneeEmail.includes('@')) {
        assigneeEmail = `${assigneeEmail}@gmail.com`;
      }

      const recipients = Array.from(
        new Set([assigneeEmail, ...adminEmails])
      ).filter(Boolean);

      if (recipients.length === 0) {
        console.warn(`⚠️ No recipients for lead ${lead.id}`);
        continue;
      }

      console.log(`📧 Sending email for ${lead.leadName} →`, recipients);

      // 🔥 BREVO EMAIL SEND
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": BREVO_API_KEY
        },
        body: JSON.stringify({
          sender: {
            name: "LeadFlow CRM",
            email: "yashb.nucleosys@gmail.com"
          },

          // ✅ ONLY YOUR SPECIFIED EMAILS
          to: [
            { email: "yashb.nucleosys@gmail.com" },
            { email: "sales@nucleosystech.com" }
          ],

          subject: isOverdue
            ? `⚠️ OVERDUE: ${lead.leadName}`
            : `📅 Upcoming Follow-up: ${lead.leadName}`,

          htmlContent: `
      <div style="font-family: Arial, sans-serif; background-color:#f4f6f8; padding:20px;">
        <div style="max-width:600px; margin:auto; background:white; border-radius:10px; overflow:hidden; box-shadow:0 4px 10px rgba(0,0,0,0.05);">

          <!-- Header -->
          <div style="background:#111827; color:white; padding:16px 24px;">
            <h2 style="margin:0; font-size:18px;">
              ${isOverdue ? "⚠️ Overdue Follow-up" : "📅 Upcoming Follow-up"}
            </h2>
          </div>

          <!-- Body -->
          <div style="padding:24px;">
            
            <p style="margin:0 0 16px; font-size:14px; color:#374151;">
              Hello,
            </p>

            <p style="margin:0 0 20px; font-size:14px; color:#374151;">
              You have a follow-up reminder for the following lead:
            </p>

            <!-- Lead Card -->
            <div style="border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin-bottom:20px;">
              
              <p style="margin:6px 0;"><strong>👤 Lead:</strong> ${lead.leadName}</p>
              <p style="margin:6px 0;"><strong>📅 Follow-up Date:</strong> ${new Date(lead.nextFollowUpDate).toLocaleDateString()}</p>
              <p style="margin:6px 0;"><strong>👨‍💼 Assigned To:</strong> ${lead.assignee}</p>

            </div>

            ${isOverdue
              ? `<p style="color:#dc2626; font-weight:600; margin-bottom:16px;">
                    ⚠️ This follow-up is overdue. Please take action immediately.
                  </p>`
              : `<p style="color:#2563eb; margin-bottom:16px;">
                    📌 This is a reminder for an upcoming follow-up.
                  </p>`
            }

            <!-- CTA -->
            <div style="text-align:center; margin:24px 0;">
              <a href="https://ncs-lead-flow.vercel.app/leads/${lead.id}" 
                 style="background:#111827; color:white; padding:10px 18px; border-radius:6px; text-decoration:none; font-size:14px;">
                Open CRM Dashboard
              </a>
            </div>

            <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />

            <p style="font-size:12px; color:#6b7280;">
              This is an automated reminder from <strong>LeadFlow CRM</strong>.
            </p>

          </div>

          <!-- Footer -->
          <div style="background:#f9fafb; padding:12px 24px; font-size:12px; color:#9ca3af;">
            © ${new Date().getFullYear()} LeadFlow CRM
          </div>

        </div>
      </div>
    `
        })
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("❌ Email failed:", data);
        continue;
      }

      console.log("✅ Email sent");

      // ✅ Update Flags
      const updateField = isOverdue
        ? { overdue_reminder_sent: true }
        : { four_day_reminder_sent: true };

      await supabase
        .from('Lead')
        .update(updateField)
        .eq('id', lead.id);
    }

    console.log("🎉 Job completed");

    return new Response(JSON.stringify({ status: "done" }));

  } catch (err) {
    console.error("🔥 Critical error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});