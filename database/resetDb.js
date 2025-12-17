const pool = require("../apps/server/config/db");

const resetDb = async () => {
  try {
    console.log("⚠️  WARNING: This will delete all data in the database!");
    console.log("Dropping existing tables...");

    // Drop tables in correct order (child first, then parent)
    await pool.query("DROP TABLE IF EXISTS reviews CASCADE");
    await pool.query("DROP TABLE IF EXISTS kos_gallery CASCADE");
    await pool.query("DROP TABLE IF EXISTS kos_facilities CASCADE");
    await pool.query("DROP TABLE IF EXISTS kos_services CASCADE");
    await pool.query("DROP TABLE IF EXISTS master_facilities CASCADE");
    await pool.query("DROP TABLE IF EXISTS master_services CASCADE");
    await pool.query("DROP TABLE IF EXISTS kos CASCADE");
    await pool.query("DROP TABLE IF EXISTS users CASCADE");

    console.log("✅ Tables dropped successfully.");
    console.log("Creating new tables...");

    // 1. Users Table (Sync with Supabase Auth)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        username VARCHAR(255),
        email VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Sync existing users from auth.users to public.users
    console.log("Syncing users from auth.users...");
    await pool.query(`
      INSERT INTO public.users (id, email, username, role, phone)
      SELECT 
        id, 
        email, 
        COALESCE(raw_user_meta_data->>'username', email) as username,
        COALESCE(raw_user_meta_data->>'role', 'user') as role,
        raw_user_meta_data->>'phone' as phone
      FROM auth.users
      ON CONFLICT (id) DO NOTHING;
    `);

    // 2. Kos Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kos (
        id SERIAL PRIMARY KEY,
        owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
        slug VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        city VARCHAR(255) NOT NULL,
        price VARCHAR(255) NOT NULL,
        image TEXT NOT NULL,
        summary TEXT,
        description TEXT,
        size VARCHAR(100),
        capacity VARCHAR(100),
        address TEXT,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        owner_name VARCHAR(255),
        owner_phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Master Facilities (New)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS master_facilities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL
      );
    `);

    // Seed Master Facilities
    await pool.query(`
      INSERT INTO master_facilities (name) VALUES 
      ('AC'), ('Wi-Fi'), ('Kamar Mandi Dalam'), ('Kasur'), ('Lemari'), 
      ('Meja Belajar'), ('Kursi'), ('Ventilasi'), ('Jendela'), ('Cermin'),
      ('TV'), ('Water Heater')
      ON CONFLICT DO NOTHING;
    `);

    // 4. Master Services (New)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS master_services (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL
      );
    `);

    // Seed Master Services
    await pool.query(`
      INSERT INTO master_services (name) VALUES 
      ('Laundry'), ('Cleaning Service'), ('Penjaga 24 Jam'), ('Parkir Motor'), 
      ('Parkir Mobil'), ('CCTV'), ('Dapur Umum'), ('Ruang Tamu'), 
      ('Dispenser Air'), ('Kulkas Umum'), ('Akses 24 Jam')
      ON CONFLICT DO NOTHING;
    `);

    // 5. Kos Facilities (Updated to use FK)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kos_facilities (
        id SERIAL PRIMARY KEY,
        kos_id INTEGER REFERENCES kos(id) ON DELETE CASCADE,
        facility_id INTEGER REFERENCES master_facilities(id) ON DELETE CASCADE,
        UNIQUE(kos_id, facility_id)
      );
    `);

    // 6. Kos Services (Updated to use FK)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kos_services (
        id SERIAL PRIMARY KEY,
        kos_id INTEGER REFERENCES kos(id) ON DELETE CASCADE,
        service_id INTEGER REFERENCES master_services(id) ON DELETE CASCADE,
        UNIQUE(kos_id, service_id)
      );
    `);

    // 5. Kos Gallery
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kos_gallery (
        id SERIAL PRIMARY KEY,
        kos_id INTEGER REFERENCES kos(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL
      );
    `);

    // 6. Reviews Table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        kos_id INTEGER REFERENCES kos(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 7. Trigger for User Creation
    try {
      await pool.query(`
        CREATE OR REPLACE FUNCTION public.handle_new_user()
        RETURNS trigger AS $$
        BEGIN
          INSERT INTO public.users (id, email, username, role)
          VALUES (new.id, new.email, new.raw_user_meta_data->>'username', COALESCE(new.raw_user_meta_data->>'role', 'user'))
          ON CONFLICT (id) DO NOTHING;
          RETURN new;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER;
      `);

      await pool.query(`
        DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
        CREATE TRIGGER on_auth_user_created
          AFTER INSERT ON auth.users
          FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
      `);
      console.log("✅ Auth trigger created successfully");
    } catch (triggerError) {
      console.warn(
        "⚠️ Could not create auth trigger (might need superuser permissions):",
        triggerError.message
      );
    }

    // 8. Sync Existing Users (Backfill)
    // Mengembalikan data user yang sudah ada di Supabase Auth ke tabel public.users
    console.log("🔄 Syncing existing users from Supabase Auth...");
    await pool.query(`
      INSERT INTO public.users (id, email, username, role)
      SELECT 
        id, 
        email, 
        raw_user_meta_data->>'username', 
        COALESCE(raw_user_meta_data->>'role', 'user')
      FROM auth.users
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log("✅ Existing users synced successfully");

    console.log(
      "✅ Database reset and initialized successfully (3NF Compliant)"
    );
    process.exit(0);
  } catch (error) {
    console.error("❌ Error resetting database:", error);
    process.exit(1);
  }
};

resetDb();
