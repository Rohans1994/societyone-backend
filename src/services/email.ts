import nodemailer from 'nodemailer';
import { pool } from '../db/pool.js';

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

// --- Notice / Event emails ---
//
// Optional, opt-in per notice/event (see the "Send email" checkbox in
// NoticeModal.tsx / Events.tsx) — a second notification channel alongside
// the existing push notifications, using the same SMTP transporter already
// set up above for OTP emails. Fire-and-forget from the callers
// (routes/notices.ts, routes/events.ts), same resilience pattern as push:
// a failed/skipped email never blocks notice/event creation.

// Shared branded wrapper so notice/event emails visually match the
// verification email above, rather than duplicating the header/card
// markup three times.
function wrapEmailBody(societyName: string | undefined, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0;">
      <div style="text-align: center; margin-bottom: 28px;">
        <div style="display: inline-block; width: 48px; height: 48px; line-height: 48px; background-color: #4f46e5; border-radius: 12px; color: #ffffff; font-size: 24px; font-weight: bold; margin-bottom: 12px;">🏢</div>
        <h1 style="color: #0f172a; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">SocietyOne</h1>
        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0;">${societyName || 'Housing Society'}</p>
      </div>
      ${bodyHtml}
      <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 11px;">This is an automated message from your society's SocietyOne portal.</p>
      </div>
    </div>
  `;
}

interface NoticeEmailContent {
  title: string;
  description: string;
  category?: string;
  priority?: string;
  date?: string;
  createdByName?: string;
}

function buildNoticeEmailHtml(societyName: string | undefined, greetingName: string | undefined, notice: NoticeEmailContent): string {
  const isHigh = (notice.priority || '').toLowerCase() === 'high';
  const body = `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
      ${greetingName ? `<p style="color: #334155; font-size: 15px; margin: 0 0 12px 0;">Hello <strong>${greetingName}</strong>,</p>` : ''}
      <div style="margin-bottom: 10px;">
        <span style="display: inline-block; background-color: ${isHigh ? '#fee2e2' : '#fef3c7'}; color: ${isHigh ? '#991b1b' : '#92400e'}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 10px; border-radius: 999px; margin-right: 6px;">${notice.priority || 'Normal'} Priority</span>
        <span style="display: inline-block; background-color: #e0f2fe; color: #075985; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 10px; border-radius: 999px;">${notice.category || 'General'}</span>
      </div>
      <h2 style="color: #0f172a; font-size: 19px; font-weight: 700; margin: 0 0 10px 0;">${notice.title}</h2>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0; white-space: pre-wrap;">${notice.description}</p>
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">Issued by ${notice.createdByName || 'Managing Committee'}${notice.date ? ` on ${notice.date}` : ''}</p>
    </div>
  `;
  return wrapEmailBody(societyName, body);
}

interface EventEmailContent {
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  organizer?: string;
}

function buildEventEmailHtml(societyName: string | undefined, event: EventEmailContent): string {
  const body = `
    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
      <span style="display: inline-block; background-color: #ede9fe; color: #5b21b6; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 10px; border-radius: 999px; margin-bottom: 10px;">New Event</span>
      <h2 style="color: #0f172a; font-size: 19px; font-weight: 700; margin: 8px 0 10px 0;">${event.title}</h2>
      <p style="color: #334155; font-size: 13px; margin: 0 0 4px 0;"><strong>📅 ${event.date}</strong> at <strong>${event.time}</strong></p>
      <p style="color: #334155; font-size: 13px; margin: 0 0 12px 0;">📍 ${event.location}</p>
      <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0; white-space: pre-wrap;">${event.description}</p>
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">Organized by ${event.organizer || 'Managing Committee'}</p>
    </div>
  `;
  return wrapEmailBody(societyName, body);
}

async function dispatchEmail(toEmail: string, subject: string, html: string): Promise<void> {
  if (!transporter) {
    console.warn('[Email] SMTP not configured, skipping email dispatch.');
    return;
  }
  try {
    const response = await transporter.sendMail({ from: emailFrom, to: toEmail, subject, html });
    console.log(`[Email Success] Sent "${subject}" to ${toEmail}. Message ID: ${response.messageId}`);
  } catch (err: any) {
    console.error(`[Email Exception] Failed to send "${subject}" to ${toEmail}:`, err.message);
  }
}

// A single email with every recipient's address in Bcc (one SMTP
// transaction rather than one per resident) — see the "Single email, all
// in BCC" decision for broadcast notices/events.
async function dispatchBccEmail(toEmails: string[], subject: string, html: string): Promise<void> {
  if (toEmails.length === 0) {
    console.warn('[Email] dispatchBccEmail called with zero recipients — nothing to send.');
    return;
  }
  if (!transporter) {
    console.warn('[Email] SMTP not configured, skipping email dispatch.');
    return;
  }
  try {
    // A "to" of the sender's own address (rather than leaving it empty) —
    // some SMTP relays reject a message with no "to" header at all.
    const response = await transporter.sendMail({ from: emailFrom, to: emailFrom, bcc: toEmails, subject, html });
    console.log(`[Email Success] Sent "${subject}" to ${toEmails.length} resident(s) via BCC. Message ID: ${response.messageId}`);
  } catch (err: any) {
    console.error(`[Email Exception] Failed to send "${subject}" via BCC:`, err.message);
  }
}

/** Emails one specific resident about a personal/targeted notice. */
export async function sendNoticeEmailToUser(uid: string, notice: NoticeEmailContent): Promise<void> {
  const result = await pool.query(
    `SELECT u.email, u.name, s.name AS society_name
     FROM society_users u LEFT JOIN society_societies s ON s.id = u.society_id
     WHERE u.uid = $1`,
    [uid]
  );
  if (result.rows.length === 0 || !result.rows[0].email) {
    console.warn(`[Email] sendNoticeEmailToUser: no email on file for uid ${uid} — skipping.`);
    return;
  }
  const { email, name, society_name } = result.rows[0];
  const html = buildNoticeEmailHtml(society_name, name, notice);
  await dispatchEmail(email, `Notice: ${notice.title}`, html);
}

/** Emails every resident of a society about a common/broadcast notice. */
export async function sendNoticeEmailToSociety(societyId: string, notice: NoticeEmailContent): Promise<void> {
  const result = await pool.query(
    `SELECT u.email, s.name AS society_name
     FROM society_users u LEFT JOIN society_societies s ON s.id = u.society_id
     WHERE u.society_id = $1 AND u.role = 'Resident' AND u.email IS NOT NULL`,
    [societyId]
  );
  const emails = result.rows.map((r) => r.email).filter(Boolean);
  const societyName = result.rows[0]?.society_name;
  const html = buildNoticeEmailHtml(societyName, undefined, notice);
  await dispatchBccEmail(emails, `Notice: ${notice.title}`, html);
}

/** Emails every resident of a society about a new event. */
export async function sendEventEmailToSociety(societyId: string, event: EventEmailContent): Promise<void> {
  const result = await pool.query(
    `SELECT u.email, s.name AS society_name
     FROM society_users u LEFT JOIN society_societies s ON s.id = u.society_id
     WHERE u.society_id = $1 AND u.role = 'Resident' AND u.email IS NOT NULL`,
    [societyId]
  );
  const emails = result.rows.map((r) => r.email).filter(Boolean);
  const societyName = result.rows[0]?.society_name;
  const html = buildEventEmailHtml(societyName, event);
  await dispatchBccEmail(emails, `New Event: ${event.title}`, html);
}
