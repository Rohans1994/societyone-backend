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

    // Ensure Arkade Earth society exists with id soc-mtb32pfk
    await client.query(`
      INSERT INTO society_societies (id, name, address, city, pincode, wings, admin_email, admin_name, created_at)
      VALUES (
        'soc-mtb32pfk',
        'Arkade Earth',
        'Kanjurmarg East, Near Station',
        'Mumbai',
        '400042',
        '["Wing A", "Wing B", "Wing C", "Wing D"]'::jsonb,
        'super@society.com',
        'Super Admin User',
        '2025-01-15'
      )
      ON CONFLICT (id) DO UPDATE SET
        name = 'Arkade Earth',
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        pincode = EXCLUDED.pincode,
        wings = EXCLUDED.wings;

      UPDATE society_societies SET name = 'Arkade Earth' WHERE id = 'soc-1';
      UPDATE society_societies SET id = 'soc-mtb32pfk' WHERE id = 'soc-arkade-earth' AND NOT EXISTS (SELECT 1 FROM society_societies WHERE id = 'soc-mtb32pfk');
    `);

    // Backfill / Map all tickets, AMC, finance (invoices & transactions), vendors, tendors, assets, events, bookings, fishbowl, users to society_id = 'soc-mtb32pfk'
    await client.query(`
      UPDATE society_tickets SET society_id = 'soc-mtb32pfk' WHERE society_id = 'soc-arkade-earth' OR society_id IS NULL OR society_id = '' OR society_id = 'soc-1';
      UPDATE society_amc SET society_id = 'soc-mtb32pfk' WHERE society_id = 'soc-arkade-earth' OR society_id IS NULL OR society_id = '' OR society_id = 'soc-1';
      UPDATE society_invoices SET society_id = 'soc-mtb32pfk' WHERE society_id = 'soc-arkade-earth' OR society_id IS NULL OR society_id = '' OR society_id = 'soc-1';
      UPDATE society_transactions SET society_id = 'soc-mtb32pfk' WHERE society_id = 'soc-arkade-earth' OR society_id IS NULL OR society_id = '' OR society_id = 'soc-1';
      UPDATE society_vendors SET society_id = 'soc-mtb32pfk' WHERE society_id = 'soc-arkade-earth' OR society_id IS NULL OR society_id = '' OR society_id = 'soc-1';
      UPDATE society_tendors SET society_id = 'soc-mtb32pfk' WHERE society_id = 'soc-arkade-earth' OR society_id IS NULL OR society_id = '' OR society_id = 'soc-1';
      UPDATE society_quotations SET society_id = 'soc-mtb32pfk' WHERE society_id = 'soc-arkade-earth' OR society_id IS NULL OR society_id = '' OR society_id = 'soc-1';
      UPDATE society_assets SET society_id = 'soc-mtb32pfk' WHERE society_id = 'soc-arkade-earth' OR society_id IS NULL OR society_id = '' OR society_id = 'soc-1';
      UPDATE society_events SET society_id = 'soc-mtb32pfk' WHERE society_id = 'soc-arkade-earth' OR society_id IS NULL OR society_id = '' OR society_id = 'soc-1';
      UPDATE society_fishbowl SET society_id = 'soc-mtb32pfk' WHERE society_id = 'soc-arkade-earth' OR society_id IS NULL OR society_id = '' OR society_id = 'soc-1';
      UPDATE society_bookings SET society_id = 'soc-mtb32pfk' WHERE society_id = 'soc-arkade-earth' OR society_id IS NULL OR society_id = '' OR society_id = 'soc-1';
      UPDATE society_users SET society_id = 'soc-mtb32pfk', society_name = 'Arkade Earth' 
      WHERE society_id = 'soc-arkade-earth' OR society_id = 'soc-1' OR society_name = 'Grand Imperial Heights' OR society_id IS NULL OR society_id = '' OR email IN ('super@society.com', 'admin@society.com', 'resident@society.com', 'admin@arkade.com');
    `);

    await client.query('COMMIT');
    console.log('All foundational tables verified/created and mapped to Arkade Earth (soc-mtb32pfk).');

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

    // Seed database
    await seedDatabase(client);

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

// Seeding logic
async function seedDatabase(client: any) {
  // Societies
  const societyCheck = await client.query('SELECT COUNT(*) FROM society_societies');
  if (parseInt(societyCheck.rows[0].count) === 0) {
    console.log('Seeding initial societies in Supabase PostgreSQL...');
    const initialSocieties = [
      [
        'soc-mtb32pfk',
        'Arkade Earth',
        'Kanjurmarg East, Near Station',
        'Mumbai',
        '400042',
        JSON.stringify(['Wing A', 'Wing B', 'Wing C', 'Wing D']),
        'super@society.com',
        'Super Admin User',
        '2025-01-15'
      ],
      [
        'soc-2',
        'Silver Oak Palms Residency',
        'Survey 18/2, Green Valley Boulevard',
        'Pune',
        '411045',
        JSON.stringify(['Tower 1', 'Tower 2', 'Tower 3']),
        'admin@silveroak.com',
        'Ramesh Kulkarni',
        '2025-02-10'
      ]
    ];
    for (const s of initialSocieties) {
      await client.query(
        `INSERT INTO society_societies (id, name, address, city, pincode, wings, admin_email, admin_name, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         ON CONFLICT (id) DO NOTHING`,
        s
      );
    }
  }

  // Users
  const userCheck = await client.query('SELECT COUNT(*) FROM society_users');
  if (parseInt(userCheck.rows[0].count) === 0) {
    console.log('Seeding initial users in Supabase PostgreSQL...');
    const users = [
      ['u1', 'Super Admin User', 'super@society.com', '9876543210', 'SuperAdmin', 'Wing A', '101', 'https://picsum.photos/id/64/200/200', 'password123', 'soc-mtb32pfk', 'Arkade Earth'],
      ['u2', 'Admin User', 'admin@society.com', '9876543211', 'WingAdmin', 'Wing B', '202', 'https://picsum.photos/id/65/200/200', 'password123', 'soc-mtb32pfk', 'Arkade Earth'],
      ['u3', 'Resident User', 'resident@society.com', '9876543212', 'Resident', 'Wing C', '305', 'https://picsum.photos/id/91/200/200', 'password123', 'soc-mtb32pfk', 'Arkade Earth'],
      ['u4', 'Ramesh Kulkarni (Admin)', 'admin@silveroak.com', '9876543213', 'SuperAdmin', 'Tower 1', 'PH-01', 'https://picsum.photos/id/68/200/200', 'password123', 'soc-2', 'Silver Oak Palms Residency']
    ];
    for (const u of users) {
      await client.query(
        `INSERT INTO society_users (uid, name, email, phone, role, wing, apartment_no, avatar_url, password, society_id, society_name) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (uid) DO UPDATE SET 
           society_id = EXCLUDED.society_id, 
           society_name = EXCLUDED.society_name`,
        u
      );
    }
  } else {
    // Backfill any existing users that have NULL or empty society_id
    await client.query(`
      UPDATE society_users 
      SET society_id = 'soc-mtb32pfk', society_name = 'Arkade Earth' 
      WHERE (society_id IS NULL OR society_id = '' OR society_id = 'soc-1' OR society_id = 'soc-arkade-earth' OR society_name = 'Grand Imperial Heights') AND (uid IN ('u1', 'u2', 'u3') OR email LIKE '%@society.com' OR email = 'admin@arkade.com');
      
      UPDATE society_users 
      SET society_id = 'soc-2', society_name = 'Silver Oak Palms Residency' 
      WHERE (society_id IS NULL OR society_id = '') AND (uid = 'u4' OR email = 'admin@silveroak.com');

      UPDATE society_users 
      SET society_id = 'soc-mtb32pfk', society_name = 'Arkade Earth' 
      WHERE society_id IS NULL OR society_id = '' OR society_id = 'soc-arkade-earth';
    `);
  }

  // Vendors
  const vendorCheck = await client.query('SELECT COUNT(*) FROM society_vendors');
  if (parseInt(vendorCheck.rows[0].count) === 0) {
    console.log('Seeding initial vendors...');
    const vendors = [
      ['v1', 'CoolAir Systems', 'HVAC', 'Rajesh Kumar', '9876543210', 'rajesh@coolair.com', 'Active', 'soc-mtb32pfk'],
      ['v2', 'Mario Plumbers', 'Plumbing', 'Mario', '9898989898', 'service@mario.com', 'Active', 'soc-mtb32pfk'],
      ['v3', 'SecureGuard Pvt Ltd', 'Security', 'Vikram Singh', '9123456780', 'vikram@secureguard.com', 'Active', 'soc-mtb32pfk']
    ];
    for (const v of vendors) {
      await client.query(
        'INSERT INTO society_vendors (id, name, service_category, contact_person, phone, email, status, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        v
      );
    }
  }

  // Tendors
  const tendorsCheck = await client.query('SELECT COUNT(*) FROM society_tendors');
  if (parseInt(tendorsCheck.rows[0].count) === 0) {
    console.log('Seeding initial tendors & quotations...');
    const tendors = [
      ['tendor-1', 'Monsoon Terrace Waterproofing', 'Comprehensive waterproofing and leak repair solution across blocks A, B, and C terraces prior to monsoon season.', 'soc-mtb32pfk'],
      ['tendor-2', 'CCTV Security System Upgrade', 'Procurement and installation of 24 new outdoor 4K night-vision IP cameras around the main boundary wall and basement parking.', 'soc-mtb32pfk']
    ];
    for (const t of tendors) {
      await client.query('INSERT INTO society_tendors (id, name, description, society_id) VALUES ($1, $2, $3, $4)', t);
    }

    const quotations = [
      ['tendor-1', 'v2', 'Mario Plumbers', 95000, null, null, 'soc-mtb32pfk'],
      ['tendor-1', 'v1', 'CoolAir Systems', 125000, null, null, 'soc-mtb32pfk'],
      ['tendor-2', 'v3', 'SecureGuard Pvt Ltd', 220000, null, null, 'soc-mtb32pfk']
    ];
    for (const q of quotations) {
      await client.query('INSERT INTO society_quotations (tendor_id, vendor_id, vendor_name, quotation, pdf_url, pdf_name, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', q);
    }
  }

  // Invoices
  const invoiceCheck = await client.query('SELECT COUNT(*) FROM society_invoices');
  if (parseInt(invoiceCheck.rows[0].count) === 0) {
    console.log('Seeding initial invoices...');
    const invoices = [
      ['inv1', 'John Doe', 1500, new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0], 'Paid', 'Maintenance', 'October Maintenance dues.', 'soc-mtb32pfk'],
      ['inv2', 'Sarah Smith', 1500, new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0], 'Unpaid', 'Maintenance', 'October Maintenance dues.', 'soc-mtb32pfk'],
      ['inv3', 'Mike Ross', 450, new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0], 'Overdue', 'Utility', 'Water charge shortfall.', 'soc-mtb32pfk']
    ];
    for (const inv of invoices) {
      await client.query(
        'INSERT INTO society_invoices (id, resident_name, amount, due_date, status, type, description, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        inv
      );
    }
  }

  // Transactions
  const txCheck = await client.query('SELECT COUNT(*) FROM society_transactions');
  if (parseInt(txCheck.rows[0].count) === 0) {
    console.log('Seeding initial transactions...');
    const txs = [
      ['tx1', 'October Maintenance Collection', 150000, 'Income', 'Maintenance', new Date(Date.now() - 20 * 86400000).toISOString().split('T')[0], 'soc-mtb32pfk'],
      ['tx2', 'Security Agency Payment', 45000, 'Expense', 'Salaries', new Date(Date.now() - 25 * 86400000).toISOString().split('T')[0], 'soc-mtb32pfk'],
      ['tx3', 'Diwali Decoration', 12000, 'Expense', 'Events', new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0], 'soc-mtb32pfk'],
      ['tx4', 'Clubhouse Booking', 5000, 'Income', 'Facility', new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0], 'soc-mtb32pfk'],
      ['tx5', 'November Maintenance Collection', 100000, 'Income', 'Maintenance', new Date().toISOString().split('T')[0], 'soc-mtb32pfk']
    ];
    for (const tx of txs) {
      await client.query(
        'INSERT INTO society_transactions (id, title, amount, type, category, date, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        tx
      );
    }
  }

  // Tickets
  const ticketCheck = await client.query('SELECT COUNT(*) FROM society_tickets');
  if (parseInt(ticketCheck.rows[0].count) === 0) {
    console.log('Seeding initial tickets...');
    const tickets = [
      ['t1', 'Leaking pipe in Lobby A', 'There is a significant water leakage near the mailbox area.', 'Plumbing', 'High', 'In Progress', 'Mario Plumbers', 'u3', 'Resident User', 'C', '305', new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0], JSON.stringify([]), 'Vendor has inspected the site. Parts ordered.', 'soc-mtb32pfk'],
      ['t2', 'Street light flickering', 'The lamp post near the main gate is flickering constantly.', 'Electrical', 'Medium', 'Open', null, 'u1', 'Super Admin User', 'A', '101', new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0], JSON.stringify([]), null, 'soc-mtb32pfk'],
      ['t3', 'Gym AC not cooling', 'The AC unit in the cardio section is blowing warm air.', 'Other', 'Low', 'Resolved', null, 'u3', 'Resident User', 'C', '305', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0], JSON.stringify([]), 'Gas refilled and filter cleaned. Working fine now.', 'soc-mtb32pfk']
    ];
    for (const ticket of tickets) {
      await client.query(
        'INSERT INTO society_tickets (id, title, description, category, priority, status, assigned_to, created_by, created_by_name, wing, apartment_no, date_created, attachments, progress_update, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
        ticket
      );
    }
  }

  // Events
  const eventCheck = await client.query('SELECT COUNT(*) FROM society_events');
  if (parseInt(eventCheck.rows[0].count) === 0) {
    console.log('Seeding initial events...');
    const events = [
      ['e1', 'Diwali Celebration', new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0], '18:00', 'Clubhouse', 'Grand celebration with dinner and music.', 'Cultural Committee', 'soc-mtb32pfk'],
      ['e2', 'AGM Meeting', new Date(Date.now() + 20 * 86400000).toISOString().split('T')[0], '10:00', 'Banquet Hall', 'Annual General Meeting for all society members.', 'Managing Committee', 'soc-mtb32pfk']
    ];
    for (const e of events) {
      await client.query(
        'INSERT INTO society_events (id, title, date, time, location, description, organizer, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        e
      );
    }
  }

  // Notices
  const noticeCheck = await client.query('SELECT COUNT(*) FROM society_notices');
  if (parseInt(noticeCheck.rows[0].count) === 0) {
    console.log('Seeding initial notices...');
    const notices = [
      ['notif-1', 'Diwali Celebration & Grand Dinner', 'Join us for the grand Diwali celebration at the Clubhouse this Saturday at 6:00 PM. Delicious dinner and cultural programs arranged.', 'Celebration', new Date(Date.now() - 1 * 86400000).toISOString().split('T')[0], 'High', 'u1', 'Managing Committee', 'soc-mtb32pfk'],
      ['notif-2', 'Elevator Maintenance - Wing A', 'Elevator #2 in Wing A will be down for scheduled safety inspection and lubrication from 10:00 AM to 2:00 PM.', 'Maintenance', new Date().toISOString().split('T')[0], 'Normal', 'u1', 'Facility Manager', 'soc-mtb32pfk'],
      ['notif-3', 'Quarterly Water Tank Cleaning', 'Water supply will be restricted on Thursday between 1:00 PM and 4:00 PM due to automated overhead tank cleaning.', 'Maintenance', new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0], 'Normal', 'u1', 'Maintenance Desk', 'soc-mtb32pfk']
    ];
    for (const n of notices) {
      await client.query(
        'INSERT INTO society_notices (id, title, description, category, date, priority, created_by, created_by_name, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        n
      );
    }
  }

  // Fishbowl
  const messageCheck = await client.query('SELECT COUNT(*) FROM society_fishbowl');
  if (parseInt(messageCheck.rows[0].count) === 0) {
    console.log('Seeding initial messages...');
    const msgs = [
      ['m1', 'The new gym equipment is amazing! Thanks committee.', '2 hours ago', 'u3', 'Resident User', 'C', '305', false, null, 'soc-mtb32pfk'],
      ['m2', 'Does anyone know why the park lights are off since yesterday?', '4 hours ago', 'u3', 'Resident User', 'C', '305', false, null, 'soc-mtb32pfk'],
      ['m3', 'Looking forward to the Diwali party! Hope the catering is better this year.', 'Yesterday', 'u4', 'Elena Rodriguez', 'D', '402', false, null, 'soc-mtb32pfk']
    ];
    for (const m of msgs) {
      await client.query(
        'INSERT INTO society_fishbowl (id, text, timestamp, user_id, user_name, wing, apartment_no, is_deleted, reply_to_id, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        m
      );
    }
  }

  // Facilities / Amenities
  const facilityCheck = await client.query('SELECT COUNT(*) FROM society_facilities');
  if (parseInt(facilityCheck.rows[0].count) === 0) {
    console.log('Seeding initial amenities/facilities...');
    const defaultFacilities = [
      [
        'f1',
        'Grand Fitness Gym',
        'State-of-the-art gym equipped with treadmills, cross-trainers, free weights, and stretching zones.',
        25,
        '06:00',
        '22:00',
        'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=60',
        JSON.stringify(['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&auto=format&fit=crop&q=60']),
        true,
        false,
        0,
        'Clean workout gear and sports shoes required. Please sanitize equipment after use.',
        'soc-mtb32pfk'
      ],
      [
        'f2',
        'Infinity Swimming Pool',
        'Crystal-clear heated pool with dedicated swimming lanes and poolside lounge chairs.',
        15,
        '07:00',
        '20:00',
        'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=800&auto=format&fit=crop&q=60',
        JSON.stringify(['https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?w=800&auto=format&fit=crop&q=60']),
        true,
        true,
        150,
        'Nylon swimwear and swimming caps mandatory. Shower before entering.',
        'soc-mtb32pfk'
      ],
      [
        'f3',
        'Banquet & Community Hall',
        'Spacious air-conditioned banquet hall with projector, stage, surround sound, and buffet setup.',
        100,
        '10:00',
        '23:00',
        'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&auto=format&fit=crop&q=60',
        JSON.stringify(['https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&auto=format&fit=crop&q=60']),
        true,
        true,
        2500,
        'Booking subject to management guidelines. Sound limits apply after 10:00 PM.',
        'soc-mtb32pfk'
      ],
      [
        'f4',
        'Indoor Badminton Court',
        'Standard synthetic wooden court with professional LED glare-free lighting.',
        6,
        '06:00',
        '22:00',
        'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&auto=format&fit=crop&q=60',
        JSON.stringify(['https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800&auto=format&fit=crop&q=60']),
        true,
        false,
        0,
        'Non-marking badminton shoes mandatory.',
        'soc-mtb32pfk'
      ],
      [
        'f5',
        'Children\'s Play Park & Gazebo',
        'Lush green landscape garden featuring swings, slides, outdoor seating, and reflexology walking track.',
        40,
        '06:00',
        '21:00',
        'https://images.unsplash.com/photo-1588718704337-4044749b556a?w=800&auto=format&fit=crop&q=60',
        JSON.stringify(['https://images.unsplash.com/photo-1588718704337-4044749b556a?w=800&auto=format&fit=crop&q=60']),
        false,
        false,
        0,
        'Open access for all society residents and children. Please keep the park clean.',
        'soc-mtb32pfk'
      ]
    ];

    for (const facility of defaultFacilities) {
      await client.query(
        `INSERT INTO society_facilities (id, name, description, capacity, open_time, close_time, image_url, images, can_book, requires_payment, price, rules, society_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        facility
      );
    }
  }

  // Bookings
  const bookingCheck = await client.query('SELECT COUNT(*) FROM society_bookings');
  if (parseInt(bookingCheck.rows[0].count) === 0) {
    console.log('Seeding initial bookings...');
    const b = ['b1', 'f1', 'Grand Fitness Gym', 'Alex Sterling', 'u3', 'Wing C', '305', new Date(Date.now() + 1 * 86400000).toISOString().split('T')[0], '18:00 - 19:00', 'Confirmed', 'QR_DATA_123', false, 0, null, 'soc-mtb32pfk'];
    await client.query(
      'INSERT INTO society_bookings (id, facility_id, facility_name, resident_name, resident_id, wing, apartment_no, date, time_slot, status, qr_code, is_paid, amount_paid, payment_ref, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
      b
    );
  }

  // Facility Blocks (Maintenance / Closures)
  const blockCheck = await client.query('SELECT COUNT(*) FROM society_facility_blocks');
  if (parseInt(blockCheck.rows[0].count) === 0) {
    console.log('Seeding initial facility blocks...');
    const fb = [
      'blk-1',
      'f2',
      'Infinity Swimming Pool',
      new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
      '10:00',
      '14:00',
      'Routine chemical filtration & deep pool chlorination',
      'Super Admin User',
      'soc-mtb32pfk',
      new Date().toISOString()
    ];
    await client.query(
      'INSERT INTO society_facility_blocks (id, facility_id, facility_name, date, start_time, end_time, reason, blocked_by, society_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      fb
    );
  }

  // Assets
  const assetCheck = await client.query('SELECT COUNT(*) FROM society_assets');
  if (parseInt(assetCheck.rows[0].count) === 0) {
    console.log('Seeding initial assets...');
    const assets = [
      ['a1', 'Clubhouse HVAC', 'HVAC', 'Clubhouse Roof', new Date(Date.now() - 600 * 86400000).toISOString().split('T')[0], 'TRANE-XR14', 'Operational', null, null, false, null, 'soc-mtb32pfk'],
      ['a2', 'Elevator A', 'Lift', 'Wing A', new Date(Date.now() - 1000 * 86400000).toISOString().split('T')[0], 'OTIS-GEN2', 'Operational', null, null, false, null, 'soc-mtb32pfk'],
      ['a3', 'Swimming Pool Pump', 'Pump', 'Pool Area', new Date(Date.now() - 800 * 86400000).toISOString().split('T')[0], 'HAYWARD-SP3200', 'Down', null, null, false, null, 'soc-mtb32pfk'],
      ['a4', 'Main Gate Barrier', 'Security', 'Main Entrance', new Date(Date.now() - 200 * 86400000).toISOString().split('T')[0], 'CAME-G4000', 'Operational', null, null, false, null, 'soc-mtb32pfk']
    ];
    for (const asset of assets) {
      await client.query(
        'INSERT INTO society_assets (id, name, category, location, purchase_date, model_no, status, image_url, description, has_warranty, warranty_pdf_url, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
        asset
      );
    }
  }

  // AMC
  const amcCheck = await client.query('SELECT COUNT(*) FROM society_amc');
  if (parseInt(amcCheck.rows[0].count) === 0) {
    console.log('Seeding initial AMCs...');
    const amcs = [
      ['1', 'a1', 'Clubhouse HVAC', 'CoolAir Systems', new Date(Date.now() - 300 * 86400000).toISOString().split('T')[0], new Date(Date.now() + 65 * 86400000).toISOString().split('T')[0], 'Active', 12000, null, null, null, null, null, null, 'soc-mtb32pfk'],
      ['2', 'a2', 'Elevator A', 'Otis Maintain', new Date(Date.now() - 150 * 86400000).toISOString().split('T')[0], new Date(Date.now() + 215 * 86400000).toISOString().split('T')[0], 'Active', 25000, null, null, null, null, null, null, 'soc-mtb32pfk'],
      ['3', 'a3', 'Swimming Pool Pump', 'AquaClean', new Date(Date.now() - 400 * 86400000).toISOString().split('T')[0], new Date(Date.now() - 35 * 86400000).toISOString().split('T')[0], 'Expired', 5000, null, null, null, null, null, null, 'soc-mtb32pfk'],
      ['4', 'a4', 'Main Gate Barrier', 'SecureGuard Pvt Ltd', new Date(Date.now() - 340 * 86400000).toISOString().split('T')[0], new Date(Date.now() + 25 * 86400000).toISOString().split('T')[0], 'Expiring Soon', 8000, null, null, null, null, null, null, 'soc-mtb32pfk']
    ];
    for (const amc of amcs) {
      await client.query(
        'INSERT INTO society_amc (id, asset_id, asset_name, vendor_name, start_date, expiry_date, status, cost, contract_pdf_url, contract_pdf_urls, payment_duration, payment_method, last_service_date, category, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
        amc
      );
    }
  }
}
