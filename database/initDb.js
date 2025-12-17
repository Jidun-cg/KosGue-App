const pool = require("../apps/server/config/db");

const createTables = async () => {
  try {
    // 1. Users Table (Sync with Supabase Auth)
    // Menggunakan UUID dari auth.users
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

    // 2. Kos Table (3NF: Removed arrays and owner details)
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Kos Facilities (1NF: Separate table)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kos_facilities (
        id SERIAL PRIMARY KEY,
        kos_id INTEGER REFERENCES kos(id) ON DELETE CASCADE,
        facility VARCHAR(255) NOT NULL
      );
    `);

    // 4. Kos Services (1NF: Separate table)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS kos_services (
        id SERIAL PRIMARY KEY,
        kos_id INTEGER REFERENCES kos(id) ON DELETE CASCADE,
        service VARCHAR(255) NOT NULL
      );
    `);

    // 5. Kos Gallery (1NF: Separate table)
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

    // 7. Trigger for User Creation (Supabase Auth Sync)
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

      // Note: Creating trigger on auth.users usually requires superuser/postgres role.
      // If this fails, you must run it in Supabase SQL Editor.
      await pool.query(`
        DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
        CREATE TRIGGER on_auth_user_created
          AFTER INSERT ON auth.users
          FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
      `);
      console.log("Auth trigger created successfully");
    } catch (triggerError) {
      console.warn(
        "Could not create auth trigger (might need superuser permissions):",
        triggerError.message
      );
      console.log(
        "Please run the trigger SQL manually in Supabase SQL Editor if it doesn't exist."
      );
    }

    console.log("Tables created successfully (3NF Compliant)");
    process.exit(0);
  } catch (error) {
    console.error("Error creating tables:", error);
    process.exit(1);
  }
};

createTables();
