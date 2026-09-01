import nodemailer from 'nodemailer';

// Email is sent via Brevo's SMTP relay (smtp-relay.brevo.com), using Nodemailer.
// Unlike Resend's sandbox domain, Brevo only requires verifying a single sender
// email address (a clicked confirmation link, no DNS records) before you can send
// to any recipient. See: Brevo dashboard -> Senders, Domains & Dedicated IPs -> Senders.
const smtpHost = process.env.SMTP_HOST || 'smtp-relay.brevo.com';
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const emailFrom = process.env.EMAIL_FROM || 'SocietyOne <no-reply@societyone.local>';

if (!smtpUser || !smtpPass) {
  console.warn('[Email] SMTP_USER/SMTP_PASS are not set. Set them in your .env file (see .env.example). Email dispatch will be skipped.');
}

const transporter = (smtpUser && smtpPass)
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // true for 465 (SSL), false for 587/others (STARTTLS)
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    })
  : null;

export async function sendVerificationEmail(toEmail: string, name: string, otp: string, societyName?: string) {
  try {
    if (!transporter) {
      console.warn('[Email] SMTP not configured, skipping email dispatch.');
      return { success: false, error: 'SMTP not configured' };
    }

    console.log(`[Email] Dispatching verification email to ${toEmail}...`);

    const response = await transporter.sendMail({
      from: emailFrom,
      to: toEmail.trim(),
      subject: `${otp} is your SocietyOne verification code`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0;">
          <div style="text-align: center; margin-bottom: 28px;">
            <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; background-color: #4f46e5; border-radius: 12px; color: #ffffff; font-size: 24px; font-weight: bold; margin-bottom: 12px;">🏢</div>
            <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">SocietyOne</h1>
            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">Housing Society & Resident Portal</p>
          </div>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
            <p style="color: #334155; font-size: 15px; margin: 0 0 12px 0;">Hello <strong>${name || 'Resident'}</strong>,</p>
            <p style="color: #475569; font-size: 13px; line-height: 1.6; margin: 0 0 20px 0;">
              Thank you for registering for <strong>${societyName || 'Housing Society'}</strong>. Please enter the 6-digit confirmation code below to verify your email address (Level 1 Verification):
            </p>
            
            <div style="display: inline-block; background-color: #4338ca; color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: 8px; padding: 14px 28px; border-radius: 10px; font-family: monospace; margin-bottom: 8px;">
              ${otp}
            </div>
            
            <p style="color: #94a3b8; font-size: 12px; margin: 12px 0 0 0;">This code is valid for 15 minutes.</p>
          </div>

          <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; font-size: 13px; color: #64748b; line-height: 1.6;">
            <p style="margin: 0 0 8px 0; color: #334155; font-weight: 600;">Two-Tier Security Process:</p>
            <ol style="margin: 0; padding-left: 20px; color: #64748b;">
              <li style="margin-bottom: 4px;"><strong>Level 1:</strong> Email verification using the code above.</li>
              <li><strong>Level 2:</strong> Society Administrator verifies and approves your flat allocation.</li>
            </ol>
            <p style="margin-top: 20px; color: #94a3b8; font-size: 11px; text-align: center;">If you did not initiate this request, you can safely ignore this email.</p>
          </div>
        </div>
      `
    });

    console.log(`[Email Success] Email delivered. Message ID: ${response.messageId}`);
    return { success: true, id: response.messageId };
  } catch (err: any) {
    console.error('[Email Exception]:', err);
    return { success: false, error: err.message };
  }
}
