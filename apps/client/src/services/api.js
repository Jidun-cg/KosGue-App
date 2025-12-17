const BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

export const getKosList = async () => {
  const response = await fetch(`${BASE_URL}/kos`);
  if (!response.ok) {
    throw new Error("Failed to fetch kos list");
  }
  return response.json();
};

export const getKosBySlug = async (slug) => {
  const response = await fetch(`${BASE_URL}/kos/${slug}`);
  if (!response.ok) {
    throw new Error("Failed to fetch kos detail");
  }
  return response.json();
};

export const getMasterData = async () => {
  const response = await fetch(`${BASE_URL}/kos/master-data`);
  if (!response.ok) {
    throw new Error("Failed to fetch master data");
  }
  return response.json();
};

export const login = async (email, password) => {
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Login failed");
  }

  return data;
};

export const register = async (username, email, password) => {
  const response = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, email, password }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Register failed");
  }

  return data;
};

export const verifyEmail = async (email, code) => {
  const response = await fetch(`${BASE_URL}/auth/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, code }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Verification failed");
  }

  return data;
};

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

export const createKos = async (data) => {
  const isFormData = data instanceof FormData;
  const headers = getAuthHeaders();
  if (isFormData) {
    delete headers["Content-Type"];
  }

  const response = await fetch(`${BASE_URL}/kos`, {
    method: "POST",
    headers: headers,
    body: isFormData ? data : JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to create kos");
  return response.json();
};

export const updateKos = async (slug, data) => {
  const isFormData = data instanceof FormData;
  const headers = getAuthHeaders();
  if (isFormData) {
    delete headers["Content-Type"];
  }

  const response = await fetch(`${BASE_URL}/kos/${slug}`, {
    method: "PUT",
    headers: headers,
    body: isFormData ? data : JSON.stringify(data),
  });
  if (!response.ok) throw new Error("Failed to update kos");
  return response.json();
};

export const deleteKos = async (slug) => {
  const response = await fetch(`${BASE_URL}/kos/${slug}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error("Failed to delete kos");
  return response.json();
};

export const addReview = async (slug, rating, comment) => {
  const response = await fetch(`${BASE_URL}/kos/${slug}/reviews`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ rating, comment }),
  });
  if (!response.ok) throw new Error("Failed to add review");
  return response.json();
};

export const upgradeToOwner = async () => {
  const response = await fetch(`${BASE_URL}/auth/upgrade-to-owner`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message || "Failed to upgrade to owner");
  return data;
};

export const getOwnerKos = async () => {
  const response = await fetch(`${BASE_URL}/kos/owner/my-kos`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error("Failed to fetch owner kos");
  return response.json();
};
