const express = require("express");
const router = express.Router();
const kosController = require("../controllers/kosController");
const authenticateToken = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const ownerMiddleware = require("../middleware/ownerMiddleware");
const upload = require("../middleware/uploadMiddleware");

router.get("/master-data", kosController.getMasterData);
router.get("/", kosController.getAllKos);
router.get("/owner/my-kos", authenticateToken, kosController.getOwnerKos);
router.get("/:slug", kosController.getKosBySlug);
router.post(
  "/",
  authenticateToken,
  ownerMiddleware,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "gallery", maxCount: 5 },
  ]),
  kosController.createKos
);
router.put(
  "/:slug",
  authenticateToken,
  ownerMiddleware,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "gallery", maxCount: 5 },
  ]),
  kosController.updateKos
);
router.delete(
  "/:slug",
  authenticateToken,
  ownerMiddleware,
  kosController.deleteKos
);

router.post("/:slug/reviews", authenticateToken, kosController.addReview);

module.exports = router;
