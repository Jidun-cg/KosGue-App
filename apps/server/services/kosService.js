const pool = require("../config/db");

// Helper to normalize facility/service names (Title Case)
// e.g. "ac" -> "Ac", "kamar mandi" -> "Kamar Mandi"
const normalizeString = (str) => {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

// Helper to format kos row
const formatKosRow = (row) => {
  // Prefer specific owner info in kos table, fallback to user profile
  const ownerName = row.owner_name_override || row.owner_name || row.username;
  const ownerPhone = row.owner_phone_override || row.owner_phone;

  let whatsapp = null;

  if (ownerPhone) {
    let cleanPhone = ownerPhone.replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = "62" + cleanPhone.slice(1);
    }
    whatsapp = `https://wa.me/${cleanPhone}`;
  }

  return {
    ...row,
    rating: parseFloat(row.rating || 0).toFixed(1),
    reviews: parseInt(row.reviews || 0),
    owner: {
      name: ownerName,
      phone: ownerPhone,
      email: row.owner_email,
      whatsapp: whatsapp,
    },
    // Remove flat owner fields to keep it clean
    owner_name: undefined,
    owner_phone: undefined,
    owner_email: undefined,
    username: undefined,
    owner_name_override: undefined,
    owner_phone_override: undefined,
  };
};

const getAllKos = async () => {
  const query = `
    SELECT 
      k.*,
      k.owner_name as owner_name_override,
      k.owner_phone as owner_phone_override,
      u.username as owner_name,
      u.phone as owner_phone,
      u.email as owner_email,
      COALESCE((SELECT AVG(rating) FROM reviews r WHERE r.kos_id = k.id), 0) as rating,
      (SELECT COUNT(*) FROM reviews r WHERE r.kos_id = k.id) as reviews,
      ARRAY(SELECT mf.name FROM kos_facilities kf JOIN master_facilities mf ON kf.facility_id = mf.id WHERE kf.kos_id = k.id) as facilities,
      ARRAY(SELECT ms.name FROM kos_services ks JOIN master_services ms ON ks.service_id = ms.id WHERE ks.kos_id = k.id) as services,
      ARRAY(SELECT image_url FROM kos_gallery kg WHERE kg.kos_id = k.id) as gallery
    FROM kos k
    LEFT JOIN users u ON k.owner_id = u.id
  `;
  const result = await pool.query(query);
  return result.rows.map(formatKosRow);
};

const getKosByOwner = async (ownerId) => {
  const query = `
    SELECT 
      k.*,
      k.owner_name as owner_name_override,
      k.owner_phone as owner_phone_override,
      u.username as owner_name,
      u.phone as owner_phone,
      u.email as owner_email,
      COALESCE((SELECT AVG(rating) FROM reviews r WHERE r.kos_id = k.id), 0) as rating,
      (SELECT COUNT(*) FROM reviews r WHERE r.kos_id = k.id) as reviews,
      ARRAY(SELECT mf.name FROM kos_facilities kf JOIN master_facilities mf ON kf.facility_id = mf.id WHERE kf.kos_id = k.id) as facilities,
      ARRAY(SELECT ms.name FROM kos_services ks JOIN master_services ms ON ks.service_id = ms.id WHERE ks.kos_id = k.id) as services,
      ARRAY(SELECT image_url FROM kos_gallery kg WHERE kg.kos_id = k.id) as gallery
    FROM kos k
    LEFT JOIN users u ON k.owner_id = u.id
    WHERE k.owner_id = $1
  `;
  const result = await pool.query(query, [ownerId]);
  return result.rows.map(formatKosRow);
};

const getKosBySlug = async (slug) => {
  const query = `
    SELECT 
      k.*,
      k.owner_name as owner_name_override,
      k.owner_phone as owner_phone_override,
      u.username as owner_name,
      u.phone as owner_phone,
      u.email as owner_email,
      COALESCE((SELECT AVG(rating) FROM reviews r WHERE r.kos_id = k.id), 0) as rating,
      (SELECT COUNT(*) FROM reviews r WHERE r.kos_id = k.id) as reviews,
      ARRAY(SELECT mf.name FROM kos_facilities kf JOIN master_facilities mf ON kf.facility_id = mf.id WHERE kf.kos_id = k.id) as facilities,
      ARRAY(SELECT ms.name FROM kos_services ks JOIN master_services ms ON ks.service_id = ms.id WHERE ks.kos_id = k.id) as services,
      ARRAY(SELECT image_url FROM kos_gallery kg WHERE kg.kos_id = k.id) as gallery
    FROM kos k
    LEFT JOIN users u ON k.owner_id = u.id
    WHERE k.slug = $1
  `;

  const result = await pool.query(query, [slug]);
  if (result.rows.length === 0) return null;

  const kos = formatKosRow(result.rows[0]);

  // Fetch reviews details
  const reviewsResult = await pool.query(
    `SELECT r.*, u.username 
     FROM reviews r 
     JOIN users u ON r.user_id = u.id 
     WHERE r.kos_id = $1 
     ORDER BY r.created_at DESC`,
    [kos.id]
  );

  return {
    ...kos,
    reviewsList: reviewsResult.rows,
  };
};

const createKos = async (data) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const {
      slug,
      name,
      city,
      price,
      image,
      summary,
      description,
      size,
      capacity,
      address,
      latitude,
      longitude,
      owner_id,
      facilities,
      services,
      gallery,
      owner, // Contains name, phone, whatsapp
    } = data;

    // Insert into kos table
    const insertKosQuery = `
      INSERT INTO kos (
        slug, name, city, price, image, summary, description, size, capacity,
        address, latitude, longitude, owner_id, owner_name, owner_phone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `;
    const kosValues = [
      slug,
      name,
      city,
      price,
      image,
      summary,
      description || null,
      size,
      capacity,
      address || null,
      latitude || null,
      longitude || null,
      owner_id,
      owner?.name || null,
      owner?.phone || null,
    ];
    const kosResult = await client.query(insertKosQuery, kosValues);
    const kosId = kosResult.rows[0].id;

    // Insert facilities (Expects array of IDs)
    if (facilities && facilities.length > 0) {
      const facilityIds = facilities
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));
      if (facilityIds.length > 0) {
        await client.query(
          `INSERT INTO kos_facilities (kos_id, facility_id) SELECT $1, unnest($2::int[])`,
          [kosId, facilityIds]
        );
      }
    }

    // Insert services (Expects array of IDs)
    if (services && services.length > 0) {
      const serviceIds = services
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));
      if (serviceIds.length > 0) {
        await client.query(
          `INSERT INTO kos_services (kos_id, service_id) SELECT $1, unnest($2::int[])`,
          [kosId, serviceIds]
        );
      }
    }

    // Insert gallery
    if (gallery && gallery.length > 0) {
      await client.query(
        `INSERT INTO kos_gallery (kos_id, image_url) SELECT $1, unnest($2::text[])`,
        [kosId, gallery]
      );
    }

    await client.query("COMMIT");

    // Return the full object
    return await getKosBySlug(slug);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

const updateKos = async (slug, data) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get Kos ID first
    const kosRes = await client.query("SELECT id FROM kos WHERE slug = $1", [
      slug,
    ]);
    if (kosRes.rows.length === 0) throw new Error("Kos not found");
    const kosId = kosRes.rows[0].id;

    const {
      name,
      city,
      price,
      image,
      summary,
      description,
      size,
      capacity,
      address,
      latitude,
      longitude,
      facilities,
      services,
      gallery,
      owner,
    } = data;

    // Update kos table
    const updateQuery = `
      UPDATE kos SET
        name = $1, city = $2, price = $3, image = $4, summary = $5, description = $6,
        size = $7, capacity = $8, address = $9, latitude = $10, longitude = $11,
        owner_name = $13, owner_phone = $14
      WHERE id = $12
    `;
    const updateValues = [
      name,
      city,
      price,
      image,
      summary,
      description,
      size,
      capacity,
      address,
      latitude,
      longitude,
      kosId,
      owner?.name || null,
      owner?.phone || null,
    ];
    await client.query(updateQuery, updateValues);

    // Update Facilities (Delete all and re-insert)
    await client.query("DELETE FROM kos_facilities WHERE kos_id = $1", [kosId]);
    if (facilities && facilities.length > 0) {
      const facilityIds = facilities
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));
      if (facilityIds.length > 0) {
        await client.query(
          `INSERT INTO kos_facilities (kos_id, facility_id) SELECT $1, unnest($2::int[])`,
          [kosId, facilityIds]
        );
      }
    }

    // Update Services
    await client.query("DELETE FROM kos_services WHERE kos_id = $1", [kosId]);
    if (services && services.length > 0) {
      const serviceIds = services
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id));
      if (serviceIds.length > 0) {
        await client.query(
          `INSERT INTO kos_services (kos_id, service_id) SELECT $1, unnest($2::int[])`,
          [kosId, serviceIds]
        );
      }
    }

    // Update Gallery
    await client.query("DELETE FROM kos_gallery WHERE kos_id = $1", [kosId]);
    if (gallery && gallery.length > 0) {
      await client.query(
        `INSERT INTO kos_gallery (kos_id, image_url) SELECT $1, unnest($2::text[])`,
        [kosId, gallery]
      );
    }

    await client.query("COMMIT");
    return await getKosBySlug(slug);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
};

const deleteKos = async (slug) => {
  const result = await pool.query(
    "DELETE FROM kos WHERE slug = $1 RETURNING *",
    [slug]
  );
  return result.rows[0];
};

const addReview = async (slug, userId, rating, comment) => {
  // Get Kos ID
  const kosRes = await pool.query("SELECT id FROM kos WHERE slug = $1", [slug]);
  if (kosRes.rows.length === 0) throw new Error("Kos not found");
  const kosId = kosRes.rows[0].id;

  await pool.query(
    "INSERT INTO reviews (kos_id, user_id, rating, comment) VALUES ($1, $2, $3, $4)",
    [kosId, userId, rating, comment]
  );

  // Calculate new stats to return
  const statsResult = await pool.query(
    "SELECT COUNT(*) as count, AVG(rating) as average FROM reviews WHERE kos_id = $1",
    [kosId]
  );

  const count = parseInt(statsResult.rows[0].count);
  const average = parseFloat(statsResult.rows[0].average).toFixed(1);

  return { rating: average, reviews: count };
};

const getMasterData = async () => {
  const facilities = await pool.query(
    "SELECT * FROM master_facilities ORDER BY name ASC"
  );
  const services = await pool.query(
    "SELECT * FROM master_services ORDER BY name ASC"
  );
  return {
    facilities: facilities.rows,
    services: services.rows,
  };
};

module.exports = {
  getAllKos,
  getKosByOwner,
  getKosBySlug,
  createKos,
  updateKos,
  deleteKos,
  addReview,
  getMasterData,
};
