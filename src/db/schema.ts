import { pool } from './pool.js';

// Initialize Database structure
export async function initializeDatabase() {
  let client;
  try {
    client = await pool.connect();
    console.log('PostgreSQL connection successful. Bootstrapping tables...');
    await client.query('BEGIN');

    // Societies
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_societies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        address TEXT NOT NULL,
        city TEXT,
        pincode TEXT NOT NULL,
        wings JSONB NOT NULL,
        admin_email TEXT,
        admin_name TEXT,
        admin_phone TEXT,
        phone TEXT,
        created_at TEXT
      );
    `);

    // Ensure columns exist on society_societies
    await client.query(`
      ALTER TABLE society_societies ADD COLUMN IF NOT EXISTS city TEXT;
      ALTER TABLE society_societies ADD COLUMN IF NOT EXISTS state TEXT;
      ALTER TABLE society_societies ADD COLUMN IF NOT EXISTS country TEXT;
      ALTER TABLE society_societies ADD COLUMN IF NOT EXISTS admin_email TEXT;
      ALTER TABLE society_societies ADD COLUMN IF NOT EXISTS admin_name TEXT;
      ALTER TABLE society_societies ADD COLUMN IF NOT EXISTS admin_phone TEXT;
      ALTER TABLE society_societies ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE society_societies ADD COLUMN IF NOT EXISTS created_at TEXT;
      ALTER TABLE society_societies ADD COLUMN IF NOT EXISTS wings JSONB;
      -- Name of this society's dedicated Supabase Storage bucket (e.g.
      -- "soc-mtb32pfk-arkade-earth"), containing tendor/, amc/, and assets/
      -- folders. Nullable: legacy societies created before this feature keep
      -- using the old shared flat buckets until backfilled (see
      -- POST /api/admin/backfill-society-buckets).
      ALTER TABLE society_societies ADD COLUMN IF NOT EXISTS storage_bucket TEXT;
    `);

    // Users
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_users (
        uid TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        role TEXT NOT NULL,
        wing TEXT,
        apartment_no TEXT,
        avatar_url TEXT,
        password TEXT,
        society_id TEXT,
        society_name TEXT
      );
    `);

    // Ensure columns exist on society_users
    await client.query(`
      ALTER TABLE society_users ADD COLUMN IF NOT EXISTS phone TEXT;
      ALTER TABLE society_users ADD COLUMN IF NOT EXISTS society_id TEXT;
      ALTER TABLE society_users ADD COLUMN IF NOT EXISTS society_name TEXT;
      ALTER TABLE society_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      ALTER TABLE society_users ADD COLUMN IF NOT EXISTS password TEXT;
      ALTER TABLE society_users ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN DEFAULT TRUE;
      ALTER TABLE society_users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT TRUE;
      ALTER TABLE society_users ADD COLUMN IF NOT EXISTS verification_token TEXT;
      -- Links this profile row to its Supabase Auth identity (auth.users.id).
      -- Nullable during migration: existing rows have no auth_uid until they're
      -- migrated into Supabase Auth (see POST /api/admin/migrate-users-to-auth).
      ALTER TABLE society_users ADD COLUMN IF NOT EXISTS auth_uid TEXT;
    `);
    // Unique index so one Supabase Auth identity maps to exactly one profile row
    // (partial index skips NULLs so unmigrated rows don't conflict with each other).
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS society_users_auth_uid_unique_idx
        ON society_users (auth_uid) WHERE auth_uid IS NOT NULL;
    `);

    // Vendors
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_vendors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        service_category TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        status TEXT NOT NULL,
        society_id TEXT
      );
    `);
    await client.query(`ALTER TABLE society_vendors ADD COLUMN IF NOT EXISTS society_id TEXT;`);

    // Tendors
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_tendors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        society_id TEXT
      );
    `);
    await client.query(`ALTER TABLE society_tendors ADD COLUMN IF NOT EXISTS society_id TEXT;`);

    // Quotations
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_quotations (
        id SERIAL PRIMARY KEY,
        tendor_id TEXT REFERENCES society_tendors(id) ON DELETE CASCADE,
        vendor_id TEXT,
        vendor_name TEXT,
        quotation NUMERIC NOT NULL,
        pdf_url TEXT,
        pdf_name TEXT,
        society_id TEXT
      );
    `);
    await client.query(`ALTER TABLE society_quotations ADD COLUMN IF NOT EXISTS society_id TEXT;`);

    // Invoices
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_invoices (
        id TEXT PRIMARY KEY,
        resident_name TEXT NOT NULL,
        resident_id TEXT,
        wing TEXT,
        apartment_no TEXT,
        amount NUMERIC NOT NULL,
        due_date TEXT NOT NULL,
        status TEXT NOT NULL,
        type TEXT NOT NULL,
        frequency TEXT,
        period TEXT,
        breakdown JSONB,
        paid_at TEXT,
        receipt_id TEXT,
        payment_method TEXT,
        description TEXT,
        society_id TEXT
      );
    `);
    await client.query(`ALTER TABLE society_invoices ADD COLUMN IF NOT EXISTS society_id TEXT;`);
    await client.query(`ALTER TABLE society_invoices ADD COLUMN IF NOT EXISTS resident_id TEXT;`);
    await client.query(`ALTER TABLE society_invoices ADD COLUMN IF NOT EXISTS wing TEXT;`);
    await client.query(`ALTER TABLE society_invoices ADD COLUMN IF NOT EXISTS apartment_no TEXT;`);
    await client.query(`ALTER TABLE society_invoices ADD COLUMN IF NOT EXISTS frequency TEXT;`);
    await client.query(`ALTER TABLE society_invoices ADD COLUMN IF NOT EXISTS period TEXT;`);
    await client.query(`ALTER TABLE society_invoices ADD COLUMN IF NOT EXISTS breakdown JSONB;`);
    await client.query(`ALTER TABLE society_invoices ADD COLUMN IF NOT EXISTS paid_at TEXT;`);
    await client.query(`ALTER TABLE society_invoices ADD COLUMN IF NOT EXISTS receipt_id TEXT;`);
    await client.query(`ALTER TABLE society_invoices ADD COLUMN IF NOT EXISTS payment_method TEXT;`);

    // Receipts
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_receipts (
        id TEXT PRIMARY KEY,
        invoice_id TEXT,
        resident_id TEXT,
        resident_name TEXT NOT NULL,
        wing TEXT,
        apartment_no TEXT,
        amount NUMERIC NOT NULL,
        payment_date TEXT NOT NULL,
        payment_time TEXT,
        payment_method TEXT NOT NULL,
        transaction_ref TEXT NOT NULL,
        period TEXT,
        frequency TEXT,
        society_id TEXT,
        society_name TEXT,
        status TEXT DEFAULT 'Success',
        breakdown JSONB,
        pdf_url TEXT,
        created_at TEXT NOT NULL
      );
    `);
    await client.query(`ALTER TABLE society_receipts ADD COLUMN IF NOT EXISTS society_id TEXT;`);
    await client.query(`ALTER TABLE society_receipts ADD COLUMN IF NOT EXISTS resident_id TEXT;`);
    await client.query(`ALTER TABLE society_receipts ADD COLUMN IF NOT EXISTS breakdown JSONB;`);

    // Maintenance Plans / Cycles
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_maintenance_plans (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        frequency TEXT NOT NULL,
        period_label TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        rate_amount NUMERIC NOT NULL,
        breakdown JSONB,
        wing TEXT DEFAULT 'ALL',
        notes TEXT,
        society_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    await client.query(`ALTER TABLE society_maintenance_plans ADD COLUMN IF NOT EXISTS society_id TEXT;`);

    // Transactions
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_transactions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        society_id TEXT
      );
    `);
    await client.query(`ALTER TABLE society_transactions ADD COLUMN IF NOT EXISTS society_id TEXT;`);

    // Helpdesk Tickets
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_tickets (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL,
        assigned_to TEXT,
        created_by TEXT NOT NULL,
        created_by_name TEXT,
        wing TEXT,
        apartment_no TEXT,
        date_created TEXT NOT NULL,
        attachments JSONB,
        progress_update TEXT,
        society_id TEXT
      );
    `);
    await client.query(`ALTER TABLE society_tickets ADD COLUMN IF NOT EXISTS society_id TEXT;`);

    // Events
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_events (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        location TEXT NOT NULL,
        description TEXT NOT NULL,
        organizer TEXT NOT NULL,
        society_id TEXT
      );
    `);
    await client.query(`ALTER TABLE society_events ADD COLUMN IF NOT EXISTS society_id TEXT;`);

    // Notices
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_notices (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT DEFAULT 'General',
        date TEXT NOT NULL,
        priority TEXT DEFAULT 'Normal',
        created_by TEXT,
        created_by_name TEXT,
        society_id TEXT NOT NULL
      );
    `);
    await client.query(`ALTER TABLE society_notices ADD COLUMN IF NOT EXISTS society_id TEXT;`);
    await client.query(`ALTER TABLE society_notices ADD COLUMN IF NOT EXISTS category TEXT;`);
    await client.query(`ALTER TABLE society_notices ADD COLUMN IF NOT EXISTS priority TEXT;`);
    await client.query(`ALTER TABLE society_notices ADD COLUMN IF NOT EXISTS created_by_name TEXT;`);
    // Optional image/PDF attachment, and optional single-resident targeting
    // (NULL target_uid = broadcast/common notice visible to everyone, as
    // before; a set target_uid restricts visibility to just that resident).
    await client.query(`ALTER TABLE society_notices ADD COLUMN IF NOT EXISTS attachment_url TEXT;`);
    await client.query(`ALTER TABLE society_notices ADD COLUMN IF NOT EXISTS target_uid TEXT;`);
    await client.query(`ALTER TABLE society_notices ADD COLUMN IF NOT EXISTS target_user_name TEXT;`);

    // Fishbowl messages
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_fishbowl (
        id TEXT PRIMARY KEY,
        text TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        wing TEXT NOT NULL,
        apartment_no TEXT NOT NULL,
        is_deleted BOOLEAN DEFAULT FALSE,
        reply_to_id TEXT,
        society_id TEXT
      );
    `);
    await client.query(`ALTER TABLE society_fishbowl ADD COLUMN IF NOT EXISTS society_id TEXT;`);

    // Facilities / Amenities
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_facilities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        capacity INT DEFAULT 10,
        open_time TEXT,
        close_time TEXT,
        image_url TEXT,
        images JSONB DEFAULT '[]'::jsonb,
        can_book BOOLEAN DEFAULT TRUE,
        requires_payment BOOLEAN DEFAULT FALSE,
        price INT DEFAULT 0,
        rules TEXT,
        society_id TEXT NOT NULL
      );
    `);
    await client.query(`ALTER TABLE society_facilities ADD COLUMN IF NOT EXISTS description TEXT;`);
    await client.query(`ALTER TABLE society_facilities ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;`);
    await client.query(`ALTER TABLE society_facilities ADD COLUMN IF NOT EXISTS can_book BOOLEAN DEFAULT TRUE;`);
    await client.query(`ALTER TABLE society_facilities ADD COLUMN IF NOT EXISTS requires_payment BOOLEAN DEFAULT FALSE;`);
    await client.query(`ALTER TABLE society_facilities ADD COLUMN IF NOT EXISTS price INT DEFAULT 0;`);
    await client.query(`ALTER TABLE society_facilities ADD COLUMN IF NOT EXISTS rules TEXT;`);
    await client.query(`ALTER TABLE society_facilities ADD COLUMN IF NOT EXISTS society_id TEXT;`);
    // Payment collection details — all optional, only relevant when requires_payment is true
    await client.query(`ALTER TABLE society_facilities ADD COLUMN IF NOT EXISTS payment_qr_url TEXT;`);
    await client.query(`ALTER TABLE society_facilities ADD COLUMN IF NOT EXISTS upi_id TEXT;`);
    await client.query(`ALTER TABLE society_facilities ADD COLUMN IF NOT EXISTS bank_account_number TEXT;`);
    await client.query(`ALTER TABLE society_facilities ADD COLUMN IF NOT EXISTS bank_ifsc_code TEXT;`);
    // Up to 4 admin-defined booking slots (each { startTime, endTime }) replace the
    // single open_time/close_time range. Legacy rows keep their old open_time/close_time
    // values (now nullable) as a fallback until they're next saved through the app,
    // at which point they get migrated into a single-entry slots array (see facilities.ts GET).
    await client.query(`ALTER TABLE society_facilities ADD COLUMN IF NOT EXISTS slots JSONB;`);
    await client.query(`ALTER TABLE society_facilities ALTER COLUMN open_time DROP NOT NULL;`);
    await client.query(`ALTER TABLE society_facilities ALTER COLUMN close_time DROP NOT NULL;`);

    // Bookings
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_bookings (
        id TEXT PRIMARY KEY,
        facility_id TEXT NOT NULL,
        facility_name TEXT,
        resident_name TEXT NOT NULL,
        resident_id TEXT,
        wing TEXT,
        apartment_no TEXT,
        date TEXT NOT NULL,
        time_slot TEXT NOT NULL,
        status TEXT NOT NULL,
        qr_code TEXT NOT NULL,
        is_paid BOOLEAN DEFAULT FALSE,
        amount_paid INT DEFAULT 0,
        payment_ref TEXT,
        society_id TEXT
      );
    `);
    await client.query(`ALTER TABLE society_bookings ADD COLUMN IF NOT EXISTS facility_name TEXT;`);
    await client.query(`ALTER TABLE society_bookings ADD COLUMN IF NOT EXISTS resident_id TEXT;`);
    await client.query(`ALTER TABLE society_bookings ADD COLUMN IF NOT EXISTS wing TEXT;`);
    await client.query(`ALTER TABLE society_bookings ADD COLUMN IF NOT EXISTS apartment_no TEXT;`);
    await client.query(`ALTER TABLE society_bookings ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE;`);
    await client.query(`ALTER TABLE society_bookings ADD COLUMN IF NOT EXISTS amount_paid INT DEFAULT 0;`);
    await client.query(`ALTER TABLE society_bookings ADD COLUMN IF NOT EXISTS payment_ref TEXT;`);
    await client.query(`ALTER TABLE society_bookings ADD COLUMN IF NOT EXISTS society_id TEXT;`);

    // Facility Maintenance & Slot Blocks
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_facility_blocks (
        id TEXT PRIMARY KEY,
        facility_id TEXT NOT NULL,
        facility_name TEXT,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        reason TEXT NOT NULL,
        blocked_by TEXT,
        society_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    await client.query(`ALTER TABLE society_facility_blocks ADD COLUMN IF NOT EXISTS facility_name TEXT;`);
    await client.query(`ALTER TABLE society_facility_blocks ADD COLUMN IF NOT EXISTS society_id TEXT;`);

    // Assets
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_assets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        location TEXT NOT NULL,
        purchase_date TEXT NOT NULL,
        model_no TEXT NOT NULL,
        status TEXT NOT NULL,
        image_url TEXT,
        description TEXT,
        has_warranty BOOLEAN DEFAULT FALSE,
        warranty_pdf_url TEXT,
        society_id TEXT
      );
    `);
    await client.query(`ALTER TABLE society_assets ADD COLUMN IF NOT EXISTS society_id TEXT;`);

    // AMC
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_amc (
        id TEXT PRIMARY KEY,
        asset_id TEXT REFERENCES society_assets(id) ON DELETE SET NULL,
        asset_name TEXT NOT NULL,
        vendor_name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        expiry_date TEXT NOT NULL,
        status TEXT NOT NULL,
        cost NUMERIC NOT NULL,
        contract_pdf_url TEXT,
        contract_pdf_urls JSONB,
        payment_duration TEXT,
        payment_method TEXT,
        last_service_date TEXT,
        category TEXT,
        society_id TEXT
      );
    `);
    await client.query(`ALTER TABLE society_amc ADD COLUMN IF NOT EXISTS society_id TEXT;`);

    await client.query('COMMIT');
    console.log('All foundational tables verified/created.');

    // Create society_storage_files table to persist base64 data for files
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_storage_files (
        id SERIAL PRIMARY KEY,
        bucket TEXT NOT NULL,
        filename TEXT NOT NULL,
        mime_type TEXT,
        content_base64 TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(bucket, filename)
      );
    `);

    // Create Supabase storage bucket for files (pdf/csv)
    try {
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'storage' 
            AND table_name = 'buckets'
          ) THEN
            -- society-documents bucket
            IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'society-documents') THEN
              INSERT INTO storage.buckets (id, name, public) 
              VALUES ('society-documents', 'society-documents', true);
            END IF;
            
            -- documents bucket
            IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documents') THEN
              INSERT INTO storage.buckets (id, name, public) 
              VALUES ('documents', 'documents', true);
            END IF;

            -- assets bucket
            IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'assets') THEN
              INSERT INTO storage.buckets (id, name, public) 
              VALUES ('assets', 'assets', true);
            END IF;

            -- SocietyAssets bucket
            IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'SocietyAssets') THEN
              INSERT INTO storage.buckets (id, name, public) 
              VALUES ('SocietyAssets', 'SocietyAssets', true);
            END IF;

            -- asset bucket
            IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'asset') THEN
              INSERT INTO storage.buckets (id, name, public) 
              VALUES ('asset', 'asset', true);
            END IF;

            -- amc bucket
            IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'amc') THEN
              INSERT INTO storage.buckets (id, name, public) 
              VALUES ('amc', 'amc', true);
            END IF;

            -- Ensure all of the above buckets are public even if they already
            -- existed from an earlier run (the IF NOT EXISTS inserts above
            -- only apply on first creation and won't fix a stale public=false).
            UPDATE storage.buckets SET public = true
            WHERE id IN ('society-documents', 'documents', 'assets', 'SocietyAssets', 'asset', 'amc')
              AND public IS DISTINCT FROM true;
          END IF;
        END $$;
      `);
      console.log('Supabase storage buckets verified/created.');
    } catch (storageErr) {
      console.warn('Could not bootstrap storage buckets (possibly storage schema not present):', storageErr);
    }

    // Device tokens for push notifications (Firebase Cloud Messaging).
    // One resident can have multiple devices (e.g. phone + a second phone),
    // so this is a separate table keyed by uid rather than a column on
    // society_users. token is UNIQUE so re-registering the same device (app
    // reinstall, re-login) updates the existing row instead of duplicating it.
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_device_tokens (
        id TEXT PRIMARY KEY,
        uid TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        platform TEXT DEFAULT 'android',
        society_id TEXT,
        created_at TEXT NOT NULL
      );
    `);

    // Gate / visitor management: a guard (admin login, for now) logs a
    // visitor at the main gate against one specific resident (this society
    // currently allows only one registered owner per flat, so targeting a
    // resident directly is equivalent to targeting "this flat"). The
    // resident approves/denies in real time (see services/realtime.ts +
    // services/pushNotifications.ts). No auto-expiry — an unanswered
    // request just stays 'Pending' and the guard follows up by phone.
    await client.query(`
      CREATE TABLE IF NOT EXISTS society_visitor_requests (
        id TEXT PRIMARY KEY,
        society_id TEXT NOT NULL,
        resident_uid TEXT NOT NULL,
        resident_name TEXT,
        wing TEXT,
        apartment_no TEXT,
        visitor_name TEXT NOT NULL,
        visitor_phone TEXT,
        purpose TEXT,
        photo_url TEXT,
        status TEXT NOT NULL DEFAULT 'Pending',
        created_by TEXT,
        created_by_name TEXT,
        created_at TEXT NOT NULL,
        responded_at TEXT
      );
    `);

    await client.query('COMMIT');
    console.log('PostgreSQL tables bootstrapped and committed successfully.');
  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rbErr) {
        // Rollback error ignored
      }
    }
    console.error('Error bootstrapping tables:', error);
  } finally {
    if (client) {
      try {
        client.release();
      } catch (relErr) {
        // Release error ignored
      }
    }
  }
}
