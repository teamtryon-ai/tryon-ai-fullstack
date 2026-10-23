import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  ShoppingBag,
  Heart,
  Sparkles,
  Camera,
  Upload,
  X,
  Check,
  Star,
  SlidersHorizontal,
  RefreshCw,
  Eye,
  Trash2,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Users,
  Database,
  Ruler
} from 'lucide-react';

// Compatibility helpers used by the recovered compiled functions.
const __async = (self, args, generator) => new Promise((resolve, reject) => {
  const fulfilled = (value) => { try { step(generator.next(value)); } catch (error) { reject(error); } };
  const rejected = (value) => { try { step(generator.throw(value)); } catch (error) { reject(error); } };
  const step = (result) => result.done ? resolve(result.value) : Promise.resolve(result.value).then(fulfilled, rejected);
  step((generator = generator.apply(self, args || [])).next());
});
const __spreadValues = (target, source) => {
  for (const key in (source || {})) if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = source[key];
  return target;
};
const __spreadProps = (target, source) => Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
const import_react3 = { default: React, ...React };
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

// Product photos uploaded to the backend come back as "/api/uploads/<id>.jpg".
const API_ORIGIN = API_BASE_URL.replace(/\/api$/, "");
const resolveProductImage = (url) => typeof url === "string" && url.startsWith("/api/") ? `${API_ORIGIN}${url}` : url;



const DB_NAME = "MyntraAIVirtualTryOnDB";
const DB_VERSION = 2;

function openTryOnDB() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("profiles")) {
          db.createObjectStore("profiles", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("generatedImages")) {
          db.createObjectStore("generatedImages", { keyPath: "cacheKey" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

function dbGetAllProfiles() {
  return __async(this, null, function* () {
    const db = yield openTryOnDB();
    let localProfiles = [];
    if (db) {
      localProfiles = yield new Promise((resolve) => {
        const tx = db.transaction("profiles", "readonly");
        const req = tx.objectStore("profiles").getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    }
    try {
      const response = yield fetch(`${API_BASE_URL}/profiles`);
      if (response.ok) {
        const remoteProfiles = yield response.json();
        if (Array.isArray(remoteProfiles)) {
          const byId = new Map(localProfiles.map((profile) => [profile.id, profile]));
          remoteProfiles.forEach((profile) => byId.set(profile.id, profile));
          const merged = Array.from(byId.values());
          if (db) {
            yield Promise.all(merged.map((profile) => new Promise((resolve) => {
              const tx = db.transaction("profiles", "readwrite");
              tx.objectStore("profiles").put(profile);
              tx.oncomplete = () => resolve();
              tx.onerror = () => resolve();
            })));
          }
          return merged;
        }
      }
    } catch (error) {
      console.warn("MongoDB profile sync unavailable; using browser cache.", error);
    }
    return localProfiles;
  });
}

function dbSaveProfile(profile) {
  return __async(this, null, function* () {
    if (!profile) return;
    const db = yield openTryOnDB();
    if (db) {
      yield new Promise((resolve) => {
        const tx = db.transaction("profiles", "readwrite");
        tx.objectStore("profiles").put(profile);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
    try {
      yield fetch(`${API_BASE_URL}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      });
    } catch (error) {
      console.warn("MongoDB profile save unavailable; kept local copy.", error);
    }
  });
}

function dbDeleteProfile(profileId) {
  return __async(this, null, function* () {
    if (!profileId) return;
    const db = yield openTryOnDB();
    yield dbClearProfileImages(profileId);
    if (db) {
      yield new Promise((resolve) => {
        const tx = db.transaction("profiles", "readwrite");
        tx.objectStore("profiles").delete(profileId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
    try {
      yield fetch(`${API_BASE_URL}/profiles/${encodeURIComponent(profileId)}`, { method: "DELETE" });
    } catch (error) {
      console.warn("Remote profile deletion unavailable.", error);
    }
  });
}

function dbGetMeta(key) {
    return __async(this, null, function* () {
      const db = yield openTryOnDB();
      if (!db)
        return null;
      return new Promise((resolve) => {
        const tx = db.transaction("meta", "readonly");
        const req = tx.objectStore("meta").get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => resolve(null);
      });
    });
  }

function dbSetMeta(key, value) {
    return __async(this, null, function* () {
      const db = yield openTryOnDB();
      if (!db)
        return;
      return new Promise((resolve) => {
        const tx = db.transaction("meta", "readwrite");
        tx.objectStore("meta").put({ key, value });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    });
  }

function dbSaveGeneratedImage(profileId, productId, dataUrl) {
    return __async(this, null, function* () {
      const db = yield openTryOnDB();
      if (!db || !profileId || !productId || !dataUrl)
        return;
      return new Promise((resolve) => {
        const tx = db.transaction("generatedImages", "readwrite");
        tx.objectStore("generatedImages").put({
          cacheKey: `${profileId}_${productId}`,
          profileId,
          productId,
          dataUrl
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    });
  }

function dbGetGeneratedImagesForProfile(profileId) {
  return __async(this, null, function* () {
    if (!profileId) return {};
    const db = yield openTryOnDB();
    let map = {};
    if (db) {
      map = yield new Promise((resolve) => {
        const tx = db.transaction("generatedImages", "readonly");
        const req = tx.objectStore("generatedImages").getAll();
        req.onsuccess = () => {
          const result = {};
          (req.result || []).forEach((entry) => {
            if (entry.profileId === profileId && entry.productId && entry.dataUrl) result[entry.productId] = entry.dataUrl;
          });
          resolve(result);
        };
        req.onerror = () => resolve({});
      });
    }
    try {
      const response = yield fetch(`${API_BASE_URL}/tryon/history/${encodeURIComponent(profileId)}`);
      if (response.ok) map = { ...map, ...(yield response.json()) };
    } catch (error) {
      console.warn("Remote try-on history unavailable; using browser cache.", error);
    }
    return map;
  });
}

function dbClearProfileImages(profileId) {
  return __async(this, null, function* () {
    if (!profileId) return;
    const db = yield openTryOnDB();
    if (db) {
      yield new Promise((resolve) => {
        const tx = db.transaction("generatedImages", "readwrite");
        const store = tx.objectStore("generatedImages");
        const req = store.getAll();
        req.onsuccess = () => (req.result || []).forEach((item) => {
          if (item.profileId === profileId) store.delete(item.cacheKey);
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
    try {
      yield fetch(`${API_BASE_URL}/tryon/history/${encodeURIComponent(profileId)}`, { method: "DELETE" });
    } catch (error) {
      console.warn("Remote history deletion unavailable.", error);
    }
  });
}

function loadImageElement(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = src;
    });
  }

function normalizeImageToJpeg(srcUrl, maxDim = 768) {
    return __async(this, null, function* () {
      const img = yield loadImageElement(srcUrl);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      const base64 = dataUrl.split(",")[1];
      return { dataUrl, base64, width: w, height: h, imgElement: img };
    });
  }

function detectFaceRegion(ctx, width, height, isPortraitUpload = false) {
    const searchTop = Math.floor(height * (isPortraitUpload ? 0.04 : 0.03));
    const searchBottom = Math.floor(height * (isPortraitUpload ? 0.85 : 0.42));
    const searchLeft = Math.floor(width * (isPortraitUpload ? 0.12 : 0.2));
    const searchRight = Math.floor(width * (isPortraitUpload ? 0.88 : 0.8));
    const imgData = ctx.getImageData(
      searchLeft,
      searchTop,
      Math.max(1, searchRight - searchLeft),
      Math.max(1, searchBottom - searchTop)
    );
    const data = imgData.data;
    const sw = imgData.width;
    const sh = imgData.height;
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    const xs = [];
    const ys = [];
    for (let y = 0; y < sh; y += 2) {
      for (let x = 0; x < sw; x += 2) {
        const idx = (y * sw + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const yVal = 0.299 * r + 0.587 * g + 0.114 * b;
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        if (yVal > 45 && yVal < 240 && cr >= 133 && cr <= 173 && cb >= 77 && cb <= 127 && r > g && r > b) {
          sumX += x;
          sumY += y;
          count++;
          xs.push(x);
          ys.push(y);
        }
      }
    }
    if (count < 40) {
      return {
        cx: width * 0.5,
        cy: height * (isPortraitUpload ? 0.45 : 0.19),
        rx: width * (isPortraitUpload ? 0.27 : 0.115),
        ry: height * (isPortraitUpload ? 0.33 : 0.11)
      };
    }
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);
    const p15x = xs[Math.floor(xs.length * 0.15)];
    const p85x = xs[Math.floor(xs.length * 0.85)];
    const p10y = ys[Math.floor(ys.length * 0.1)];
    const p85y = ys[Math.floor(ys.length * 0.85)];
    const cx = searchLeft + (p15x + p85x) / 2;
    const cy = searchTop + (p10y + p85y) / 2;
    const rawW = Math.max(width * (isPortraitUpload ? 0.32 : 0.15), (p85x - p15x) * 1.35);
    const rawH = Math.max(height * (isPortraitUpload ? 0.38 : 0.14), (p85y - p10y) * 1.35);
    return {
      cx,
      cy,
      rx: Math.min(width * (isPortraitUpload ? 0.38 : 0.16), rawW / 2),
      ry: Math.min(height * (isPortraitUpload ? 0.42 : 0.15), rawH / 2)
    };
  }

function buildBodyMeasurementProfile(userProfile, category) {
    if (!userProfile || category === "Kids") {
      return {
        hasMeasurements: false,
        summaryBadge: "Standard Kids Fit",
        promptInstructions: "",
        widthScaleFactor: 1,
        chestScale: 1,
        waistScale: 1,
        hipScale: 1,
        heightScale: 1
      };
    }
    const heightCm = Math.max(130, Math.min(210, parseFloat(userProfile.heightCm) || 165));
    const weightKg = Math.max(35, Math.min(160, parseFloat(userProfile.weightKg) || 60));
    const chestIn = Math.max(26, Math.min(60, parseFloat(userProfile.chestInches) || 36));
    const waistIn = Math.max(20, Math.min(56, parseFloat(userProfile.waistInches) || 30));
    const hipIn = Math.max(28, Math.min(62, parseFloat(userProfile.hipInches) || 37));
    const bodyType = userProfile.bodyType || "Regular";
    const isFemale = category === "Women" || !category && userProfile.gender === "Female";
    const heightM = heightCm / 100;
    const bmi = +(weightKg / (heightM * heightM)).toFixed(1);
    let statureDesc = "average medium height stature (1:7.2 head-to-body ratio)";
    if (isFemale) {
      if (heightCm < 153)
        statureDesc = "visibly petite, short stature with compact torso, shorter legs, and a 1:6.3 head-to-body ratio";
      else if (heightCm < 160)
        statureDesc = "compact petite-medium stature with slightly shorter limb proportions";
      else if (heightCm >= 175)
        statureDesc = "visibly tall, statuesque runway stature with markedly elongated torso, long legs, and 1:8 head-to-body ratio";
      else if (heightCm >= 168)
        statureDesc = "tall stature with elongated limbs and vertical frame";
    } else {
      if (heightCm < 164)
        statureDesc = "visibly compact, shorter male stature with shorter torso and legs (1:6.5 head-to-body ratio)";
      else if (heightCm >= 184)
        statureDesc = "visibly tall, commanding male stature with long limbs and elongated vertical proportions (1:8.2 head-to-body ratio)";
      else if (heightCm >= 178)
        statureDesc = "tall male stature with long torso and legs";
    }
    let bmiBuildDesc = "balanced medium build";
    if (bmi < 18.5)
      bmiBuildDesc = "visibly slender, skinny, low-body-fat ectomorph frame with slim arms and collarbones showing";
    else if (bmi < 22)
      bmiBuildDesc = "toned, lithe, trim athletic-slim frame";
    else if (bmi < 25)
      bmiBuildDesc = "well-proportioned regular medium frame";
    else if (bmi < 28.5)
      bmiBuildDesc = "visibly fuller, broad, curvy/solid endomorph frame with thicker arms and softer contours";
    else
      bmiBuildDesc = "visibly plus-size, full-figured, heavy-set frame with generous body volume, fuller arms, and soft rounded contours";
    let chestVisualDesc = "";
    let waistVisualDesc = "";
    let hipVisualDesc = "";
    if (isFemale) {
      if (chestIn <= 31)
        chestVisualDesc = `visibly petite, small ${chestIn}-inch bust with flat upper-chest contour`;
      else if (chestIn <= 35)
        chestVisualDesc = `medium proportional ${chestIn}-inch bust`;
      else if (chestIn <= 39)
        chestVisualDesc = `visibly full, prominent, curvy ${chestIn}-inch bust with clear upper-bodice fullness`;
      else
        chestVisualDesc = `visibly large, voluptuous, heavy ${chestIn}-inch bust with pronounced projection and snug fabric tension across the chest`;
      if (waistIn <= 25)
        waistVisualDesc = `visibly narrow, tightly cinched ${waistIn}-inch wasp waist`;
      else if (waistIn <= 29)
        waistVisualDesc = `defined natural ${waistIn}-inch waist`;
      else if (waistIn <= 34)
        waistVisualDesc = `visibly fuller, wider ${waistIn}-inch waist and midsection`;
      else
        waistVisualDesc = `visibly broad, full ${waistIn}-inch waist and rounded stomach/midsection`;
      if (hipIn <= 34)
        hipVisualDesc = `visibly narrow, slender ${hipIn}-inch hips and slim thighs`;
      else if (hipIn <= 38)
        hipVisualDesc = `medium proportional ${hipIn}-inch hips`;
      else if (hipIn <= 42)
        hipVisualDesc = `visibly wide, curvy, flaring ${hipIn}-inch hips and full thighs`;
      else
        hipVisualDesc = `visibly very wide, voluptuous ${hipIn}-inch hips and generous lower-body curves`;
    } else {
      if (chestIn <= 36)
        chestVisualDesc = `visibly narrow, slim ${chestIn}-inch male chest and narrow shoulders`;
      else if (chestIn <= 41)
        chestVisualDesc = `proportional ${chestIn}-inch male chest and medium shoulders`;
      else
        chestVisualDesc = `visibly broad, muscular, barrel-chested ${chestIn}-inch upper torso and wide shoulders`;
      if (waistIn <= 29)
        waistVisualDesc = `visibly lean, trim, narrow ${waistIn}-inch waist`;
      else if (waistIn <= 34)
        waistVisualDesc = `regular ${waistIn}-inch male waist`;
      else
        waistVisualDesc = `visibly wide, fuller ${waistIn}-inch waist and stocky midsection`;
      if (hipIn <= 35)
        hipVisualDesc = `slim ${hipIn}-inch hips`;
      else if (hipIn <= 40)
        hipVisualDesc = `proportional ${hipIn}-inch hips and seat`;
      else
        hipVisualDesc = `visibly broad, heavy-set ${hipIn}-inch hips and thighs`;
    }
    const waistToHip = +(waistIn / hipIn).toFixed(2);
    const chestToWaist = +(chestIn / waistIn).toFixed(2);
    let silhouetteDesc = "balanced proportional torso";
    if (isFemale) {
      if (Math.abs(chestIn - hipIn) <= 3 && waistToHip <= 0.75) {
        silhouetteDesc = "pronounced hourglass figure with a dramatic bust-to-waist-to-hip curve";
      } else if (hipIn - chestIn >= 3.5) {
        silhouetteDesc = "pronounced pear-shaped figure with narrower bust/shoulders and noticeably wider hips";
      } else if (chestIn - hipIn >= 3.5) {
        silhouetteDesc = "inverted-triangle / top-curvy figure with a prominent full bust and narrower hips";
      } else if (waistToHip >= 0.85) {
        silhouetteDesc = "apple / fuller-waist figure with a wider midsection";
      }
    } else {
      if (chestToWaist >= 1.24) {
        silhouetteDesc = "pronounced V-taper athletic torso with wide chest and narrow waist";
      } else if (chestToWaist <= 1.07) {
        silhouetteDesc = "full-bodied rectangular/stocky torso with a wider waist";
      } else {
        silhouetteDesc = "classic tailored masculine proportions";
      }
    }
    const baseChest = isFemale ? 34 : 39;
    const baseWaist = isFemale ? 27 : 32;
    const baseHip = isFemale ? 36 : 38;
    const baseHeight = isFemale ? 165 : 176;
    const baseBmi = isFemale ? 21 : 22.5;
    const bmiFactor = (bmi - baseBmi) * 9e-3;
    const chestScale = Math.max(0.84, Math.min(1.28, 1 + (chestIn - baseChest) * 0.016 + bmiFactor * 0.6));
    const waistScale = Math.max(0.8, Math.min(1.34, 1 + (waistIn - baseWaist) * 0.019 + bmiFactor * 0.85));
    const hipScale = Math.max(0.84, Math.min(1.32, 1 + (hipIn - baseHip) * 0.017 + bmiFactor * 0.7));
    const heightScale = Math.max(0.9, Math.min(1.1, 1 + (heightCm - baseHeight) * 32e-4));
    const widthScaleFactor = +(chestScale * 0.35 + waistScale * 0.35 + hipScale * 0.3).toFixed(3);
    const chestLabel = isFemale ? "Bust" : "Chest";
    const summaryBadge = `${heightCm}cm \u2022 ${weightKg}kg \u2022 ${chestIn}"-${waistIn}"-${hipIn}" (${bodyType})`;
    const promptInstructions = `MANDATORY ANATOMICAL BODY RESHAPING & PROPORTION INSTRUCTIONS (DO NOT KEEP DEFAULT SLIM MODEL BODY):
You MUST visibly reshape the model's body anatomy so a viewer looking at the photo can immediately tell their exact height, weight, ${chestLabel.toLowerCase()}, waist, and hip measurements:
1. EXACT HEIGHT & VERTICAL STATURE (${heightCm} cm): Render a ${statureDesc}. Adjust torso length, leg length, and head-to-body ratio to clearly look ${heightCm} cm tall.
2. EXACT WEIGHT & OVERALL BUILD (${weightKg} kg, BMI ${bmi}, ${bodyType}): Render a ${bmiBuildDesc}.
3. EXACT ${chestLabel.toUpperCase()} (${chestIn} inches): Render a ${chestVisualDesc}.
4. EXACT WAIST (${waistIn} inches): Render a ${waistVisualDesc}.
5. EXACT HIPS (${hipIn} inches): Render ${hipVisualDesc}.
6. OVERALL SILHOUETTE: ${silhouetteDesc}. Make the garment visibly stretch, contour, cinch, or drape over the ${chestIn}" ${chestLabel.toLowerCase()}, ${waistIn}" waist, and ${hipIn}" hips accurately.`;
    return {
      hasMeasurements: true,
      isFemale,
      heightCm,
      weightKg,
      chestIn,
      waistIn,
      hipIn,
      bmi,
      bodyType,
      statureDesc,
      bmiBuildDesc,
      chestVisualDesc,
      waistVisualDesc,
      hipVisualDesc,
      silhouetteDesc,
      summaryBadge,
      promptInstructions,
      widthScaleFactor,
      chestScale,
      waistScale,
      hipScale,
      heightScale
    };
  }

function applyAnatomicalBodyMorph(sourceCanvas, bodyMeta) {
    if (!bodyMeta || !bodyMeta.hasMeasurements)
      return sourceCanvas;
    const cw = sourceCanvas.width;
    const ch = sourceCanvas.height;
    const outCanvas = document.createElement("canvas");
    outCanvas.width = cw;
    outCanvas.height = ch;
    const ctx = outCanvas.getContext("2d");
    const srcCtx = sourceCanvas.getContext("2d");
    const cornerPixel = srcCtx.getImageData(4, 4, 1, 1).data;
    ctx.fillStyle = `rgb(${cornerPixel[0]}, ${cornerPixel[1]}, ${cornerPixel[2]})`;
    ctx.fillRect(0, 0, cw, ch);
    const { chestScale = 1, waistScale = 1, hipScale = 1, heightScale = 1 } = bodyMeta;
    const lerpCos = (a, b, t) => {
      const clamped = Math.max(0, Math.min(1, t));
      const f = (1 - Math.cos(clamped * Math.PI)) * 0.5;
      return a * (1 - f) + b * f;
    };
    const getHorizontalScaleAtY = (yNorm) => {
      if (yNorm < 0.18) {
        return 1;
      } else if (yNorm < 0.27) {
        return lerpCos(1, chestScale, (yNorm - 0.18) / 0.09);
      } else if (yNorm < 0.4) {
        return lerpCos(chestScale, waistScale, (yNorm - 0.33) / 0.12);
      } else if (yNorm < 0.53) {
        return lerpCos(waistScale, hipScale, (yNorm - 0.45) / 0.12);
      } else if (yNorm < 0.74) {
        return hipScale;
      } else {
        return lerpCos(hipScale, 1 + (hipScale - 1) * 0.5, (yNorm - 0.74) / 0.26);
      }
    };
    const headAnchorY = ch * 0.18;
    const stripH = 2;
    for (let dstY = 0; dstY < ch; dstY += stripH) {
      const yNorm = dstY / ch;
      let srcY = dstY;
      if (dstY > headAnchorY) {
        const bodyOffset = dstY - headAnchorY;
        srcY = headAnchorY + bodyOffset / heightScale;
      }
      if (srcY < 0 || srcY >= ch - stripH)
        continue;
      const hScale = getHorizontalScaleAtY(yNorm);
      const dstW = cw * hScale;
      const dstX = (cw - dstW) / 2;
      ctx.drawImage(
        sourceCanvas,
        0,
        srcY,
        cw,
        stripH,
        dstX,
        dstY,
        dstW,
        stripH
      );
    }
    return outCanvas;
  }

function createCanvasFaceSwap(userFaceDataUrl, catalogImageUrl, bodyMeta = null) {
    return __async(this, null, function* () {
      const [userImg, catImg] = yield Promise.all([
        loadImageElement(userFaceDataUrl),
        loadImageElement(catalogImageUrl)
      ]);
      const cw = 640;
      const ch = Math.round(catImg.height / catImg.width * cw) || 800;
      const baseCanvas = document.createElement("canvas");
      baseCanvas.width = cw;
      baseCanvas.height = ch;
      const baseCtx = baseCanvas.getContext("2d");
      baseCtx.drawImage(catImg, 0, 0, cw, ch);
      const userCanvas = document.createElement("canvas");
      userCanvas.width = 400;
      userCanvas.height = Math.round(userImg.height / userImg.width * 400) || 400;
      const userCtx = userCanvas.getContext("2d");
      userCtx.drawImage(userImg, 0, 0, userCanvas.width, userCanvas.height);
      const targetFace = detectFaceRegion(baseCtx, cw, ch, false);
      const sourceFace = detectFaceRegion(userCtx, userCanvas.width, userCanvas.height, true);
      const patchW = Math.max(40, Math.round(targetFace.rx * 2.25));
      const patchH = Math.max(48, Math.round(targetFace.ry * 2.35));
      const facePatchCanvas = document.createElement("canvas");
      facePatchCanvas.width = patchW;
      facePatchCanvas.height = patchH;
      const patchCtx = facePatchCanvas.getContext("2d");
      const sx = Math.max(0, sourceFace.cx - sourceFace.rx * 1.1);
      const sy = Math.max(0, sourceFace.cy - sourceFace.ry * 1.15);
      const sw = Math.min(userCanvas.width - sx, sourceFace.rx * 2.2);
      const sh = Math.min(userCanvas.height - sy, sourceFace.ry * 2.3);
      patchCtx.save();
      patchCtx.beginPath();
      patchCtx.ellipse(
        patchW / 2,
        patchH / 2,
        patchW * 0.44,
        patchH * 0.46,
        0,
        0,
        Math.PI * 2
      );
      patchCtx.closePath();
      patchCtx.clip();
      patchCtx.drawImage(userCanvas, sx, sy, sw, sh, 0, 0, patchW, patchH);
      patchCtx.globalCompositeOperation = "destination-in";
      const grad = patchCtx.createRadialGradient(
        patchW / 2,
        patchH / 2,
        Math.min(patchW, patchH) * 0.24,
        patchW / 2,
        patchH / 2,
        Math.max(patchW, patchH) * 0.48
      );
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(0.74, "rgba(0,0,0,0.92)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      patchCtx.fillStyle = grad;
      patchCtx.fillRect(0, 0, patchW, patchH);
      patchCtx.restore();
      baseCtx.save();
      baseCtx.drawImage(
        facePatchCanvas,
        Math.round(targetFace.cx - patchW / 2),
        Math.round(targetFace.cy - patchH / 2)
      );
      baseCtx.restore();
      const morphedCanvas = applyAnatomicalBodyMorph(baseCanvas, bodyMeta);
      return morphedCanvas.toDataURL("image/jpeg", 0.9);
    });
  }

function generateBatchTryOn(userFaceBase64, userFaceMimeType, products, userProfile = null) {
  return __async(this, null, function* () {
    const catalogPromises = products.map((product) => normalizeImageToJpeg(product.defaultImage, 768));
    const catalogDataArray = yield Promise.all(catalogPromises);

    const safeMimeType = ["image/jpeg", "image/png", "image/webp"].includes(userFaceMimeType)
      ? userFaceMimeType
      : "image/jpeg";

    // Nano Banana only receives image URLs, so the prompt itself must say which image is which.
    const faceSwapPrompt = `You are given exactly 2 input images, in this order:
INPUT IMAGE 1: one fashion catalog photo (portrait 3:4). It is the reference for the outfit, pose, camera angle, background and lighting.
INPUT IMAGE 2: a photo of the user. It is the ONLY source of the person's identity.

TASK: Recreate INPUT IMAGE 1 as a new photorealistic photo in which the person is the user from INPUT IMAGE 2, not the catalog model. The person in the result MUST be the real person from INPUT IMAGE 2: exact face identity (eye shape, nose, lips, jawline, face shape, facial hair if any), skin tone and hairstyle, so anyone who knows them would recognise them immediately. The result must NOT resemble the catalog model or any other person.

KEEP FROM INPUT IMAGE 1: the exact same outfit (colour, cut, fabric, print, accessories), the same pose and body position, the same camera angle and framing, the same background and the same lighting. Fit the outfit naturally on the user's body, with natural anatomy and proportions, and blend the head, neck and skin tone seamlessly.

No watermarks, no text, no extra people. Output a single portrait 3:4 image framed like INPUT IMAGE 1.`;
    const promptText = products.length === 1 ? faceSwapPrompt : "Replace the model in every cell of this photo grid completely (face, hair, skin, body, hands) with the person in my reference photos, keeping them the same person in all cells. Keep each cell's pose, expression, clothing, accessories, camera angle, background, and lighting, and fit the clothes naturally to my body. Rebuild the grid at its exact original size with the same cell order, cell sizes, gutters, and borders. Photorealistic, natural anatomy, no face-only swaps, no missing or extra cells, no watermarks. Output as PNG. The grid is portrait 3:4 and each cell is a 3:4 portrait photo.";

    let backendRes;
    try {
      const productsPayload = products.map((product, idx) => ({
        productId: product.id,
        catalogImageBase64: catalogDataArray[idx].dataUrl
      }));

      backendRes = yield fetch(`${API_BASE_URL}/tryon/generate-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: (userProfile == null ? void 0 : userProfile.id) || "guest",
          userFaceBase64,
          userFaceMimeType: safeMimeType,
          products: productsPayload,
          promptText
        })
      });
    } catch (err) {
      throw new Error(`Could not reach the MyntraAI backend at ${API_BASE_URL}. Start the server and check the Vite proxy. ${err.message || ""}`);
    }

    const backendData = yield backendRes.json().catch(() => ({}));
    if (!backendRes.ok) {
      const details = [backendData?.error, backendData?.details].filter(Boolean).join(" — ");
      throw new Error(details || `Batch try-on request failed (HTTP ${backendRes.status}).`);
    }
    if (backendData?.debug)
      console.log("[try-on debug] what the backend sent to Nano Banana:", backendData.debug);
    if (!backendData?.results || !Array.isArray(backendData.results)) {
      throw new Error("The backend did not return batch results. Check the backend logs, NanoBananaAPI key, credits, and public HTTPS image URL.");
    }

    const resultsMap = {};
    backendData.results.forEach((r) => {
      if (r.productId && r.dataUrl) {
        resultsMap[r.productId] = r.dataUrl;
      }
    });

    return resultsMap;
  });
}

export default function App() {
    var _a;
    const [catalog, setCatalog] = (0, import_react3.useState)([]);
    const [isCatalogLoading, setIsCatalogLoading] = (0, import_react3.useState)(true);
    const [isAddProductOpen, setIsAddProductOpen] = (0, import_react3.useState)(false);
    const [addProductForm, setAddProductForm] = (0, import_react3.useState)({ brand: "", name: "", category: "Women", price: "", originalPrice: "" });
    const [addProductImage, setAddProductImage] = (0, import_react3.useState)(null);
    const [isAddingProduct, setIsAddingProduct] = (0, import_react3.useState)(false);
    const [addProductError, setAddProductError] = (0, import_react3.useState)("");
    const toClientProduct = (p) => __spreadProps(__spreadValues({}, p), { id: p.productId, defaultImage: resolveProductImage(p.defaultImage) });
    (0, import_react3.useEffect)(() => {
      let cancelled = false;
      fetch(`${API_BASE_URL}/products`)
        .then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
        .then((data) => {
          if (cancelled || !Array.isArray(data?.products))
            return;
          setCatalog(data.products.map(toClientProduct));
        })
        .catch((err) => console.warn("Could not load the catalog from the backend:", err.message))
        .finally(() => { if (!cancelled) setIsCatalogLoading(false); });
      return () => { cancelled = true; };
    }, []);
    const [profiles, setProfiles] = (0, import_react3.useState)([]);
    const [activeProfileId, setActiveProfileId] = (0, import_react3.useState)(null);
    const [userProfile, setUserProfile] = (0, import_react3.useState)(null);
    const [isProfileManagerOpen, setIsProfileManagerOpen] = (0, import_react3.useState)(false);
    const [isCacheRestored, setIsCacheRestored] = (0, import_react3.useState)(false);
    const [userFace, setUserFace] = (0, import_react3.useState)(null);
    const [isFaceStudioOpen, setIsFaceStudioOpen] = (0, import_react3.useState)(false);
    const [pendingUploadCategory, setPendingUploadCategory] = (0, import_react3.useState)(null);
    const [generatedImages, setGeneratedImages] = (0, import_react3.useState)({});
    const [loadingMap, setLoadingMap] = (0, import_react3.useState)({});
    const [showOriginalMap, setShowOriginalMap] = (0, import_react3.useState)({});
    const [isBatchGenerating, setIsBatchGenerating] = (0, import_react3.useState)(false);
    const [batchProgress, setBatchProgress] = (0, import_react3.useState)({ done: 0, total: 0 });
    const activeGenerationRunRef = (0, import_react3.useRef)(0);
    // Set when the customer pressed Try On before uploading a photo; the page is generated once the photo arrives.
    const pendingPageTryOnRef = (0, import_react3.useRef)(false);
    const pendingFaceSwapProductRef = (0, import_react3.useRef)(null);
    const [selectedCategory, setSelectedCategory] = (0, import_react3.useState)("Women");
    const [searchQuery, setSearchQuery] = (0, import_react3.useState)("");
    const [currentPage, setCurrentPage] = (0, import_react3.useState)(1);
    const itemsPerPage = 8;
    const [wishlist, setWishlist] = (0, import_react3.useState)([1, 25]);
    const [bag, setBag] = (0, import_react3.useState)([]);
    const [isBagOpen, setIsBagOpen] = (0, import_react3.useState)(false);
    const [activeModalProduct, setActiveModalProduct] = (0, import_react3.useState)(null);
    const [selectedSize, setSelectedSize] = (0, import_react3.useState)("M");
    const [toastMessage, setToastMessage] = (0, import_react3.useState)("");
    const toastTimerRef = (0, import_react3.useRef)(null);
    const [isCameraActive, setIsCameraActive] = (0, import_react3.useState)(false);
    const fileInputRef = (0, import_react3.useRef)(null);
    const videoRef = (0, import_react3.useRef)(null);
    const streamRef = (0, import_react3.useRef)(null);
    const [isSignupModalOpen, setIsSignupModalOpen] = (0, import_react3.useState)(false);
    const [editingProfileId, setEditingProfileId] = (0, import_react3.useState)(null);
    const [signupError, setSignupError] = (0, import_react3.useState)("");
    const [signupForm, setSignupForm] = (0, import_react3.useState)({
      fullName: "",
      email: "",
      gender: "Female",
      heightCm: "165",
      weightKg: "58",
      chestInches: "34",
      waistInches: "28",
      hipInches: "36",
      bodyType: "Regular",
      photoData: null
    });
    const signupFileInputRef = (0, import_react3.useRef)(null);
    const showToast = (msg) => {
      setToastMessage(msg);
      if (toastTimerRef.current)
        clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setToastMessage("");
      }, 4e3);
    };
    const getHomeCategoryForProfile = (prof) => {
      if (!prof)
        return "Women";
      if (prof.gender === "Male")
        return "Men";
      if (prof.gender === "Kids")
        return "Kids";
      return "Women";
    };
    // Old stock "sample" faces that were saved in earlier versions are ignored: only real uploads count.
    const realFaceOnly = (f) => f && !/\(Sample (Female|Male|Kids) Face\)/.test(String(f.label || "")) ? f : null;
    const getFaceForCategory = (prof, category) => {
      if (!prof)
        return null;
      const catFaces = prof.categoryFaces || {};
      const homeCat = getHomeCategoryForProfile(prof);
      if (category === "All") {
        return realFaceOnly(catFaces[homeCat]) || realFaceOnly(prof.photoData) || null;
      }
      if (category === homeCat) {
        return realFaceOnly(prof.photoData) || realFaceOnly(catFaces[homeCat]) || null;
      }
      return realFaceOnly(catFaces[category]);
    };
    const activateSavedProfile = (profile, announce = true) => __async(this, null, function* () {
      var _a2;
      if (!profile)
        return;
      activeGenerationRunRef.current += 1;
      setLoadingMap({});
      setIsBatchGenerating(false);
      const homeCategory = getHomeCategoryForProfile(profile);
      let primaryPhoto = realFaceOnly(profile.photoData) || realFaceOnly((_a2 = profile.categoryFaces) == null ? void 0 : _a2[homeCategory]) || null;
      const normalizedProfile = __spreadProps(__spreadValues({}, profile), {
        photoData: primaryPhoto,
        categoryFaces: __spreadProps(__spreadValues({}, profile.categoryFaces || {}), {
          [homeCategory]: primaryPhoto
        })
      });
      yield dbSaveProfile(normalizedProfile);
      setProfiles(
        (prev) => prev.map((p) => p.id === normalizedProfile.id ? normalizedProfile : p)
      );
      setActiveProfileId(normalizedProfile.id);
      setUserProfile(normalizedProfile);
      yield dbSetMeta("activeProfileId", normalizedProfile.id);
      const cachedImgs = yield dbGetGeneratedImagesForProfile(normalizedProfile.id);
      setGeneratedImages(cachedImgs || {});
      setShowOriginalMap({});
      setSelectedCategory(homeCategory);
      setCurrentPage(1);
      const ownGenderFace = getFaceForCategory(normalizedProfile, homeCategory);
      setUserFace(ownGenderFace);
      setPendingUploadCategory(null);
      setIsFaceStudioOpen(false);
      if (announce) {
        showToast(
          `Active Profile: ${normalizedProfile.fullName} (${normalizedProfile.gender}). Body measurements calibrated for ${homeCategory} outfits!`
        );
      }
    });
    (0, import_react3.useEffect)(() => {
      let mounted = true;
      (() => __async(this, null, function* () {
        try {
          const savedProfiles = yield dbGetAllProfiles();
          const lastActiveId = yield dbGetMeta("activeProfileId");
          if (!mounted)
            return;
          if (savedProfiles.length > 0) {
            setProfiles(savedProfiles);
            const chosen = savedProfiles.find((p) => p.id === lastActiveId) || savedProfiles[0];
            yield activateSavedProfile(chosen, false);
          } else {
            setIsSignupModalOpen(true);
          }
        } catch (e) {
        } finally {
          if (mounted)
            setIsCacheRestored(true);
        }
      }))();
      return () => {
        mounted = false;
      };
    }, []);
    const filteredProducts = (0, import_react3.useMemo)(() => {
      return catalog.filter((item) => {
        const matchesCat = selectedCategory === "All" || item.category === selectedCategory;
        const q = searchQuery.trim().toLowerCase();
        const matchesSearch = !q || item.name.toLowerCase().includes(q) || item.brand.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
        return matchesCat && matchesSearch;
      });
    }, [catalog, selectedCategory, searchQuery]);
    const totalPages = Math.max(1, Math.ceil(filteredProducts.length / itemsPerPage));
    const paginatedProducts = (0, import_react3.useMemo)(() => {
      const start = (currentPage - 1) * itemsPerPage;
      return filteredProducts.slice(start, start + itemsPerPage);
    }, [filteredProducts, currentPage, itemsPerPage]);
    const cachedCountForActiveProfile = (0, import_react3.useMemo)(() => {
      return Object.keys(generatedImages).length;
    }, [generatedImages]);
    const triggerTryOnAllCatalog = (_0, ..._1) => __async(this, [_0, ..._1], function* (faceToUse, categoryOverride = selectedCategory, pageOverride = currentPage, profileOverride = userProfile, existingCache = generatedImages) {
      if (!faceToUse || !faceToUse.base64)
        return;
      const runId = ++activeGenerationRunRef.current;
      const catList = catalog.filter((item) => {
        const matchesCat = categoryOverride === "All" || item.category === categoryOverride;
        const q = searchQuery.trim().toLowerCase();
        const matchesSearch = !q || item.name.toLowerCase().includes(q) || item.brand.toLowerCase().includes(q);
        return matchesCat && matchesSearch;
      });
      const startIdx = (pageOverride - 1) * itemsPerPage;
      const pageItems = catList.slice(startIdx, startIdx + itemsPerPage);
      const itemsToGenerate = pageItems.filter((item) => !existingCache[item.id] && !loadingMap[item.id]);
      if (itemsToGenerate.length === 0) {
        setIsBatchGenerating(false);
        return;
      }
      setIsBatchGenerating(true);
      setBatchProgress({ done: 0, total: itemsToGenerate.length });
      setLoadingMap((prev) => {
        const next = __spreadValues({}, prev);
        itemsToGenerate.forEach((p) => {
          next[p.id] = runId;
        });
        return next;
      });
      // Clear spinners owned by this run only, so a newer run's spinners are left alone.
      const clearLoading = (items) => setLoadingMap((prev) => {
        const next = __spreadValues({}, prev);
        items.forEach((p) => {
          if (next[p.id] === runId) delete next[p.id];
        });
        return next;
      });
      let completed = 0;
      let failed = 0;
      let lastGenerationError = "";

      // 4 products per AI request: merged into a 2x2 grid, generated, then cropped back per card.
      const batches = [];
      for (let i = 0; i < itemsToGenerate.length; i += 4) {
        batches.push(itemsToGenerate.slice(i, i + 4));
      }

      for (const batch of batches) {
        if (activeGenerationRunRef.current !== runId)
          break;
        try {
          const batchResults = yield generateBatchTryOn(
            faceToUse.base64,
            faceToUse.mimeType,
            batch,
            profileOverride
          );
          if (activeGenerationRunRef.current !== runId)
            break;
          Object.entries(batchResults).forEach(([productIdStr, dataUrl]) => {
            const productId = Number(productIdStr);
            setGeneratedImages((prev) => __spreadProps(__spreadValues({}, prev), { [productId]: dataUrl }));
            setShowOriginalMap((prev) => __spreadProps(__spreadValues({}, prev), { [productId]: false }));
            if (profileOverride == null ? void 0 : profileOverride.id) {
              dbSaveGeneratedImage(profileOverride.id, productId, dataUrl);
            }
          });
          const returned = batch.filter((product) => batchResults[product.id]).length;
          completed += returned;
          if (returned < batch.length) {
            failed += batch.length - returned;
            lastGenerationError = "The backend returned fewer images than requested.";
          }
        } catch (err) {
          failed += batch.length;
          lastGenerationError = err?.message || String(err);
          console.error("Batch virtual try-on generation failed:", err);
        }
        clearLoading(batch);
        if (activeGenerationRunRef.current === runId) {
          setBatchProgress({ done: completed, total: itemsToGenerate.length });
        }
      }
      clearLoading(itemsToGenerate);

      if (activeGenerationRunRef.current === runId) {
        setIsBatchGenerating(false);
        if (failed > 0) {
          showToast(`Batch AI generation failed for ${failed} item(s): ${String(lastGenerationError || "Check backend logs.").slice(0, 150)}`);
        } else if (completed > 0) {
          showToast(`✓ Generated ${completed} body-calibrated try-ons in ${batches.length} AI request(s)!`);
        }
      }
    });
    const getRecommendedSize = () => {
      if (!userProfile)
        return "M";
      const chest = parseFloat(userProfile.chestInches) || 36;
      const waist = parseFloat(userProfile.waistInches) || 30;
      const hip = parseFloat(userProfile.hipInches) || 37;
      const weight = parseFloat(userProfile.weightKg) || 60;
      const compositeScore = chest * 0.5 + waist * 0.3 + hip * 0.2 + (weight - 60) * 0.08;
      if (compositeScore < 31.5)
        return "XS";
      if (compositeScore < 34.5)
        return "S";
      if (compositeScore < 38)
        return "M";
      if (compositeScore < 41.5)
        return "L";
      return "XL";
    };
    const activeBodyMeta = (0, import_react3.useMemo)(() => {
      return buildBodyMeasurementProfile(userProfile, selectedCategory);
    }, [userProfile, selectedCategory]);
    const signupPreviewBodyMeta = (0, import_react3.useMemo)(() => {
      return buildBodyMeasurementProfile(
        signupForm,
        signupForm.gender === "Male" ? "Men" : "Women"
      );
    }, [signupForm]);
    const handleOpenEditCurrentProfile = () => {
      if (!userProfile) {
        handleOpenAddNewProfile("Female");
        return;
      }
      setEditingProfileId(userProfile.id);
      setSignupError("");
      setSignupForm({
        fullName: userProfile.fullName || "",
        email: userProfile.email || "",
        gender: userProfile.gender || "Female",
        heightCm: String(userProfile.heightCm || "165"),
        weightKg: String(userProfile.weightKg || "58"),
        chestInches: String(userProfile.chestInches || "34"),
        waistInches: String(userProfile.waistInches || "28"),
        hipInches: String(userProfile.hipInches || "36"),
        bodyType: userProfile.bodyType || "Regular",
        photoData: userProfile.photoData || null
      });
      setIsSignupModalOpen(true);
    };
    const applyTryOnStudioFace = (newFace) => __async(this, null, function* () {
      const targetCat = pendingUploadCategory || (selectedCategory === "All" ? getHomeCategoryForProfile(userProfile) : selectedCategory);
      setUserFace(newFace);
      setIsFaceStudioOpen(false);
      setPendingUploadCategory(null);
      let updatedProfile = userProfile;
      let updatedCache = __spreadValues({}, generatedImages);
      if (userProfile) {
        const homeCat = getHomeCategoryForProfile(userProfile);
        const nextCategoryFaces = __spreadProps(__spreadValues({}, userProfile.categoryFaces || {}), {
          [targetCat]: newFace
        });
        updatedProfile = __spreadProps(__spreadValues({}, userProfile), {
          photoData: targetCat === homeCat ? newFace : userProfile.photoData,
          categoryFaces: nextCategoryFaces
        });
        setUserProfile(updatedProfile);
        setProfiles(
          (prev) => prev.map((p) => p.id === updatedProfile.id ? updatedProfile : p)
        );
        yield dbSaveProfile(updatedProfile);
        const categoryProductIds = catalog.filter(
          (p) => p.category === targetCat
        ).map((p) => p.id);
        categoryProductIds.forEach((pid) => {
          delete updatedCache[pid];
        });
        setGeneratedImages(updatedCache);
      }
      if (selectedCategory !== targetCat) {
        setSelectedCategory(targetCat);
        setCurrentPage(1);
      }
      if (pendingFaceSwapProductRef.current) {
        const pendingProduct = pendingFaceSwapProductRef.current;
        pendingFaceSwapProductRef.current = null;
        showToast(`Saved ${targetCat} Photo! Swapping your face on this outfit...`);
        runSingleFaceSwap(newFace, pendingProduct, updatedProfile);
      } else if (pendingPageTryOnRef.current) {
        pendingPageTryOnRef.current = false;
        showToast(`Saved ${targetCat} Photo! Generating try-ons for this page...`);
        triggerTryOnAllCatalog(
          newFace,
          targetCat,
          selectedCategory === targetCat ? currentPage : 1,
          updatedProfile,
          updatedCache
        );
      } else {
        showToast(`Saved ${targetCat} Photo! Tap "Try On" at the top to see this page's outfits on you.`);
      }
    });
    const handleFileChange = (e) => __async(this, null, function* () {
      var _a2;
      const file = (_a2 = e.target.files) == null ? void 0 : _a2[0];
      if (!file)
        return;
      const reader = new FileReader();
      reader.onload = () => __async(this, null, function* () {
        try {
          const normalized = yield normalizeImageToJpeg(reader.result, 768);
          const newFace = {
            previewUrl: normalized.dataUrl,
            base64: normalized.base64,
            mimeType: "image/jpeg",
            label: file.name
          };
          yield applyTryOnStudioFace(newFace);
        } catch (err) {
          showToast("Please select a valid image photo.");
        }
      });
      reader.readAsDataURL(file);
    });
    const handleSignupPhotoUpload = (e) => {
      var _a2;
      const file = (_a2 = e.target.files) == null ? void 0 : _a2[0];
      if (!file)
        return;
      setSignupError("");
      const reader = new FileReader();
      reader.onload = () => __async(this, null, function* () {
        try {
          const normalized = yield normalizeImageToJpeg(reader.result, 768);
          setSignupForm((prev) => __spreadProps(__spreadValues({}, prev), {
            photoData: {
              previewUrl: normalized.dataUrl,
              base64: normalized.base64,
              mimeType: "image/jpeg",
              label: file.name
            }
          }));
          showToast("Photo uploaded for your Sign-Up profile!");
        } catch (err) {
          showToast("Please upload a valid image file.");
        }
      });
      reader.readAsDataURL(file);
    };
    const startWebcam = () => __async(this, null, function* () {
      try {
        const stream = yield navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } }
        });
        streamRef.current = stream;
        setIsCameraActive(true);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        }, 100);
      } catch (err) {
        showToast("Camera access unavailable. Please upload a photo file.");
      }
    });
    const stopWebcam = () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setIsCameraActive(false);
    };
    const captureWebcamPhoto = () => __async(this, null, function* () {
      if (!videoRef.current)
        return;
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 640;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      stopWebcam();
      const newFace = {
        previewUrl: dataUrl,
        base64: dataUrl.split(",")[1],
        mimeType: "image/jpeg",
        label: "Live Camera Selfie"
      };
      yield applyTryOnStudioFace(newFace);
    });
    const handleSelectGenderInSignup = (newGender) => {
      setSignupForm((prev) => __spreadProps(__spreadValues({}, prev), {
        gender: newGender,
        heightCm: newGender === "Male" ? "176" : "165",
        weightKg: newGender === "Male" ? "72" : "58",
        chestInches: newGender === "Male" ? "40" : "34",
        waistInches: newGender === "Male" ? "32" : "28",
        hipInches: newGender === "Male" ? "38" : "36"
      }));
    };
    const handleSignupSubmit = (e) => __async(this, null, function* () {
      e.preventDefault();
      setSignupError("");
      if (!signupForm.fullName.trim()) {
        setSignupError("Please enter your Full Name.");
        showToast("Please enter your Full Name.");
        return;
      }
      if (!signupForm.photoData) {
        setSignupError("Please upload your face photo to complete Sign Up.");
        showToast("Please upload your photo during Sign Up.");
        return;
      }
      const profileId = editingProfileId || `profile_${Date.now()}`;
      const homeCategory = signupForm.gender === "Male" ? "Men" : "Women";
      const existingProf = profiles.find((p) => p.id === profileId);
      const savedProfile = __spreadProps(__spreadValues({}, signupForm), {
        id: profileId,
        categoryFaces: __spreadProps(__spreadValues({}, (existingProf == null ? void 0 : existingProf.categoryFaces) || {}), {
          [homeCategory]: signupForm.photoData
        }),
        createdAt: (existingProf == null ? void 0 : existingProf.createdAt) || Date.now()
      });
      yield dbSaveProfile(savedProfile);
      yield dbClearProfileImages(profileId);
      yield dbSetMeta("activeProfileId", profileId);
      setProfiles((prev) => {
        const exists = prev.some((p) => p.id === profileId);
        if (exists) {
          return prev.map((p) => p.id === profileId ? savedProfile : p);
        }
        return [savedProfile, ...prev];
      });
      setActiveProfileId(profileId);
      setUserProfile(savedProfile);
      setEditingProfileId(null);
      setIsSignupModalOpen(false);
      activeGenerationRunRef.current += 1;
      setLoadingMap({});
      setIsBatchGenerating(false);
      setGeneratedImages({});
      setShowOriginalMap({});
      setCurrentPage(1);
      setSelectedCategory(homeCategory);
      setUserFace(savedProfile.photoData);
      setPendingUploadCategory(null);
      showToast(
        `Welcome ${savedProfile.fullName}! Profile saved \u2014 tap "Try On" at the top to see this page's outfits on you.`
      );
    });
    const handleOpenAddNewProfile = (defaultGender = "Female") => {
      setEditingProfileId(null);
      setSignupError("");
      setSignupForm({
        fullName: "",
        email: "",
        gender: defaultGender,
        heightCm: defaultGender === "Male" ? "176" : "165",
        weightKg: defaultGender === "Male" ? "72" : "58",
        chestInches: defaultGender === "Male" ? "40" : "34",
        waistInches: defaultGender === "Male" ? "32" : "28",
        hipInches: defaultGender === "Male" ? "38" : "36",
        bodyType: "Regular",
        photoData: null
      });
      setIsProfileManagerOpen(false);
      setIsSignupModalOpen(true);
    };
    const handleDeleteProfile = (profId) => __async(this, null, function* () {
      yield dbDeleteProfile(profId);
      const remaining = profiles.filter((p) => p.id !== profId);
      setProfiles(remaining);
      if (activeProfileId === profId) {
        if (remaining.length > 0) {
          yield activateSavedProfile(remaining[0], true);
        } else {
          setActiveProfileId(null);
          setUserProfile(null);
          setUserFace(null);
          setGeneratedImages({});
          setPendingUploadCategory(null);
        }
      }
      showToast("Profile removed.");
    });
    const handlePageChange = (newPage) => {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const handleCategoryChange = (newCategory) => {
      setSelectedCategory(newCategory);
      setCurrentPage(1);
      setIsFaceStudioOpen(false);
      setPendingUploadCategory(null);
      pendingPageTryOnRef.current = false;
      if (!userProfile)
        return;
      const savedCategoryFace = getFaceForCategory(userProfile, newCategory);
      if (savedCategoryFace) {
        setUserFace(savedCategoryFace);
      } else {
        setUserFace(null);
      }
    };
    const openAddProduct = () => {
      setAddProductForm({ brand: "", name: "", category: selectedCategory === "All" ? "Women" : selectedCategory, price: "", originalPrice: "" });
      setAddProductImage(null);
      setAddProductError("");
      setIsAddProductOpen(true);
    };
    const handleAddProductFile = (e) => __async(this, null, function* () {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file)
        return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setAddProductError("Please choose a JPEG, PNG or WEBP image.");
        return;
      }
      try {
        const raw = yield new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Could not read the file."));
          reader.readAsDataURL(file);
        });
        const norm = yield normalizeImageToJpeg(raw, 1400);
        setAddProductImage(norm.dataUrl);
        setAddProductError("");
      } catch (err) {
        setAddProductError(err?.message || "Could not read that image.");
      }
    });
    const handleSubmitAddProduct = () => __async(this, null, function* () {
      const f = addProductForm;
      if (!addProductImage)
        return setAddProductError("Choose a photo first.");
      if (!f.brand.trim() || !f.name.trim())
        return setAddProductError("Brand and name are required.");
      if (f.price === "" || Number(f.price) < 0 || Number.isNaN(Number(f.price)))
        return setAddProductError("Enter a valid price.");
      setIsAddingProduct(true);
      setAddProductError("");
      try {
        const res = yield fetch(`${API_BASE_URL}/products`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: addProductImage,
            brand: f.brand,
            name: f.name,
            category: f.category,
            price: Number(f.price),
            originalPrice: f.originalPrice === "" ? undefined : Number(f.originalPrice)
          })
        });
        const data = yield res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(data?.error || `Could not add the product (HTTP ${res.status}).`);
        setCatalog((prev) => [...prev, toClientProduct(data)]);
        setIsAddProductOpen(false);
        showToast("\u2713 Product added!");
      } catch (err) {
        setAddProductError(err?.message || "Could not add the product.");
      } finally {
        setIsAddingProduct(false);
      }
    });
    const handleDeleteProduct = (product, e) => __async(this, null, function* () {
      if (e)
        e.stopPropagation();
      if (!window.confirm(`Remove "${product.brand} - ${product.name}" from the catalog?`))
        return;
      try {
        const res = yield fetch(`${API_BASE_URL}/products/${product.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = yield res.json().catch(() => ({}));
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        setCatalog((prev) => prev.filter((p) => p.id !== product.id));
        setGeneratedImages((prev) => {
          const next = __spreadValues({}, prev);
          delete next[product.id];
          return next;
        });
        showToast("Product removed.");
      } catch (err) {
        showToast(`Could not remove the product: ${String(err?.message || err).slice(0, 120)}`);
      }
    });
    // Face swap for ONE catalog card: only this product's photo goes to Nano Banana with the user's face.
    const runSingleFaceSwap = (faceToUse, product, profile) => __async(this, null, function* () {
      setLoadingMap((prev) => __spreadProps(__spreadValues({}, prev), { [product.id]: "single" }));
      try {
        const results = yield generateBatchTryOn(faceToUse.base64, faceToUse.mimeType, [product], profile);
        const dataUrl = results[product.id];
        if (!dataUrl)
          throw new Error("The backend returned no image for this product.");
        setGeneratedImages((prev) => __spreadProps(__spreadValues({}, prev), { [product.id]: dataUrl }));
        setShowOriginalMap((prev) => __spreadProps(__spreadValues({}, prev), { [product.id]: false }));
        if (profile == null ? void 0 : profile.id)
          dbSaveGeneratedImage(profile.id, product.id, dataUrl);
        showToast("\u2713 Face swap done!");
      } catch (err) {
        console.error("Single face swap failed:", err);
        showToast(`Face swap failed: ${String(err?.message || err).slice(0, 150)}`);
      } finally {
        setLoadingMap((prev) => {
          const next = __spreadValues({}, prev);
          delete next[product.id];
          return next;
        });
      }
    });
    const handleCardFaceSwap = (product, e) => {
      if (e)
        e.stopPropagation();
      if (!userProfile) {
        setIsSignupModalOpen(true);
        return;
      }
      const face = getFaceForCategory(userProfile, product.category);
      if (!face) {
        pendingFaceSwapProductRef.current = product;
        setSelectedCategory(product.category);
        setPendingUploadCategory(product.category);
        setIsFaceStudioOpen(true);
        showToast(`Upload a photo for ${product.category} to face swap!`);
        return;
      }
      runSingleFaceSwap(face, product, userProfile);
    };
    const handleTryOnMeClick = () => {
      if (!userProfile) {
        setIsSignupModalOpen(true);
        return;
      }
      const activeCategoryFace = getFaceForCategory(userProfile, selectedCategory);
      if (!activeCategoryFace) {
        pendingPageTryOnRef.current = true;
        setPendingUploadCategory(selectedCategory);
        setIsFaceStudioOpen(true);
        showToast(
          `Upload a photo for ${selectedCategory} to apply your body measurements!`
        );
        return;
      }
      if (userFace !== activeCategoryFace) {
        setUserFace(activeCategoryFace);
      }
      setShowOriginalMap((prev) => {
        const next = __spreadValues({}, prev);
        paginatedProducts.forEach((p) => {
          next[p.id] = false;
        });
        return next;
      });
      const ungeneratedCount = paginatedProducts.filter((p) => !generatedImages[p.id] && !loadingMap[p.id]).length;
      if (ungeneratedCount > 0) {
        triggerTryOnAllCatalog(
          activeCategoryFace,
          selectedCategory,
          currentPage,
          userProfile,
          generatedImages
        );
      } else {
        showToast(
          `\u2713 All ${paginatedProducts.length} ${selectedCategory} outfits on Page ${currentPage} calibrated to your body measurements!`
        );
      }
    };
    const toggleWishlist = (id, e) => {
      if (e)
        e.stopPropagation();
      setWishlist(
        (prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
      );
    };
    const addToBag = (product, size = "M", e) => {
      if (e)
        e.stopPropagation();
      setBag((prev) => {
        const existing = prev.find(
          (item) => item.id === product.id && item.size === size
        );
        if (existing) {
          return prev.map(
            (item) => item.id === product.id && item.size === size ? __spreadProps(__spreadValues({}, item), { qty: item.qty + 1 }) : item
          );
        }
        return [...prev, __spreadProps(__spreadValues({}, product), { size, qty: 1 })];
      });
      showToast(`Added ${product.brand} (${size}) to Shopping Bag!`);
    };
    const updateBagQty = (id, size, delta) => {
      setBag(
        (prev) => prev.map(
          (item) => item.id === id && item.size === size ? __spreadProps(__spreadValues({}, item), { qty: Math.max(0, item.qty + delta) }) : item
        ).filter((item) => item.qty > 0)
      );
    };
    const bagTotal = bag.reduce((sum, item) => sum + item.price * item.qty, 0);
    return /* @__PURE__ */ import_react3.default.createElement("div", { className: "min-h-screen bg-[#fafafa] text-slate-900 font-sans pb-16" }, toastMessage && /* @__PURE__ */ import_react3.default.createElement("div", { className: "fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-pink-500/40 flex items-center gap-2.5 text-xs sm:text-sm font-bold animate-bounce" }, /* @__PURE__ */ import_react3.default.createElement(Sparkles, { className: "w-4 h-4 text-[#ff3f6c] shrink-0" }), /* @__PURE__ */ import_react3.default.createElement("span", null, toastMessage)), /* @__PURE__ */ import_react3.default.createElement("div", { className: "bg-gradient-to-r from-[#ff3f6c] via-[#ff527b] to-[#ff7555] text-white text-xs sm:text-sm py-2 px-4 text-center font-medium flex items-center justify-center gap-2 shadow-sm" }, /* @__PURE__ */ import_react3.default.createElement(Sparkles, { className: "w-4 h-4 animate-pulse shrink-0" }), /* @__PURE__ */ import_react3.default.createElement("span", null, /* @__PURE__ */ import_react3.default.createElement("strong", null, "MYNTRA AI ANTHROPOMETRIC FIT:"), " Your height, weight, and body measurements are automatically factored into every Try-On generation!")), /* @__PURE__ */ import_react3.default.createElement("header", { className: "sticky top-0 z-40 bg-white shadow-sm border-b border-slate-100" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-6 lg:gap-8" }, /* @__PURE__ */ import_react3.default.createElement(
      "div",
      {
        onClick: () => handleCategoryChange(getHomeCategoryForProfile(userProfile)),
        className: "flex items-center gap-2 cursor-pointer group"
      },
      /* @__PURE__ */ import_react3.default.createElement("div", { className: "w-11 h-11 rounded-xl bg-gradient-to-tr from-[#ff3f6c] to-[#ff905a] flex items-center justify-center shadow-md group-hover:scale-105 transition-transform" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-white font-black text-2xl tracking-tighter" }, "M")),
      /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex flex-col" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-1" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "font-extrabold text-xl tracking-tight text-slate-900" }, "myntra"), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-pink-100 text-[#ff3f6c]" }, "AI Fit")), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[10px] text-slate-400 font-medium -mt-1" }, "Body-Calibrated Virtual Try-On"))
    ), /* @__PURE__ */ import_react3.default.createElement("nav", { className: "hidden md:flex items-center gap-6 text-sm font-bold tracking-wide text-slate-700 uppercase" }, [
      { label: `Women (${catalog.filter((p) => p.category === "Women").length})`, value: "Women" },
      { label: `Men (${catalog.filter((p) => p.category === "Men").length})`, value: "Men" },
      { label: `Kids (${catalog.filter((p) => p.category === "Kids").length})`, value: "Kids" }
    ].map((cat) => /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        key: cat.value,
        onClick: () => handleCategoryChange(cat.value),
        className: `py-7 border-b-4 transition-colors cursor-pointer ${selectedCategory === cat.value ? "border-[#ff3f6c] text-[#ff3f6c]" : "border-transparent hover:border-slate-200 text-slate-700"}`
      },
      cat.label
    )))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex-1 max-w-md hidden sm:block" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "relative" }, /* @__PURE__ */ import_react3.default.createElement(Search, { className: "w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" }), /* @__PURE__ */ import_react3.default.createElement(
      "input",
      {
        type: "text",
        value: searchQuery,
        onChange: (e) => {
          setSearchQuery(e.target.value);
          setCurrentPage(1);
        },
        placeholder: "Search styles, brands...",
        className: "w-full pl-10 pr-4 py-2.5 bg-[#f5f5f6] focus:bg-white text-sm rounded-lg border border-transparent focus:border-slate-300 focus:outline-none transition-all"
      }
    ), searchQuery && /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => {
          setSearchQuery("");
          setCurrentPage(1);
        },
        className: "absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      },
      /* @__PURE__ */ import_react3.default.createElement(X, { className: "w-4 h-4" })
    ))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-2.5 sm:gap-3" }, /* @__PURE__ */ import_react3.default.createElement("button", { onClick: openAddProduct, title: "Add your own product photo", className: "flex items-center gap-1.5 px-3 py-2 rounded-full border-2 border-slate-800 text-slate-800 hover:bg-slate-800 hover:text-white font-extrabold text-xs sm:text-sm transition-colors cursor-pointer" }, /* @__PURE__ */ import_react3.default.createElement(Plus, { className: "w-4 h-4" }), /* @__PURE__ */ import_react3.default.createElement("span", null, "Add Product")), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: handleTryOnMeClick,
        className: `flex items-center gap-2 px-3.5 py-2 rounded-full font-extrabold text-xs sm:text-sm shadow-md transition-all cursor-pointer active:scale-95 ${!userFace ? "bg-gradient-to-r from-[#ff3f6c] to-[#ff7555] text-white ring-2 ring-pink-200 hover:opacity-95" : "bg-gradient-to-r from-[#ff3f6c] to-[#ff7555] hover:opacity-95 text-white"}`
      },
      userFace ? /* @__PURE__ */ import_react3.default.createElement(
        "img",
        {
          src: userFace.previewUrl,
          alt: "Active Face",
          className: "w-5 h-5 rounded-full object-cover border border-white"
        }
      ) : /* @__PURE__ */ import_react3.default.createElement(Sparkles, { className: "w-4 h-4" }),
      /* @__PURE__ */ import_react3.default.createElement("span", null, isBatchGenerating ? `Generating (${batchProgress.done}/${batchProgress.total})...` : "Try On Me")
    ), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => {
          setPendingUploadCategory(selectedCategory);
          setIsFaceStudioOpen(true);
        },
        title: `Change photo for ${selectedCategory}`,
        className: "p-2 rounded-full bg-pink-50 text-[#ff3f6c] hover:bg-pink-100 transition-colors cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(Camera, { className: "w-4 h-4" })
    ), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => userProfile ? setIsProfileManagerOpen(true) : setIsSignupModalOpen(true),
        className: "flex flex-col items-center text-slate-700 hover:text-[#ff3f6c] transition-colors px-2 cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(UserCheck, { className: "w-5 h-5" }),
      /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[10px] font-bold mt-0.5 max-w-[68px] truncate" }, userProfile ? userProfile.fullName.split(" ")[0] : "Sign Up")
    ), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => setIsBagOpen(true),
        className: "relative flex flex-col items-center text-slate-700 hover:text-[#ff3f6c] transition-colors px-2 cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(ShoppingBag, { className: "w-5 h-5" }),
      /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[10px] font-bold mt-0.5" }, "Bag"),
      bag.length > 0 && /* @__PURE__ */ import_react3.default.createElement("span", { className: "absolute -top-1 right-1 w-4 h-4 rounded-full bg-[#ff3f6c] text-white text-[10px] font-extrabold flex items-center justify-center" }, bag.reduce((s, i) => s + i.qty, 0))
    )))), /* @__PURE__ */ import_react3.default.createElement("section", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-4" }, userProfile ? /* @__PURE__ */ import_react3.default.createElement("div", { className: "mb-4 p-3.5 rounded-xl bg-gradient-to-r from-pink-50 via-white to-orange-50 border border-pink-200/80 flex flex-wrap items-center justify-between gap-3 shadow-xs" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ import_react3.default.createElement(
      "img",
      {
        src: (userFace == null ? void 0 : userFace.previewUrl) || ((_a = userProfile.photoData) == null ? void 0 : _a.previewUrl),
        alt: userProfile.fullName,
        className: "w-12 h-12 rounded-full object-cover border-2 border-[#ff3f6c]"
      }
    ), /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-xs font-extrabold text-slate-900" }, userProfile.fullName), /* @__PURE__ */ import_react3.default.createElement(
      "span",
      {
        className: `text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${userProfile.gender === "Female" ? "bg-pink-100 text-[#ff3f6c]" : "bg-blue-100 text-blue-800"}`
      },
      userProfile.gender,
      " Profile (",
      getHomeCategoryForProfile(userProfile),
      ")"
    ), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800" }, "Fit Size: ", getRecommendedSize()), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 flex items-center gap-1" }, /* @__PURE__ */ import_react3.default.createElement(Database, { className: "w-3 h-3 text-teal-600" }), "Calibrated Outfits: ", cachedCountForActiveProfile)), /* @__PURE__ */ import_react3.default.createElement("p", { className: "text-[11px] text-slate-500 mt-1" }, "Height: ", /* @__PURE__ */ import_react3.default.createElement("strong", null, userProfile.heightCm, " cm"), " \u2022 Weight:", " ", /* @__PURE__ */ import_react3.default.createElement("strong", null, userProfile.weightKg, " kg"), " \u2022 Measurements:", " ", /* @__PURE__ */ import_react3.default.createElement("strong", null, userProfile.chestInches, '" - ', userProfile.waistInches, '" -', " ", userProfile.hipInches, '"'), " ", "(", userProfile.bodyType, ") \u2022 BMI:", " ", /* @__PURE__ */ import_react3.default.createElement("strong", null, activeBodyMeta.bmi || "--"), " (", activeBodyMeta.silhouetteDesc || "Proportional Fit", ")"))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: handleOpenEditCurrentProfile,
        className: "px-3 py-1.5 rounded-lg bg-teal-50 border border-teal-200 hover:bg-teal-100 text-xs font-bold text-teal-800 flex items-center gap-1.5 cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(Ruler, { className: "w-3.5 h-3.5 text-teal-600" }),
      "Edit Body Measurements"
    ), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => setIsProfileManagerOpen(true),
        className: "px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-[#ff3f6c] text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(Users, { className: "w-3.5 h-3.5 text-[#ff3f6c]" }),
      "Switch Profile (",
      profiles.length,
      ")"
    ), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => handleOpenAddNewProfile("Female"),
        className: "px-3 py-1.5 rounded-lg bg-pink-50 hover:bg-pink-100 text-xs font-bold text-[#ff3f6c] flex items-center gap-1 cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(Plus, { className: "w-3.5 h-3.5" }),
      "New Profile"
    ))) : /* @__PURE__ */ import_react3.default.createElement("div", { className: "mb-4 p-4 rounded-xl bg-gradient-to-r from-pink-50 to-orange-50 border border-pink-200 flex items-center justify-between gap-4" }, /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("h3", { className: "text-sm font-extrabold text-slate-900" }, "Setup Your Body Measurements & Profile"), /* @__PURE__ */ import_react3.default.createElement("p", { className: "text-xs text-slate-600 mt-0.5" }, "Provide your height, weight, and measurements so the AI generates your virtual try-ons with exact body proportions!")), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => handleOpenAddNewProfile("Female"),
        className: "px-4 py-2 rounded-xl bg-[#ff3f6c] text-white font-extrabold text-xs shadow-sm hover:bg-[#e6355f] shrink-0 cursor-pointer"
      },
      "Set Up Profile"
    )), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-sm font-bold text-slate-800 mr-2 flex items-center gap-1.5" }, /* @__PURE__ */ import_react3.default.createElement(SlidersHorizontal, { className: "w-4 h-4 text-[#ff3f6c]" }), "SHOP FOR:"), [
      { label: `Women (${catalog.filter((p) => p.category === "Women").length})`, value: "Women" },
      { label: `Men (${catalog.filter((p) => p.category === "Men").length})`, value: "Men" },
      { label: `Kids (${catalog.filter((p) => p.category === "Kids").length})`, value: "Kids" }
    ].map((cat) => {
      const hasSavedFaceForTab = Boolean(
        getFaceForCategory(userProfile, cat.value)
      );
      return /* @__PURE__ */ import_react3.default.createElement(
        "button",
        {
          key: cat.value,
          onClick: () => handleCategoryChange(cat.value),
          className: `px-3.5 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${selectedCategory === cat.value ? "bg-[#ff3f6c] text-white shadow-sm" : "bg-white text-slate-700 border border-slate-200 hover:border-slate-300"}`
        },
        /* @__PURE__ */ import_react3.default.createElement("span", null, cat.label),
        hasSavedFaceForTab && /* @__PURE__ */ import_react3.default.createElement(
          "span",
          {
            className: `w-2 h-2 rounded-full ${selectedCategory === cat.value ? "bg-white" : "bg-emerald-500"}`,
            title: "Photo Ready"
          }
        )
      );
    })), /* @__PURE__ */ import_react3.default.createElement("div", { className: "text-xs font-semibold text-slate-500" }, "Showing Page ", /* @__PURE__ */ import_react3.default.createElement("strong", null, currentPage), " of ", /* @__PURE__ */ import_react3.default.createElement("strong", null, totalPages), " (", filteredProducts.length, " styles)"))), /* @__PURE__ */ import_react3.default.createElement("main", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" }, !isCatalogLoading && filteredProducts.length === 0 && /* @__PURE__ */ import_react3.default.createElement("div", { className: "py-20 text-center text-slate-500" }, /* @__PURE__ */ import_react3.default.createElement("p", { className: "font-extrabold text-slate-800 text-lg" }, catalog.length === 0 ? "No products yet" : "No styles match your search"), catalog.length === 0 && /* @__PURE__ */ import_react3.default.createElement("p", { className: "text-sm mt-1" }, "Click \"Add Product\" to upload your own photos."), catalog.length === 0 && /* @__PURE__ */ import_react3.default.createElement("button", { onClick: openAddProduct, className: "mt-4 px-4 py-2 rounded-full bg-[#ff3f6c] text-white font-extrabold text-sm cursor-pointer" }, "Add Product")), /* @__PURE__ */ import_react3.default.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5" }, paginatedProducts.map((product) => {
      const hasGenerated = Boolean(generatedImages[product.id]);
      const loadingStatus = loadingMap[product.id];
      const isPendingOrGenerating = !hasGenerated && Boolean(loadingStatus);
      const showOriginal = Boolean(showOriginalMap[product.id]);
      const displayedImage = hasGenerated && !showOriginal ? generatedImages[product.id] : product.defaultImage;
      const isWishlisted = wishlist.includes(product.id);
      return /* @__PURE__ */ import_react3.default.createElement(
        "div",
        {
          key: product.id,
          onClick: () => {
            setActiveModalProduct(product);
            setSelectedSize(getRecommendedSize());
          },
          className: "group bg-white rounded-2xl overflow-hidden border border-slate-100 hover:border-pink-200 shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col cursor-pointer"
        },
        /* @__PURE__ */ import_react3.default.createElement("div", { className: "relative aspect-[3/4] bg-slate-100 overflow-hidden" }, /* @__PURE__ */ import_react3.default.createElement(
          "img",
          {
            src: displayedImage,
            alt: product.name,
            className: "w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
          }
        ), hasGenerated && !showOriginal && /* @__PURE__ */ import_react3.default.createElement("div", { className: "absolute top-3 left-3 flex flex-col gap-1" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "bg-gradient-to-r from-[#ff3f6c] to-[#ff7555] text-white text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full shadow-md flex items-center gap-1 w-fit" }, /* @__PURE__ */ import_react3.default.createElement(Sparkles, { className: "w-3 h-3" }), "AI Body-Sculpted Fit")), isPendingOrGenerating && /* @__PURE__ */ import_react3.default.createElement("div", { className: "absolute inset-0 bg-slate-900/65 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-center text-white" }, /* @__PURE__ */ import_react3.default.createElement(RefreshCw, { className: "w-7 h-7 text-[#ff3f6c] animate-spin mb-2" }), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-xs font-extrabold tracking-wide uppercase" }, "AI Model Generating..."), /* @__PURE__ */ import_react3.default.createElement("div", { className: "mt-2 px-2.5 py-1.5 rounded-lg bg-black/45 border border-white/15 text-[10px] font-mono text-pink-200 leading-tight" }, "[Catalog Img] + [Face Img] + [Prompt]", /* @__PURE__ */ import_react3.default.createElement("div", { className: "text-teal-300 font-bold mt-0.5" }, "\u2500\u2500\u25BA [AI Model] \u2500\u2500\u25BA [Output]"))), /* @__PURE__ */ import_react3.default.createElement(
          "button",
          {
            onClick: (e) => toggleWishlist(product.id, e),
            className: `absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-colors cursor-pointer ${isWishlisted ? "bg-pink-50 text-[#ff3f6c]" : "bg-white/90 text-slate-600 hover:text-[#ff3f6c]"}`
          },
          /* @__PURE__ */ import_react3.default.createElement(
            Heart,
            {
              className: `w-4 h-4 ${isWishlisted ? "fill-[#ff3f6c]" : ""}`
            }
          )
        ), hasGenerated && /* @__PURE__ */ import_react3.default.createElement(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              setShowOriginalMap((prev) => __spreadProps(__spreadValues({}, prev), {
                [product.id]: !prev[product.id]
              }));
            },
            className: "absolute bottom-3 right-3 bg-slate-900/85 hover:bg-slate-900 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg backdrop-blur-xs flex items-center gap-1 shadow-md cursor-pointer"
          },
          /* @__PURE__ */ import_react3.default.createElement(Eye, { className: "w-3 h-3 text-pink-400" }),
          showOriginal ? "Show My Fit" : "Original Model"
        ), /* @__PURE__ */ import_react3.default.createElement("div", { className: "absolute bottom-3 left-3 bg-white/90 backdrop-blur-xs px-2 py-0.5 rounded-md text-[11px] font-bold text-slate-800 flex items-center gap-1 shadow-xs" }, /* @__PURE__ */ import_react3.default.createElement("span", null, product.rating), /* @__PURE__ */ import_react3.default.createElement(Star, { className: "w-3 h-3 fill-amber-400 text-amber-400" }), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-slate-400" }, "|"), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-slate-500" }, product.reviews))),
        /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-3.5 flex-1 flex flex-col justify-between" }, /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center justify-between gap-2" }, /* @__PURE__ */ import_react3.default.createElement("h3", { className: "font-extrabold text-sm text-slate-900 truncate" }, product.brand), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600" }, product.category)), /* @__PURE__ */ import_react3.default.createElement("p", { className: "text-xs text-slate-500 line-clamp-1 mt-0.5" }, product.name)), /* @__PURE__ */ import_react3.default.createElement("div", { className: "mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-baseline gap-1.5" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "font-extrabold text-sm text-slate-900" }, "\u20B9", product.price), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[11px] text-slate-400 line-through" }, "\u20B9", product.originalPrice), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[11px] font-bold text-orange-500" }, "(", product.discount, ")")), /* @__PURE__ */ import_react3.default.createElement(
          "button",
          {
            onClick: (e) => addToBag(product, getRecommendedSize(), e),
            className: "px-2.5 py-1.5 rounded-lg bg-pink-50 hover:bg-[#ff3f6c] text-[#ff3f6c] hover:text-white text-xs font-extrabold transition-colors flex items-center gap-1 cursor-pointer"
          },
          /* @__PURE__ */ import_react3.default.createElement(ShoppingBag, { className: "w-3.5 h-3.5" }),
          "Add"
        )), /* @__PURE__ */ import_react3.default.createElement("div", { className: "mt-2.5 flex items-center gap-2" }, /* @__PURE__ */ import_react3.default.createElement(
          "button",
          {
            onClick: (e) => handleCardFaceSwap(product, e),
            disabled: Boolean(loadingMap[product.id]),
            title: "Recreate this catalog photo with you in it",
            className: "flex-1 py-2 rounded-lg border-2 border-[#ff3f6c] text-[#ff3f6c] hover:bg-[#ff3f6c] hover:text-white text-xs font-extrabold transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          },
          /* @__PURE__ */ import_react3.default.createElement(UserCheck, { className: "w-3.5 h-3.5" }),
          loadingMap[product.id] ? "Generating..." : "Recreate on Me"
        ), /* @__PURE__ */ import_react3.default.createElement("button", { onClick: (e) => handleDeleteProduct(product, e), title: "Remove this product", className: "p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-300 transition-colors cursor-pointer" }, /* @__PURE__ */ import_react3.default.createElement(Trash2, { className: "w-3.5 h-3.5" }))))
      );
    })), totalPages > 1 && /* @__PURE__ */ import_react3.default.createElement("div", { className: "mt-10 flex items-center justify-center gap-2" }, /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        disabled: currentPage === 1,
        onClick: () => handlePageChange(Math.max(1, currentPage - 1)),
        className: "px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 disabled:opacity-40 hover:border-[#ff3f6c] flex items-center gap-1 cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(ChevronLeft, { className: "w-4 h-4" }),
      "Prev"
    ), Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        key: pageNum,
        onClick: () => handlePageChange(pageNum),
        className: `w-9 h-9 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${currentPage === pageNum ? "bg-[#ff3f6c] text-white shadow-md" : "bg-white border border-slate-200 text-slate-700 hover:border-pink-300"}`
      },
      pageNum
    )), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        disabled: currentPage === totalPages,
        onClick: () => handlePageChange(Math.min(totalPages, currentPage + 1)),
        className: "px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 disabled:opacity-40 hover:border-[#ff3f6c] flex items-center gap-1 cursor-pointer"
      },
      "Next",
      /* @__PURE__ */ import_react3.default.createElement(ChevronRight, { className: "w-4 h-4" })
    ))), isFaceStudioOpen && /* @__PURE__ */ import_react3.default.createElement("div", { className: "fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "bg-gradient-to-r from-slate-900 via-[#2a1225] to-[#461228] text-white p-5 flex items-center justify-between" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-2.5" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "w-9 h-9 rounded-xl bg-[#ff3f6c] flex items-center justify-center shadow" }, /* @__PURE__ */ import_react3.default.createElement(Sparkles, { className: "w-5 h-5 text-white" })), /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("h2", { className: "font-extrabold text-lg leading-none" }, pendingUploadCategory || selectedCategory, " Try-On Photo Upload"), /* @__PURE__ */ import_react3.default.createElement("p", { className: "text-xs text-pink-200 mt-1" }, "Upload a reference face photo to calibrate your body measurements"))), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => {
          stopWebcam();
          setIsFaceStudioOpen(false);
          setPendingUploadCategory(null);
        },
        className: "text-slate-300 hover:text-white p-1 cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(X, { className: "w-5 h-5" })
    )), /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-6 space-y-5" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1.5" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "font-extrabold flex items-center gap-1.5 text-amber-800" }, /* @__PURE__ */ import_react3.default.createElement(Sparkles, { className: "w-4 h-4 text-[#ff3f6c]" }), "Body Measurement Calibration Active"), /* @__PURE__ */ import_react3.default.createElement("p", null, "Your height (", userProfile == null ? void 0 : userProfile.heightCm, "cm), weight (", userProfile == null ? void 0 : userProfile.weightKg, "kg), and measurements (", userProfile == null ? void 0 : userProfile.chestInches, '"-', userProfile == null ? void 0 : userProfile.waistInches, '"-', userProfile == null ? void 0 : userProfile.hipInches, '") will be factored into all generated try-ons!')), isCameraActive ? /* @__PURE__ */ import_react3.default.createElement("div", { className: "space-y-3" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "relative rounded-xl overflow-hidden bg-black aspect-square max-h-72 mx-auto" }, /* @__PURE__ */ import_react3.default.createElement(
      "video",
      {
        ref: videoRef,
        autoPlay: true,
        playsInline: true,
        muted: true,
        className: "w-full h-full object-cover"
      }
    )), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: captureWebcamPhoto,
        className: "flex-1 py-2.5 rounded-xl bg-[#ff3f6c] hover:bg-[#e6355f] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(Camera, { className: "w-4 h-4" }),
      "Capture Selfie & Try On"
    ), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: stopWebcam,
        className: "px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm cursor-pointer"
      },
      "Cancel"
    ))) : /* @__PURE__ */ import_react3.default.createElement("div", { className: "space-y-3" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3" }, /* @__PURE__ */ import_react3.default.createElement(
      "input",
      {
        ref: fileInputRef,
        type: "file",
        accept: "image/*",
        onChange: handleFileChange,
        className: "hidden"
      }
    ), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        type: "button",
        onClick: () => {
          var _a2;
          return (_a2 = fileInputRef.current) == null ? void 0 : _a2.click();
        },
        className: "flex flex-col items-center justify-center p-6 border-2 border-dashed border-pink-300 hover:border-[#ff3f6c] rounded-xl bg-pink-50/40 hover:bg-pink-50 transition-all group text-center cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement("div", { className: "w-11 h-11 rounded-full bg-pink-100 text-[#ff3f6c] flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform" }, /* @__PURE__ */ import_react3.default.createElement(Upload, { className: "w-5 h-5" })),
      /* @__PURE__ */ import_react3.default.createElement("span", { className: "font-bold text-sm text-slate-800" }, "Upload Photo"),
      /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-xs text-slate-500 mt-1" }, "JPG, PNG portrait")
    ), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        type: "button",
        onClick: startWebcam,
        className: "flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 hover:border-[#ff3f6c] rounded-xl bg-slate-50 hover:bg-pink-50/30 transition-all group text-center cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement("div", { className: "w-11 h-11 rounded-full bg-slate-200 text-slate-700 group-hover:bg-pink-100 group-hover:text-[#ff3f6c] flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform" }, /* @__PURE__ */ import_react3.default.createElement(Camera, { className: "w-5 h-5" })),
      /* @__PURE__ */ import_react3.default.createElement("span", { className: "font-bold text-sm text-slate-800" }, "Use Live Camera"),
      /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-xs text-slate-500 mt-1" }, "Take a selfie now")
    ))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex justify-end gap-3 pt-2" }, /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        type: "button",
        onClick: () => {
          stopWebcam();
          setIsFaceStudioOpen(false);
          setPendingUploadCategory(null);
        },
        className: "w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors cursor-pointer"
      },
      "Close Window"
    ))))), isSignupModalOpen && /* @__PURE__ */ import_react3.default.createElement("div", { className: "fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "bg-white rounded-2xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-100 my-8" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "bg-gradient-to-r from-[#ff3f6c] via-[#ff527b] to-[#ff7555] text-white p-5 flex items-center justify-between" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-3" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center" }, /* @__PURE__ */ import_react3.default.createElement(Ruler, { className: "w-5 h-5 text-white" })), /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("h2", { className: "font-extrabold text-lg leading-none" }, "Myntra AI Body Measurements & Sign-Up"), /* @__PURE__ */ import_react3.default.createElement("p", { className: "text-xs text-pink-100 mt-1" }, "Enter your height, weight & body measurements for accurate AI virtual try-on!"))), userProfile && /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => setIsSignupModalOpen(false),
        className: "text-white/80 hover:text-white p-1 cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(X, { className: "w-5 h-5" })
    )), /* @__PURE__ */ import_react3.default.createElement("form", { onSubmit: handleSignupSubmit, className: "p-6 space-y-4" }, signupError && /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700" }, signupError), /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("label", { className: "block text-xs font-extrabold uppercase text-slate-700 mb-1.5" }, "1. Select Your Gender *"), /* @__PURE__ */ import_react3.default.createElement("div", { className: "grid grid-cols-2 gap-3" }, ["Female", "Male"].map((g) => {
      const active = signupForm.gender === g;
      return /* @__PURE__ */ import_react3.default.createElement(
        "button",
        {
          type: "button",
          key: g,
          onClick: () => handleSelectGenderInSignup(g),
          className: `p-3 rounded-xl border-2 text-left transition-all flex items-center justify-between cursor-pointer ${active ? "border-[#ff3f6c] bg-pink-50/70 text-[#ff3f6c]" : "border-slate-200 hover:border-slate-300 text-slate-700"}`
        },
        /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("div", { className: "font-extrabold text-sm" }, g, " Profile"), /* @__PURE__ */ import_react3.default.createElement("div", { className: "text-[11px] text-slate-500 mt-0.5" }, g === "Female" ? "Women\u2019s catalog" : "Men\u2019s catalog")),
        active && /* @__PURE__ */ import_react3.default.createElement(Check, { className: "w-4 h-4 text-[#ff3f6c] shrink-0" })
      );
    }))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3" }, /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("label", { className: "block text-xs font-bold text-slate-700 mb-1" }, "Full Name *"), /* @__PURE__ */ import_react3.default.createElement(
      "input",
      {
        type: "text",
        required: true,
        value: signupForm.fullName,
        onChange: (e) => setSignupForm((prev) => __spreadProps(__spreadValues({}, prev), { fullName: e.target.value })),
        placeholder: signupForm.gender === "Female" ? "e.g. Ananya Roy" : "e.g. Rahul Sen",
        className: "w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:border-[#ff3f6c] focus:outline-none"
      }
    )), /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("label", { className: "block text-xs font-bold text-slate-700 mb-1" }, "Email (Optional)"), /* @__PURE__ */ import_react3.default.createElement(
      "input",
      {
        type: "email",
        value: signupForm.email,
        onChange: (e) => setSignupForm((prev) => __spreadProps(__spreadValues({}, prev), { email: e.target.value })),
        placeholder: "you@example.com",
        className: "w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:border-[#ff3f6c] focus:outline-none"
      }
    ))), /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center justify-between mb-1.5" }, /* @__PURE__ */ import_react3.default.createElement("label", { className: "block text-xs font-extrabold uppercase text-slate-700" }, "2. Height, Weight & Body Measurements *"), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200" }, "BMI: ", signupPreviewBodyMeta.bmi, " \u2022 ", signupForm.bodyType)), /* @__PURE__ */ import_react3.default.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-5 gap-2.5" }, /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("label", { className: "block text-[11px] font-semibold text-slate-500 mb-1" }, "Height (cm)"), /* @__PURE__ */ import_react3.default.createElement(
      "input",
      {
        type: "number",
        min: "130",
        max: "210",
        value: signupForm.heightCm,
        onChange: (e) => setSignupForm((prev) => __spreadProps(__spreadValues({}, prev), { heightCm: e.target.value })),
        className: "w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-bold"
      }
    )), /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("label", { className: "block text-[11px] font-semibold text-slate-500 mb-1" }, "Weight (kg)"), /* @__PURE__ */ import_react3.default.createElement(
      "input",
      {
        type: "number",
        min: "35",
        max: "160",
        value: signupForm.weightKg,
        onChange: (e) => setSignupForm((prev) => __spreadProps(__spreadValues({}, prev), { weightKg: e.target.value })),
        className: "w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-bold"
      }
    )), /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("label", { className: "block text-[11px] font-semibold text-slate-500 mb-1" }, signupForm.gender === "Female" ? "Bust (in)" : "Chest (in)"), /* @__PURE__ */ import_react3.default.createElement(
      "input",
      {
        type: "number",
        min: "26",
        max: "60",
        value: signupForm.chestInches,
        onChange: (e) => setSignupForm((prev) => __spreadProps(__spreadValues({}, prev), {
          chestInches: e.target.value
        })),
        className: "w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-bold"
      }
    )), /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("label", { className: "block text-[11px] font-semibold text-slate-500 mb-1" }, "Waist (in)"), /* @__PURE__ */ import_react3.default.createElement(
      "input",
      {
        type: "number",
        min: "20",
        max: "56",
        value: signupForm.waistInches,
        onChange: (e) => setSignupForm((prev) => __spreadProps(__spreadValues({}, prev), {
          waistInches: e.target.value
        })),
        className: "w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-bold"
      }
    )), /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("label", { className: "block text-[11px] font-semibold text-slate-500 mb-1" }, "Hip (in)"), /* @__PURE__ */ import_react3.default.createElement(
      "input",
      {
        type: "number",
        min: "28",
        max: "62",
        value: signupForm.hipInches,
        onChange: (e) => setSignupForm((prev) => __spreadProps(__spreadValues({}, prev), {
          hipInches: e.target.value
        })),
        className: "w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-bold"
      }
    ))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "mt-2.5 flex items-center gap-1.5 flex-wrap" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[11px] font-bold text-slate-500 mr-1" }, "Body Frame:"), ["Slim", "Regular", "Athletic", "Curvy", "Plus Size"].map((bType) => /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        key: bType,
        type: "button",
        onClick: () => setSignupForm((prev) => __spreadProps(__spreadValues({}, prev), { bodyType: bType })),
        className: `px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${signupForm.bodyType === bType ? "bg-slate-900 text-white border-slate-900" : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"}`
      },
      bType
    ))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "mt-3 p-3 rounded-xl bg-gradient-to-r from-teal-50/90 via-white to-pink-50/60 border border-teal-200 flex flex-col sm:flex-row items-center gap-3.5" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "w-24 h-32 rounded-xl bg-slate-900 flex flex-col items-center justify-center p-2 shrink-0 relative overflow-hidden shadow-inner" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[8px] font-extrabold uppercase tracking-wider text-teal-300 mb-0.5" }, "Live Body Shape"), /* @__PURE__ */ import_react3.default.createElement("svg", { viewBox: "0 0 100 140", className: "w-16 h-24 overflow-visible" }, (() => {
      const cW = Math.max(14, Math.min(34, 21 * (signupPreviewBodyMeta.chestScale || 1)));
      const wW = Math.max(10, Math.min(32, 16 * (signupPreviewBodyMeta.waistScale || 1)));
      const hW = Math.max(14, Math.min(36, 22 * (signupPreviewBodyMeta.hipScale || 1)));
      const vScale = signupPreviewBodyMeta.heightScale || 1;
      return /* @__PURE__ */ import_react3.default.createElement("g", { transform: `translate(50, 72) scale(1, ${vScale}) translate(-50, -72)` }, /* @__PURE__ */ import_react3.default.createElement("circle", { cx: "50", cy: "16", r: "9", fill: "#f43f5e", opacity: "0.9" }), /* @__PURE__ */ import_react3.default.createElement(
        "path",
        {
          d: `M ${50 - cW} 34
                                  Q ${50 - cW * 1.05} 45, ${50 - wW} 60
                                  Q ${50 - hW * 1.08} 76, ${50 - hW * 0.85} 95
                                  L ${50 - 7} 130
                                  L ${50 - 2} 130
                                  L 50 96
                                  L ${50 + 2} 130
                                  L ${50 + 7} 130
                                  L ${50 + hW * 0.85} 95
                                  Q ${50 + hW * 1.08} 76, ${50 + wW} 60
                                  Q ${50 + cW * 1.05} 45, ${50 + cW} 34
                                  Z`,
          fill: "url(#bodyGrad)",
          stroke: "#2dd4bf",
          strokeWidth: "1.5"
        }
      ), /* @__PURE__ */ import_react3.default.createElement("line", { x1: 50 - cW, y1: "42", x2: 50 + cW, y2: "42", stroke: "#fda4af", strokeWidth: "1", strokeDasharray: "2,2" }), /* @__PURE__ */ import_react3.default.createElement("line", { x1: 50 - wW, y1: "60", x2: 50 + wW, y2: "60", stroke: "#fde047", strokeWidth: "1", strokeDasharray: "2,2" }), /* @__PURE__ */ import_react3.default.createElement("line", { x1: 50 - hW, y1: "78", x2: 50 + hW, y2: "78", stroke: "#7dd3fc", strokeWidth: "1", strokeDasharray: "2,2" }), /* @__PURE__ */ import_react3.default.createElement("defs", null, /* @__PURE__ */ import_react3.default.createElement("linearGradient", { id: "bodyGrad", x1: "0", y1: "0", x2: "0", y2: "1" }, /* @__PURE__ */ import_react3.default.createElement("stop", { offset: "0%", stopColor: "#ff3f6c", stopOpacity: "0.85" }), /* @__PURE__ */ import_react3.default.createElement("stop", { offset: "100%", stopColor: "#14b8a6", stopOpacity: "0.85" }))));
    })())), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex-1 text-[11px] text-teal-950 space-y-1" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "font-extrabold text-xs text-slate-900 flex items-center gap-1.5" }, /* @__PURE__ */ import_react3.default.createElement(Sparkles, { className: "w-3.5 h-3.5 text-[#ff3f6c]" }), "How Your Body Will Look in Generated Photos:"), /* @__PURE__ */ import_react3.default.createElement("p", null, "\u2022 ", /* @__PURE__ */ import_react3.default.createElement("strong", null, "Height & Weight (", signupPreviewBodyMeta.heightCm, "cm, ", signupPreviewBodyMeta.weightKg, "kg):"), " ", signupPreviewBodyMeta.statureDesc, ", ", signupPreviewBodyMeta.bmiBuildDesc, "."), /* @__PURE__ */ import_react3.default.createElement("p", null, "\u2022 ", /* @__PURE__ */ import_react3.default.createElement("strong", null, signupForm.gender === "Female" ? "Bust" : "Chest", " (", signupPreviewBodyMeta.chestIn, '"):'), " ", signupPreviewBodyMeta.chestVisualDesc, "."), /* @__PURE__ */ import_react3.default.createElement("p", null, "\u2022 ", /* @__PURE__ */ import_react3.default.createElement("strong", null, "Waist (", signupPreviewBodyMeta.waistIn, '") & Hip (', signupPreviewBodyMeta.hipIn, '"):'), " ", signupPreviewBodyMeta.waistVisualDesc, "; ", signupPreviewBodyMeta.hipVisualDesc, ".")))), /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("label", { className: "block text-xs font-extrabold uppercase text-slate-700 mb-1.5" }, "3. Upload Your Face Photo *"), /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-3.5 rounded-xl border-2 border-dashed border-pink-300 bg-pink-50/40 flex flex-col sm:flex-row items-center gap-4" }, signupForm.photoData ? /* @__PURE__ */ import_react3.default.createElement(
      "img",
      {
        src: signupForm.photoData.previewUrl,
        alt: "Signup Preview",
        className: "w-16 h-16 rounded-xl object-cover border-2 border-[#ff3f6c] shrink-0"
      }
    ) : /* @__PURE__ */ import_react3.default.createElement("div", { className: "w-16 h-16 rounded-xl bg-pink-100 text-[#ff3f6c] flex items-center justify-center shrink-0" }, /* @__PURE__ */ import_react3.default.createElement(Camera, { className: "w-7 h-7" })), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex-1 min-w-0" }, /* @__PURE__ */ import_react3.default.createElement("p", { className: "text-xs font-bold text-slate-800" }, signupForm.photoData ? `\u2713 Selected: ${signupForm.photoData.label}` : `No photo selected yet`), /* @__PURE__ */ import_react3.default.createElement("p", { className: "text-[11px] text-slate-500 mt-0.5" }, "Your photo and measurements will be automatically applied to your gender\u2019s shopping page!"), /* @__PURE__ */ import_react3.default.createElement("div", { className: "mt-2 flex items-center gap-2 flex-wrap" }, /* @__PURE__ */ import_react3.default.createElement(
      "input",
      {
        ref: signupFileInputRef,
        type: "file",
        accept: "image/*",
        onChange: handleSignupPhotoUpload,
        className: "hidden"
      }
    ), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        type: "button",
        onClick: () => {
          var _a2;
          return (_a2 = signupFileInputRef.current) == null ? void 0 : _a2.click();
        },
        className: "px-3 py-1.5 rounded-lg bg-[#ff3f6c] hover:bg-[#e6355f] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(Upload, { className: "w-3.5 h-3.5" }),
      "Upload From Device"
    ))))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "pt-2 flex items-center gap-3" }, /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        type: "submit",
        className: "flex-1 py-3.5 rounded-xl bg-gradient-to-r from-[#ff3f6c] to-[#ff7555] hover:opacity-95 text-white font-extrabold text-sm shadow-lg transition-all cursor-pointer"
      },
      "Save Profile & Measurements"
    ), userProfile && /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        type: "button",
        onClick: () => setIsSignupModalOpen(false),
        className: "px-4 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50 cursor-pointer"
      },
      "Cancel"
    ))))), isProfileManagerOpen && /* @__PURE__ */ import_react3.default.createElement("div", { className: "fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-100" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-5 bg-slate-900 text-white flex items-center justify-between" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ import_react3.default.createElement(Users, { className: "w-5 h-5 text-[#ff3f6c]" }), /* @__PURE__ */ import_react3.default.createElement("h3", { className: "font-extrabold text-base" }, "Saved Shopper Profiles")), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => setIsProfileManagerOpen(false),
        className: "text-slate-400 hover:text-white cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(X, { className: "w-5 h-5" })
    )), /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-5 space-y-3 max-h-96 overflow-y-auto" }, profiles.map((prof) => {
      var _a2;
      const isCurrent = prof.id === activeProfileId;
      return /* @__PURE__ */ import_react3.default.createElement(
        "div",
        {
          key: prof.id,
          className: `p-3 rounded-xl border flex items-center justify-between gap-3 ${isCurrent ? "border-[#ff3f6c] bg-pink-50/50" : "border-slate-200 bg-white"}`
        },
        /* @__PURE__ */ import_react3.default.createElement(
          "div",
          {
            onClick: () => {
              activateSavedProfile(prof, true);
              setIsProfileManagerOpen(false);
            },
            className: "flex items-center gap-3 flex-1 cursor-pointer"
          },
          /* @__PURE__ */ import_react3.default.createElement(
            "img",
            {
              src: (_a2 = prof.photoData) == null ? void 0 : _a2.previewUrl,
              alt: prof.fullName,
              className: "w-11 h-11 rounded-full object-cover border border-[#ff3f6c]"
            }
          ),
          /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("div", { className: "font-extrabold text-sm text-slate-900 flex items-center gap-1.5" }, /* @__PURE__ */ import_react3.default.createElement("span", null, prof.fullName), isCurrent && /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-[10px] px-2 py-0.5 rounded-full bg-[#ff3f6c] text-white" }, "Active")), /* @__PURE__ */ import_react3.default.createElement("p", { className: "text-xs text-slate-500" }, prof.gender, " \u2022 ", prof.heightCm, "cm \u2022 Chest ", prof.chestInches, '"'))
        ),
        /* @__PURE__ */ import_react3.default.createElement(
          "button",
          {
            onClick: () => handleDeleteProfile(prof.id),
            className: "p-2 text-slate-400 hover:text-rose-600 cursor-pointer",
            title: "Delete Profile"
          },
          /* @__PURE__ */ import_react3.default.createElement(Trash2, { className: "w-4 h-4" })
        )
      );
    }), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => handleOpenAddNewProfile("Female"),
        className: "w-full py-2.5 rounded-xl border-2 border-dashed border-pink-300 text-[#ff3f6c] font-extrabold text-xs hover:bg-pink-50 flex items-center justify-center gap-1.5 cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(Plus, { className: "w-4 h-4" }),
      "Add Another Profile"
    )))), isAddProductOpen && /* @__PURE__ */ import_react3.default.createElement("div", { className: "fixed inset-0 z-50 bg-slate-900/75 flex items-center justify-center p-4 overflow-y-auto", onClick: () => !isAddingProduct && setIsAddProductOpen(false) }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl my-8", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-4 border-b border-slate-100 flex items-center justify-between" }, /* @__PURE__ */ import_react3.default.createElement("h2", { className: "font-extrabold text-slate-900" }, "Add Product"), /* @__PURE__ */ import_react3.default.createElement("button", { onClick: () => !isAddingProduct && setIsAddProductOpen(false), className: "text-slate-400 hover:text-slate-700 cursor-pointer" }, /* @__PURE__ */ import_react3.default.createElement(X, { className: "w-5 h-5" }))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-4 space-y-3" }, /* @__PURE__ */ import_react3.default.createElement("label", { className: "block aspect-[3/4] max-h-64 mx-auto rounded-xl border-2 border-dashed border-slate-300 hover:border-[#ff3f6c] bg-slate-50 overflow-hidden cursor-pointer flex items-center justify-center text-center text-xs text-slate-500" }, addProductImage ? /* @__PURE__ */ import_react3.default.createElement("img", { src: addProductImage, alt: "Preview", className: "w-full h-full object-cover object-top" }) : /* @__PURE__ */ import_react3.default.createElement("span", { className: "px-4" }, /* @__PURE__ */ import_react3.default.createElement(Upload, { className: "w-6 h-6 mx-auto mb-1 text-slate-400" }), "Click to choose a photo", /* @__PURE__ */ import_react3.default.createElement("br", null), "(JPEG, PNG or WEBP)"), /* @__PURE__ */ import_react3.default.createElement("input", { type: "file", accept: "image/jpeg,image/png,image/webp", className: "hidden", onChange: handleAddProductFile })), ["brand", "name"].map((field) => /* @__PURE__ */ import_react3.default.createElement("input", { key: field, value: addProductForm[field], onChange: (e) => setAddProductForm((f) => __spreadProps(__spreadValues({}, f), { [field]: e.target.value })), placeholder: field === "brand" ? "Brand (e.g. ZARA)" : "Product name", className: "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-slate-400 focus:outline-none" })), /* @__PURE__ */ import_react3.default.createElement("select", { value: addProductForm.category, onChange: (e) => setAddProductForm((f) => __spreadProps(__spreadValues({}, f), { category: e.target.value })), className: "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white" }, ["Women", "Men", "Kids"].map((c) => /* @__PURE__ */ import_react3.default.createElement("option", { key: c, value: c }, c))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "grid grid-cols-2 gap-2" }, /* @__PURE__ */ import_react3.default.createElement("input", { type: "number", min: "0", value: addProductForm.price, onChange: (e) => setAddProductForm((f) => __spreadProps(__spreadValues({}, f), { price: e.target.value })), placeholder: "Price (\u20B9)", className: "px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-slate-400" }), /* @__PURE__ */ import_react3.default.createElement("input", { type: "number", min: "0", value: addProductForm.originalPrice, onChange: (e) => setAddProductForm((f) => __spreadProps(__spreadValues({}, f), { originalPrice: e.target.value })), placeholder: "MRP (optional)", className: "px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-slate-400" })), addProductError && /* @__PURE__ */ import_react3.default.createElement("p", { className: "text-xs font-semibold text-red-600" }, addProductError), /* @__PURE__ */ import_react3.default.createElement("button", { onClick: handleSubmitAddProduct, disabled: isAddingProduct, className: "w-full py-2.5 rounded-xl bg-[#ff3f6c] hover:bg-[#e6355f] text-white font-extrabold text-sm disabled:opacity-50 cursor-pointer" }, isAddingProduct ? "Adding..." : "Add to catalog")))), activeModalProduct && /* @__PURE__ */ import_react3.default.createElement("div", { className: "fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "bg-white rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl border border-slate-100 grid grid-cols-1 md:grid-cols-2" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-4 bg-slate-50 flex flex-col" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "relative aspect-[3/4] rounded-xl overflow-hidden bg-white shadow-inner" }, /* @__PURE__ */ import_react3.default.createElement(
      "img",
      {
        src: generatedImages[activeModalProduct.id] && !showOriginalMap[activeModalProduct.id] ? generatedImages[activeModalProduct.id] : activeModalProduct.defaultImage,
        alt: activeModalProduct.name,
        className: "w-full h-full object-cover object-top"
      }
    ), loadingMap[activeModalProduct.id] && /* @__PURE__ */ import_react3.default.createElement("div", { className: "absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center text-white" }, /* @__PURE__ */ import_react3.default.createElement(RefreshCw, { className: "w-8 h-8 text-[#ff3f6c] animate-spin mb-2" }), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-xs font-extrabold uppercase" }, "Sculpting Body Proportions..."))), generatedImages[activeModalProduct.id] && userProfile && activeModalProduct.category !== "Kids" && /* @__PURE__ */ import_react3.default.createElement("div", { className: "mt-2.5 flex items-center justify-end gap-2" }, /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        type: "button",
        onClick: () => setShowOriginalMap((prev) => __spreadProps(__spreadValues({}, prev), {
          [activeModalProduct.id]: !prev[activeModalProduct.id]
        })),
        className: "px-3 py-1.5 rounded-lg bg-slate-200 text-slate-800 text-[11px] font-extrabold cursor-pointer hover:bg-slate-300"
      },
      showOriginalMap[activeModalProduct.id] ? "Show My Body Fit" : "Compare Original Model"
    ))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-6 flex flex-col justify-between" }, /* @__PURE__ */ import_react3.default.createElement("div", null, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-xs font-extrabold uppercase tracking-wider text-[#ff3f6c]" }, activeModalProduct.brand), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => setActiveModalProduct(null),
        className: "p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(X, { className: "w-5 h-5" })
    )), /* @__PURE__ */ import_react3.default.createElement("h2", { className: "text-lg font-extrabold text-slate-900 mt-1" }, activeModalProduct.name), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-baseline gap-2 mt-3" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-2xl font-black text-slate-900" }, "\u20B9", activeModalProduct.price), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-sm text-slate-400 line-through" }, "\u20B9", activeModalProduct.originalPrice), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-sm font-extrabold text-orange-500" }, "(", activeModalProduct.discount, ")")), /* @__PURE__ */ import_react3.default.createElement("div", { className: "mt-5" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center justify-between mb-2" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-xs font-extrabold uppercase text-slate-700" }, "Select Size"), userProfile && /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded" }, "Recommended for You: ", getRecommendedSize())), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-2 flex-wrap" }, activeModalProduct.sizes.map((sz) => /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        key: sz,
        onClick: () => setSelectedSize(sz),
        className: `w-11 h-11 rounded-full text-xs font-extrabold border transition-all cursor-pointer ${selectedSize === sz ? "border-[#ff3f6c] bg-[#ff3f6c] text-white" : "border-slate-200 text-slate-700 hover:border-[#ff3f6c]"}`
      },
      sz
    )))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "mt-5 p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 space-y-1.5" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "font-bold text-slate-800" }, "Outfit & Body Measurement Calibration:"), /* @__PURE__ */ import_react3.default.createElement("p", null, "Wearing ", activeModalProduct.dressDescription, " in", " ", activeModalProduct.poseDescription, "."), userProfile && activeModalProduct.category !== "Kids" && /* @__PURE__ */ import_react3.default.createElement("p", { className: "text-[11px] text-teal-800 bg-teal-50 px-2.5 py-1.5 rounded-lg border border-teal-200 font-semibold" }, "\u2713 Calibrated for ", userProfile.fullName, ": ", userProfile.heightCm, "cm,", " ", userProfile.weightKg, "kg, Measurements ", userProfile.chestInches, '"-', userProfile.waistInches, '"-', userProfile.hipInches, '" (', userProfile.bodyType, " frame, BMI ", activeBodyMeta.bmi, ")"))), /* @__PURE__ */ import_react3.default.createElement("div", { className: "mt-6 flex items-center gap-3" }, /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => {
          addToBag(activeModalProduct, selectedSize);
          setActiveModalProduct(null);
        },
        className: "flex-1 py-3.5 rounded-xl bg-[#ff3f6c] hover:bg-[#e6355f] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(ShoppingBag, { className: "w-4 h-4" }),
      "ADD TO BAG"
    ))))), isBagOpen && /* @__PURE__ */ import_react3.default.createElement("div", { className: "fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "bg-white w-full max-w-md h-full flex flex-col shadow-2xl" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-5 border-b border-slate-100 flex items-center justify-between" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ import_react3.default.createElement(ShoppingBag, { className: "w-5 h-5 text-[#ff3f6c]" }), /* @__PURE__ */ import_react3.default.createElement("h3", { className: "font-extrabold text-base text-slate-900" }, "Shopping Bag (", bag.reduce((s, i) => s + i.qty, 0), ")")), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => setIsBagOpen(false),
        className: "text-slate-400 hover:text-slate-700 cursor-pointer"
      },
      /* @__PURE__ */ import_react3.default.createElement(X, { className: "w-5 h-5" })
    )), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex-1 overflow-y-auto p-5 space-y-4" }, bag.length === 0 ? /* @__PURE__ */ import_react3.default.createElement("div", { className: "text-center py-16 text-slate-400" }, /* @__PURE__ */ import_react3.default.createElement(ShoppingBag, { className: "w-12 h-12 mx-auto mb-3 opacity-40" }), /* @__PURE__ */ import_react3.default.createElement("p", { className: "font-bold text-sm text-slate-600" }, "Your Myntra Bag is empty")) : bag.map((item) => /* @__PURE__ */ import_react3.default.createElement(
      "div",
      {
        key: `${item.id}_${item.size}`,
        className: "flex gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/60"
      },
      /* @__PURE__ */ import_react3.default.createElement(
        "img",
        {
          src: generatedImages[item.id] || item.defaultImage,
          alt: item.name,
          className: "w-16 h-20 rounded-lg object-cover shrink-0"
        }
      ),
      /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex-1 min-w-0" }, /* @__PURE__ */ import_react3.default.createElement("h4", { className: "font-extrabold text-xs text-slate-900" }, item.brand), /* @__PURE__ */ import_react3.default.createElement("p", { className: "text-xs text-slate-500 truncate" }, item.name), /* @__PURE__ */ import_react3.default.createElement("span", { className: "inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-slate-200" }, "Size: ", item.size), /* @__PURE__ */ import_react3.default.createElement("div", { className: "mt-2 flex items-center justify-between" }, /* @__PURE__ */ import_react3.default.createElement("span", { className: "font-extrabold text-sm text-slate-900" }, "\u20B9", item.price * item.qty), /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ import_react3.default.createElement(
        "button",
        {
          onClick: () => updateBagQty(item.id, item.size, -1),
          className: "w-6 h-6 rounded bg-white border border-slate-200 flex items-center justify-center cursor-pointer"
        },
        /* @__PURE__ */ import_react3.default.createElement(Minus, { className: "w-3 h-3" })
      ), /* @__PURE__ */ import_react3.default.createElement("span", { className: "text-xs font-bold" }, item.qty), /* @__PURE__ */ import_react3.default.createElement(
        "button",
        {
          onClick: () => updateBagQty(item.id, item.size, 1),
          className: "w-6 h-6 rounded bg-white border border-slate-200 flex items-center justify-center cursor-pointer"
        },
        /* @__PURE__ */ import_react3.default.createElement(Plus, { className: "w-3 h-3" })
      ))))
    ))), bag.length > 0 && /* @__PURE__ */ import_react3.default.createElement("div", { className: "p-5 border-t border-slate-100 bg-slate-50 space-y-3" }, /* @__PURE__ */ import_react3.default.createElement("div", { className: "flex items-center justify-between font-extrabold text-base" }, /* @__PURE__ */ import_react3.default.createElement("span", null, "Total Amount"), /* @__PURE__ */ import_react3.default.createElement("span", null, "\u20B9", bagTotal)), /* @__PURE__ */ import_react3.default.createElement(
      "button",
      {
        onClick: () => {
          setBag([]);
          setIsBagOpen(false);
          showToast("Order placed successfully!");
        },
        className: "w-full py-3.5 rounded-xl bg-gradient-to-r from-[#ff3f6c] to-[#ff7555] text-white font-extrabold text-sm shadow-lg cursor-pointer"
      },
"PLACE ORDER"
    ))))));
}
