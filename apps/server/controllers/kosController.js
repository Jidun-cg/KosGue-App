const kosService = require("../services/kosService");

const getAllKos = async (req, res) => {
  try {
    const kosList = await kosService.getAllKos();
    res.json(kosList);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getOwnerKos = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const kosList = await kosService.getKosByOwner(ownerId);
    res.json(kosList);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getKosBySlug = async (req, res) => {
  const { slug } = req.params;
  try {
    const kos = await kosService.getKosBySlug(slug);
    if (!kos) {
      return res.status(404).json({ message: "Kos not found" });
    }
    res.json(kos);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const supabase = require("../config/supabase");

const uploadToSupabase = async (file) => {
  try {
    const timestamp = Date.now();
    const fileName = `${timestamp}-${file.originalname.replace(/\s/g, "_")}`;

    console.log("Uploading to Supabase:", fileName);

    const { data, error } = await supabase.storage
      .from("foto-kos") // Pastikan nama bucket sesuai
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
      });

    if (error) {
      console.error("Supabase Upload Error:", error);
      throw new Error(`Supabase Upload Failed: ${error.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("foto-kos")
      .getPublicUrl(fileName);

    console.log("Upload success, URL:", publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
  } catch (err) {
    console.error("Unexpected error in uploadToSupabase:", err);
    throw err;
  }
};

const processKosData = async (req) => {
  let imageUrl = req.body.image;

  // Handle existing gallery (passed as array of strings or single string)
  let galleryUrls = req.body.gallery || [];
  if (!Array.isArray(galleryUrls)) {
    galleryUrls = galleryUrls ? [galleryUrls] : [];
  }

  // Handle Main Image Upload
  if (req.files && req.files["image"]) {
    imageUrl = await uploadToSupabase(req.files["image"][0]);
  }

  // Handle New Gallery Uploads
  if (req.files && req.files["gallery"]) {
    const galleryUploadPromises = req.files["gallery"].map((file) =>
      uploadToSupabase(file)
    );
    const newGalleryUrls = await Promise.all(galleryUploadPromises);
    galleryUrls = [...galleryUrls, ...newGalleryUrls];
  }

  // Parse arrays and objects from FormData keys
  const facilities = req.body.facilities || req.body["facilities[]"];
  const services = req.body.services || req.body["services[]"];

  const owner = {
    name:
      req.body.owner?.name || req.body["owner[name]"] || req.body.owner_name,
    phone:
      req.body.owner?.phone || req.body["owner[phone]"] || req.body.owner_phone,
    whatsapp:
      req.body.owner?.whatsapp ||
      req.body["owner[whatsapp]"] ||
      req.body.owner_whatsapp,
  };

  return {
    ...req.body,
    image: imageUrl,
    gallery: galleryUrls,
    facilities: Array.isArray(facilities)
      ? facilities
      : facilities
      ? [facilities]
      : [],
    services: Array.isArray(services) ? services : services ? [services] : [],
    owner: owner,
    latitude: req.body.latitude ? parseFloat(req.body.latitude) : null,
    longitude: req.body.longitude ? parseFloat(req.body.longitude) : null,
  };
};

const createKos = async (req, res) => {
  try {
    console.log("Received createKos request");
    console.log("Body:", req.body);
    console.log("Files:", req.files);

    const kosData = await processKosData(req);

    // Add owner_id from authenticated user
    if (req.user && req.user.id) {
      kosData.owner_id = req.user.id;
    }

    console.log("Saving to DB:", kosData);

    const newKos = await kosService.createKos(kosData);
    res.status(201).json(newKos);
  } catch (error) {
    console.error("Error creating kos:", error);
    res.status(500).json({ message: error.message });
  }
};

const updateKos = async (req, res) => {
  const { slug } = req.params;
  try {
    // Check ownership
    const existingKos = await kosService.getKosBySlug(slug);
    if (!existingKos) {
      return res.status(404).json({ message: "Kos not found" });
    }

    if (req.user.role !== "admin" && existingKos.owner_id !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Unauthorized to update this kos" });
    }

    const kosData = await processKosData(req);

    const updatedKos = await kosService.updateKos(slug, kosData);
    if (!updatedKos) {
      return res.status(404).json({ message: "Kos not found" });
    }
    res.json(updatedKos);
  } catch (error) {
    console.error("Error updating kos:", error);
    res.status(400).json({ message: error.message });
  }
};

const deleteKos = async (req, res) => {
  const { slug } = req.params;
  try {
    // Check ownership
    const existingKos = await kosService.getKosBySlug(slug);
    if (!existingKos) {
      return res.status(404).json({ message: "Kos not found" });
    }

    if (req.user.role !== "admin" && existingKos.owner_id !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Unauthorized to delete this kos" });
    }

    const deletedKos = await kosService.deleteKos(slug);
    if (!deletedKos) {
      return res.status(404).json({ message: "Kos not found" });
    }
    res.json({ message: "Kos deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const addReview = async (req, res) => {
  const { slug } = req.params;
  const { rating, comment } = req.body;
  const userId = req.user.id;

  try {
    const result = await kosService.addReview(slug, userId, rating, comment);
    res.status(201).json(result);
  } catch (error) {
    console.error("Error adding review:", error);
    res.status(500).json({ message: error.message });
  }
};

const getMasterData = async (req, res) => {
  try {
    const data = await kosService.getMasterData();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAllKos,
  getOwnerKos,
  getKosBySlug,
  createKos,
  updateKos,
  deleteKos,
  addReview,
  getMasterData,
};
