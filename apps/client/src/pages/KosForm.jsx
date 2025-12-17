import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  createKos,
  getKosBySlug,
  updateKos,
  getMasterData,
} from "../services/api";
import { CITIES } from "../utils/constants";
import { showSuccess, showError } from "../utils/sweetAlert";
import { compressImage } from "../utils/imageCompression";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix for default marker icon
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

function LocationMarker({ position, setPosition }) {
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
    },
  });

  return position ? <Marker position={position} /> : null;
}

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 13);
    }
  }, [center, map]);
  return null;
}

function KosForm() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const isEdit = !!slug;
  const [userRole, setUserRole] = useState("");

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("user"));
    if (user) {
      setUserRole(user.role);
    }
  }, []);

  const [formData, setFormData] = useState({
    slug: "",
    name: "",
    city: "",
    price: "",
    image: "",
    gallery: [], // Existing gallery URLs
    summary: "",
    width: "",
    length: "",
    capacity: "",
    facilities: [], // Changed to array of IDs
    services: [], // Changed to array of IDs
    owner_name: "",
    owner_phone: "",
    owner_whatsapp: "",
  });

  const [masterData, setMasterData] = useState({
    facilities: [],
    services: [],
  });
  const [newGalleryFiles, setNewGalleryFiles] = useState([]); // New files to upload
  const [position, setPosition] = useState(null);
  const [mapCenter, setMapCenter] = useState([-6.2, 106.816666]); // Default Jakarta
  const [isCompressing, setIsCompressing] = useState(false);

  useEffect(() => {
    fetchMasterData();
    if (isEdit) {
      fetchData();
    }
  }, [slug]);

  const fetchMasterData = async () => {
    try {
      const data = await getMasterData();
      setMasterData(data);
    } catch (error) {
      console.error("Failed to fetch master data:", error);
    }
  };

  // Auto-generate slug from name
  useEffect(() => {
    if (!isEdit && formData.name) {
      const generatedSlug =
        formData.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "") +
        "-" +
        Date.now().toString().slice(-4);
      setFormData((prev) => ({ ...prev, slug: generatedSlug }));
    }
  }, [formData.name, isEdit]);

  const fetchData = async () => {
    try {
      const data = await getKosBySlug(slug);

      // Parse size "3 x 4 M" -> width=3, length=4
      let width = "";
      let length = "";
      if (data.size) {
        const match = data.size.match(/(\d+)\s*x\s*(\d+)/);
        if (match) {
          width = match[1];
          length = match[2];
        }
      }

      // Parse price "Rp 300.000 / bulan" -> 300000
      let price = data.price;
      if (typeof price === "string") {
        price = price.replace(/\D/g, "");
      }

      // Parse capacity "2 orang" -> 2
      let capacity = data.capacity;
      if (typeof capacity === "string") {
        capacity = capacity.replace(/\D/g, "");
      }

      setFormData({
        ...data,
        price: price,
        width: width,
        length: length,
        capacity: capacity,
        facilities: data.facilities?.join(", ") || "",
        services: data.services?.join(", ") || "",
        gallery: data.gallery || [],
        owner_name: data.owner?.name || "",
        owner_phone: data.owner?.phone || "",
        owner_whatsapp: data.owner?.whatsapp || "",
      });

      if (data.latitude && data.longitude) {
        const pos = {
          lat: parseFloat(data.latitude),
          lng: parseFloat(data.longitude),
        };
        setPosition(pos);
        setMapCenter([pos.lat, pos.lng]);
      }
    } catch (error) {
      console.error("Error fetching kos:", error);
    }
  };

  const handleCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const pos = { lat: latitude, lng: longitude };
          setPosition(pos);
          setMapCenter([latitude, longitude]);
        },
        (error) => {
          console.error("Error getting location:", error);
          showError(
            "Gagal",
            "Tidak dapat mengambil lokasi anda. Pastikan GPS aktif."
          );
        }
      );
    } else {
      showError("Gagal", "Browser anda tidak mendukung geolokasi.");
    }
  };

  const handleChange = async (e) => {
    const { name, value, files } = e.target;
    if (name === "image" && files && files[0]) {
      setIsCompressing(true);
      try {
        const compressed = await compressImage(files[0]);
        setFormData((prev) => ({
          ...prev,
          image: compressed,
        }));
      } catch (error) {
        console.error("Compression failed", error);
        showError("Gagal", "Gagal memproses gambar");
      } finally {
        setIsCompressing(false);
      }
    } else if (name === "gallery" && files) {
      const filesArray = Array.from(files);
      const validFiles = [];
      let errorMsg = "";

      if (
        newGalleryFiles.length + filesArray.length + formData.gallery.length >
        5
      ) {
        showError("Gagal", "Maksimal total 5 foto galeri.");
        return;
      }

      filesArray.forEach((file) => {
        if (file.size > 5 * 1024 * 1024) {
          errorMsg = `File ${file.name} melebihi 5MB.`;
        } else {
          validFiles.push(file);
        }
      });

      if (errorMsg) showError("Gagal", errorMsg);

      if (validFiles.length > 0) {
        setIsCompressing(true);
        try {
          const compressedFiles = await Promise.all(
            validFiles.map((file) => compressImage(file))
          );
          setNewGalleryFiles((prev) => [...prev, ...compressedFiles]);
        } catch (error) {
          console.error("Gallery compression failed", error);
          showError("Gagal", "Gagal memproses gambar galeri");
        } finally {
          setIsCompressing(false);
        }
      }
    } else if (name === "owner_phone") {
      // Auto-generate WhatsApp link
      let phone = value;
      // Remove non-numeric characters for the link generation
      let cleanPhone = phone.replace(/\D/g, "");

      // Format to 62 if starts with 0
      if (cleanPhone.startsWith("0")) {
        cleanPhone = "62" + cleanPhone.slice(1);
      }

      setFormData((prev) => ({
        ...prev,
        owner_phone: value,
        owner_whatsapp: `https://wa.me/${cleanPhone}`,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handleCheckboxChange = (e, type) => {
    const { value, checked } = e.target;
    const id = parseInt(value);

    setFormData((prev) => {
      const currentList = prev[type] || [];
      if (checked) {
        return { ...prev, [type]: [...currentList, id] };
      } else {
        return { ...prev, [type]: currentList.filter((item) => item !== id) };
      }
    });
  };

  const removeGalleryItem = (index, isNew) => {
    if (isNew) {
      setNewGalleryFiles((prev) => prev.filter((_, i) => i !== index));
    } else {
      setFormData((prev) => ({
        ...prev,
        gallery: prev.gallery.filter((_, i) => i !== index),
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = new FormData();
    payload.append("slug", formData.slug);
    payload.append("name", formData.name);
    payload.append("city", formData.city);

    // Format Price: Rp 300.000 / bulan
    const formattedPrice = `Rp ${parseInt(formData.price).toLocaleString(
      "id-ID"
    )} / bulan`;
    payload.append("price", formattedPrice);

    payload.append("summary", formData.summary);

    // Format Size: 3 x 3 M
    const formattedSize = `${formData.width} x ${formData.length} M`;
    payload.append("size", formattedSize);

    // Format Capacity: 1 orang
    const formattedCapacity = `${formData.capacity} orang`;
    payload.append("capacity", formattedCapacity);

    // Handle image
    if (formData.image instanceof File) {
      payload.append("image", formData.image);
    } else if (formData.image) {
      payload.append("image", formData.image); // Keep existing URL if not changed
    }

    // Handle Gallery
    // Append existing URLs
    formData.gallery.forEach((url) => payload.append("gallery", url));
    // Append new files
    newGalleryFiles.forEach((file) => payload.append("gallery", file));

    // Handle arrays (Send IDs)
    if (formData.facilities && formData.facilities.length > 0) {
      formData.facilities.forEach((id) => payload.append("facilities[]", id));
    }
    if (formData.services && formData.services.length > 0) {
      formData.services.forEach((id) => payload.append("services[]", id));
    }

    // Handle nested owner object
    payload.append("owner[name]", formData.owner_name);
    payload.append("owner[phone]", formData.owner_phone);
    payload.append("owner[whatsapp]", formData.owner_whatsapp);

    // Handle Location
    if (position) {
      payload.append("latitude", position.lat);
      payload.append("longitude", position.lng);
    }

    try {
      if (isEdit) {
        await updateKos(slug, payload);
      } else {
        await createKos(payload);
      }
      await showSuccess("Berhasil", "Data kos berhasil disimpan");
      navigate(userRole === "owner" ? "/owner" : "/admin");
    } catch (error) {
      showError("Gagal", "Gagal menyimpan data: " + error.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#fdfbf7] text-[#1a1a1a] p-8 font-sans">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl shadow-black/5 border border-gray-100 p-10">
        <div className="flex items-center justify-between mb-10 border-b border-gray-100 pb-6">
          <div>
            <button
              onClick={() =>
                navigate(userRole === "owner" ? "/owner" : "/admin")
              }
              className="text-sm text-gray-500 hover:text-[#d4af37] mb-2 flex items-center gap-1 transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Kembali
            </button>
            <h1 className="text-3xl font-serif font-bold text-[#1a1a1a]">
              {isEdit ? "Edit Data Kos" : "Tambah Kos Baru"}
            </h1>
            <p className="text-gray-500 mt-2">
              Lengkapi informasi properti dengan detail.
            </p>
          </div>
          <div className="h-12 w-12 rounded-full bg-[#fdfbf7] flex items-center justify-center">
            <svg
              className="w-6 h-6 text-[#d4af37]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Informasi Dasar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="col-span-2">
              <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-2">
                Nama Kos
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                placeholder="Contoh: Kos Melati Indah"
                className="w-full p-4 bg-[#fdfbf7] border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#d4af37]/20 focus:border-[#d4af37] outline-none transition-all text-[#1a1a1a] placeholder-gray-400 font-medium"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-2">
                Kota / Lokasi
              </label>
              <select
                name="city"
                value={formData.city}
                onChange={handleChange}
                required
                className="w-full p-4 bg-[#fdfbf7] border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#d4af37]/20 focus:border-[#d4af37] outline-none transition-all text-[#1a1a1a] font-medium"
              >
                <option value="">Pilih Kota</option>
                {CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-2">
                Harga (Per Bulan)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-4 text-[#d4af37] font-bold">
                  Rp
                </span>
                <input
                  type="number"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  required
                  min="1"
                  placeholder="300000"
                  className="w-full p-4 pl-12 bg-[#fdfbf7] border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#d4af37]/20 focus:border-[#d4af37] outline-none transition-all text-[#1a1a1a] placeholder-gray-400 font-medium"
                />
              </div>
            </div>

            {/* Map Section */}
            <div className="col-span-2">
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider">
                  Lokasi Peta (Klik untuk menandai)
                </label>
                <button
                  type="button"
                  onClick={handleCurrentLocation}
                  className="text-sm text-[#d4af37] hover:text-[#b3902a] font-medium flex items-center gap-1 transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  Gunakan Lokasi Saya
                </button>
              </div>
              <div className="h-64 w-full rounded-xl overflow-hidden border border-gray-200 z-0 relative">
                <MapContainer
                  center={mapCenter}
                  zoom={13}
                  scrollWheelZoom={true}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapUpdater center={mapCenter} />
                  <LocationMarker
                    position={position}
                    setPosition={setPosition}
                  />
                </MapContainer>
              </div>
              {position && (
                <p className="text-sm text-gray-500 mt-2">
                  Lat: {position.lat.toFixed(6)}, Lng: {position.lng.toFixed(6)}
                </p>
              )}
            </div>
          </div>

          {/* Gambar & Deskripsi */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-2">
                Gambar Utama
              </label>
              <div className="flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-200 border-dashed rounded-2xl cursor-pointer bg-[#fdfbf7] hover:bg-gray-50 transition-all group">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <svg
                        className="w-6 h-6 text-[#d4af37]"
                        aria-hidden="true"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 20 16"
                      >
                        <path
                          stroke="currentColor"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
                        />
                      </svg>
                    </div>
                    <p className="mb-2 text-sm text-gray-500">
                      <span className="font-bold text-[#1a1a1a]">
                        Klik untuk upload
                      </span>{" "}
                      atau drag and drop
                    </p>
                    <p className="text-xs text-gray-400">
                      PNG, JPG or GIF (MAX. 3MB)
                    </p>
                  </div>
                  <input
                    type="file"
                    name="image"
                    onChange={handleChange}
                    accept="image/*"
                    className="hidden"
                    required={!isEdit}
                  />
                </label>
              </div>
              {formData.image && typeof formData.image === "string" && (
                <div className="mt-4 p-3 bg-white rounded-xl border border-gray-100 shadow-sm inline-block">
                  <p className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
                    Gambar saat ini
                  </p>
                  <img
                    src={formData.image}
                    alt="Preview"
                    className="h-32 object-cover rounded-lg"
                  />
                </div>
              )}
              {formData.image && formData.image instanceof File && (
                <div className="mt-4 flex items-center gap-2 text-sm text-[#d4af37] font-medium bg-[#d4af37]/10 p-3 rounded-lg inline-block">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  File terpilih: {formData.image.name}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-2">
                Galeri Foto (Max 5 Foto, Max 3MB/foto)
              </label>
              <div className="flex items-center justify-center w-full mb-4">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-200 border-dashed rounded-2xl cursor-pointer bg-[#fdfbf7] hover:bg-gray-50 transition-all group">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <svg
                      className="w-8 h-8 text-[#d4af37] mb-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    <p className="text-sm text-gray-500">Tambah Foto Galeri</p>
                  </div>
                  <input
                    type="file"
                    name="gallery"
                    onChange={handleChange}
                    accept="image/*"
                    multiple
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {/* Existing Gallery */}
                {formData.gallery.map((url, index) => (
                  <div key={`existing-${index}`} className="relative group">
                    <img
                      src={url}
                      alt={`Gallery ${index}`}
                      className="w-full h-24 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => removeGalleryItem(index, false)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
                {/* New Gallery Files */}
                {newGalleryFiles.map((file, index) => (
                  <div key={`new-${index}`} className="relative group">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`New Gallery ${index}`}
                      className="w-full h-24 object-cover rounded-lg border-2 border-[#d4af37]"
                    />
                    <button
                      type="button"
                      onClick={() => removeGalleryItem(index, true)}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-2">
                Deskripsi Singkat
              </label>
              <textarea
                name="summary"
                value={formData.summary}
                onChange={handleChange}
                rows="4"
                placeholder="Jelaskan keunggulan kos ini..."
                className="w-full p-4 bg-[#fdfbf7] border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#d4af37]/20 focus:border-[#d4af37] outline-none transition-all text-[#1a1a1a] placeholder-gray-400 font-medium"
              ></textarea>
            </div>
          </div>

          {/* Detail Kamar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-2">
                Lebar (Meter)
              </label>
              <input
                type="number"
                name="width"
                value={formData.width}
                onChange={handleChange}
                min="1"
                placeholder="3"
                className="w-full p-4 bg-[#fdfbf7] border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#d4af37]/20 focus:border-[#d4af37] outline-none transition-all text-[#1a1a1a] placeholder-gray-400 font-medium"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-2">
                Panjang (Meter)
              </label>
              <input
                type="number"
                name="length"
                value={formData.length}
                onChange={handleChange}
                min="1"
                placeholder="4"
                className="w-full p-4 bg-[#fdfbf7] border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#d4af37]/20 focus:border-[#d4af37] outline-none transition-all text-[#1a1a1a] placeholder-gray-400 font-medium"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-2">
                Kapasitas (Orang)
              </label>
              <input
                type="number"
                name="capacity"
                value={formData.capacity}
                onChange={handleChange}
                min="1"
                placeholder="2"
                className="w-full p-4 bg-[#fdfbf7] border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#d4af37]/20 focus:border-[#d4af37] outline-none transition-all text-[#1a1a1a] placeholder-gray-400 font-medium"
              />
            </div>
          </div>

          {/* Fasilitas & Layanan */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-4">
                Fasilitas
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {masterData.facilities.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center space-x-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      value={item.id}
                      checked={formData.facilities.includes(item.id)}
                      onChange={(e) => handleCheckboxChange(e, "facilities")}
                      className="w-5 h-5 text-[#d4af37] border-gray-300 rounded focus:ring-[#d4af37]"
                    />
                    <span className="text-gray-700 font-medium">
                      {item.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-4">
                Layanan Tambahan
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {masterData.services.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center space-x-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      value={item.id}
                      checked={formData.services.includes(item.id)}
                      onChange={(e) => handleCheckboxChange(e, "services")}
                      className="w-5 h-5 text-[#d4af37] border-gray-300 rounded focus:ring-[#d4af37]"
                    />
                    <span className="text-gray-700 font-medium">
                      {item.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Info Pemilik */}
          <div className="border-t border-gray-100 pt-8">
            <h3 className="text-xl font-serif font-bold text-[#1a1a1a] mb-6 flex items-center gap-2">
              <span className="w-8 h-1 bg-[#d4af37] rounded-full"></span>
              Informasi Pemilik (Opsional)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-2">
                  Nama Pemilik
                </label>
                <input
                  type="text"
                  name="owner_name"
                  value={formData.owner_name}
                  onChange={handleChange}
                  placeholder="Kosongkan untuk pakai nama akun"
                  className="w-full p-4 bg-[#fdfbf7] border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#d4af37]/20 focus:border-[#d4af37] outline-none transition-all text-[#1a1a1a] placeholder-gray-400 font-medium"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-2">
                  No. HP
                </label>
                <input
                  type="text"
                  name="owner_phone"
                  value={formData.owner_phone}
                  onChange={handleChange}
                  placeholder="Contoh: 628123456789"
                  className="w-full p-4 bg-[#fdfbf7] border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#d4af37]/20 focus:border-[#d4af37] outline-none transition-all text-[#1a1a1a] placeholder-gray-400 font-medium"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Gunakan awalan 62. Kosongkan untuk pakai no HP akun.
                </p>
              </div>
              <div>
                <label className="block text-sm font-bold text-[#1a1a1a]/70 uppercase tracking-wider mb-2">
                  Link WhatsApp (Otomatis)
                </label>
                <input
                  type="text"
                  name="owner_whatsapp"
                  value={formData.owner_whatsapp}
                  readOnly
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 font-medium cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4 pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={() =>
                navigate(userRole === "owner" ? "/owner" : "/admin")
              }
              className="px-8 py-4 bg-white text-gray-500 rounded-xl hover:bg-gray-50 transition-colors font-bold border border-gray-200"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isCompressing}
              className={`px-8 py-4 bg-[#1a1a1a] text-[#d4af37] font-bold rounded-xl hover:bg-black transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 ${
                isCompressing ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              {isCompressing ? "Memproses Gambar..." : "Simpan Data"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default KosForm;
