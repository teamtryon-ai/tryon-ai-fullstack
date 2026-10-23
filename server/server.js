import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app = express();

// ================= SECURE CORS & UPLOAD LIMITS =================
const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const allowAnyLocalhost = process.env.NODE_ENV !== 'production';
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origin === allowedOrigin || (allowAnyLocalhost && origin.startsWith('http://localhost:'))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS policy'));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
  })
);

app.use(express.json({ limit: '15mb' }));

app.use((req, res, next) => {
  if (String(process.env.NANOBANANA_TUNNEL_RESTRICT_MODE).toLowerCase() !== 'true') return next();
  const rawPublicBase = process.env.NANOBANANA_PUBLIC_BASE_URL?.trim();
  if (!rawPublicBase) return next();
  let publicHost;
  try { publicHost = new URL(rawPublicBase).host.toLowerCase(); }
  catch { return next(); }
  if ((req.get('host') || '').toLowerCase() !== publicHost) return next();

  const allowedHealth = req.method === 'GET' && req.path === '/api/health';
  const allowedImage = req.method === 'GET' && /^\/api\/tryon\/temp-image\/[a-f0-9]{64}$/.test(req.path);
  const allowedCallback = req.method === 'POST' && req.path === '/api/tryon/nanobanana/callback';
  if (allowedHealth || allowedImage || allowedCallback) return next();
  return res.status(403).json({ error: 'This endpoint is not exposed through the local image-generation tunnel.' });
});

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// ================= MONGODB SCHEMAS =================
const ProductSchema = new mongoose.Schema(
  {
    productId: { type: Number, required: true, unique: true, index: true },
    brand: { type: String, required: true, trim: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, enum: ['Women', 'Men', 'Kids'], required: true },
    price: { type: Number, required: true, min: 0 },
    originalPrice: { type: Number, required: true, min: 0 },
    discount: { type: String, trim: true },
    rating: { type: Number, default: 4.5, min: 0, max: 5 },
    reviews: { type: String, trim: true },
    sizes: [{ type: String, trim: true }],
    defaultImage: { type: String, required: true, trim: true },
    dressDescription: { type: String, trim: true },
    poseDescription: { type: String, trim: true }
  },
  { timestamps: true }
);

const ProfileSchema = new mongoose.Schema(
  {
    profileId: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, default: '', trim: true, maxlength: 180 },
    gender: { type: String, enum: ['Female', 'Male', 'Kids'], default: 'Female' },
    heightCm: { type: Number, default: 165, min: 100, max: 230 },
    weightKg: { type: Number, default: 58, min: 20, max: 220 },
    chestInches: { type: Number, default: 34, min: 20, max: 70 },
    waistInches: { type: Number, default: 28, min: 18, max: 65 },
    hipInches: { type: Number, default: 36, min: 22, max: 70 },
    bodyType: { type: String, default: 'Regular' },
    photoData: {
      previewUrl: String,
      base64: String,
      mimeType: String,
      label: String,
      gender: String
    },
    categoryFaces: { type: Object, default: {} }
  },
  { timestamps: true }
);

const GeneratedTryOnSchema = new mongoose.Schema(
  {
    profileId: { type: String, required: true, index: true },
    productId: { type: Number, required: true },
    dataUrl: { type: String, required: true }
  },
  { timestamps: true }
);

GeneratedTryOnSchema.index({ profileId: 1, productId: 1 }, { unique: true });

const Profile = mongoose.model('Profile', ProfileSchema);
const Product = mongoose.model('Product', ProductSchema);
const GeneratedTryOn = mongoose.model('GeneratedTryOn', GeneratedTryOnSchema);

// ================= MONGODB CONNECTION =================
let isMongoConnected = false;
mongoose.connection.on('connected', () => { isMongoConnected = true; });
mongoose.connection.on('reconnected', () => { isMongoConnected = true; });
mongoose.connection.on('disconnected', () => {
  if (isMongoConnected) console.warn('⚠ MongoDB disconnected; profile/history routes return 503 until it reconnects.');
  isMongoConnected = false;
});
if (process.env.MONGODB_URI && process.env.MONGODB_URI.trim() !== '') {
  mongoose
    .connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB_NAME || 'myntra_ai_tryon'
    })
    .then(() => {
      console.log('✓ Connected to MongoDB Database');
    })
    .catch((err) => {
      console.error('✗ MongoDB connection error:', err.message);
    });
} else {
  console.warn(
    '⚠ MONGODB_URI is blank in server/.env — Running with client IndexedDB persistence until MONGODB_URI is configured.'
  );
}

// ================= HEALTH CHECK ENDPOINT =================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mongoConnected: isMongoConnected,
    nanoBananaConfigured: Boolean(process.env.NANOBANANA_API_KEY?.trim()),
    nanoBananaPublicBaseConfigured: Boolean(process.env.NANOBANANA_PUBLIC_BASE_URL?.trim())
  });
});

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const CATALOG_FILE = path.join(DATA_DIR, 'products.json');
const FIRST_PRODUCT_ID = 1000;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readCatalogFile() {
  try {
    const data = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
    return { nextId: Number(data.nextId) || FIRST_PRODUCT_ID, products: Array.isArray(data.products) ? data.products : [] };
  } catch {
    return { nextId: FIRST_PRODUCT_ID, products: [] };
  }
}
function writeCatalogFile(data) {
  const tmp = `${CATALOG_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, CATALOG_FILE);
}

async function syncCatalogToMongo() {
  if (!isMongoConnected) return;
  const { products } = readCatalogFile();
  if (products.length) {
    await Product.bulkWrite(
      products.map((p) => ({ replaceOne: { filter: { productId: p.productId }, replacement: p, upsert: true } }))
    );
  }
  await Product.deleteMany({ productId: { $nin: products.map((p) => p.productId) } });
  console.log(`✓ Product catalog synced to MongoDB (${products.length} products)`);
}
mongoose.connection.on('connected', () => {
  syncCatalogToMongo().catch((err) => console.error('✗ Catalog sync failed:', err.message));
});

app.use('/api/uploads', express.static(UPLOAD_DIR, { maxAge: '1h', fallthrough: false }));

app.get('/api/products', (req, res) => {
  let { products } = readCatalogFile();
  const { category, search } = req.query;
  if (category && ['Women', 'Men', 'Kids'].includes(category)) products = products.filter((p) => p.category === category);
  if (search) {
    const q = String(search).toLowerCase();
    products = products.filter((p) => p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q));
  }
  res.json({ products, total: products.length });
});

app.get('/api/products/:id', (req, res) => {
  const product = readCatalogFile().products.find((p) => p.productId === Number(req.params.id));
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

app.post('/api/products', async (req, res) => {
  try {
    const { imageBase64, brand, name, category } = req.body || {};
    const price = Number(req.body?.price);
    const originalPrice = req.body?.originalPrice ? Number(req.body.originalPrice) : price;
    if (!brand || typeof brand !== 'string' || !brand.trim()) return res.status(400).json({ error: 'brand is required.' });
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required.' });
    if (!['Women', 'Men', 'Kids'].includes(category)) return res.status(400).json({ error: 'category must be Women, Men or Kids.' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'price must be a number.' });
    if (!Number.isFinite(originalPrice) || originalPrice < price) return res.status(400).json({ error: 'originalPrice must be a number not lower than price.' });

    const input = decodeBase64Image(imageBase64, 'imageBase64');
    let jpeg;
    try {
      jpeg = await fitToCatalogFrame(input, 700).jpeg({ quality: 88 }).toBuffer();
    } catch {
      return res.status(400).json({ error: 'The uploaded file is not a valid JPEG, PNG or WEBP image.' });
    }

    const data = readCatalogFile();
    const productId = data.nextId;
    fs.writeFileSync(path.join(UPLOAD_DIR, `${productId}.jpg`), jpeg);
    const off = Math.round(((originalPrice - price) / originalPrice) * 100);
    const product = {
      productId,
      brand: brand.trim().slice(0, 120),
      name: name.trim().slice(0, 200),
      category,
      price,
      originalPrice,
      discount: off > 0 ? `${off}% OFF` : '',
      rating: 4.5,
      reviews: '0',
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      defaultImage: `/api/uploads/${productId}.jpg`,
      dressDescription: name.trim().slice(0, 200),
      poseDescription: 'the same pose as in the catalog photo'
    };
    data.products.push(product);
    data.nextId = productId + 1;
    writeCatalogFile(data);
    syncCatalogToMongo().catch((err) => console.error('✗ Catalog sync failed:', err.message));
    res.status(201).json(product);
  } catch (err) {
    res.status(err?.statusCode || 500).json({ error: err?.message || 'Could not add the product.' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const data = readCatalogFile();
    const product = data.products.find((p) => p.productId === productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    data.products = data.products.filter((p) => p.productId !== productId);
    writeCatalogFile(data);
    fs.rmSync(path.join(UPLOAD_DIR, `${productId}.jpg`), { force: true });
    if (isMongoConnected) {
      await Promise.all([
        Product.deleteOne({ productId }),
        GeneratedTryOn.deleteMany({ productId })
      ]);
    }
    res.json({ ok: true, productId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/profiles', async (req, res) => {
  if (!isMongoConnected) {
    return res.status(503).json({ error: 'MongoDB is not connected. Configure MONGODB_URI in server/.env.' });
  }
  try {
    const profiles = await Profile.find().sort({ updatedAt: -1 }).lean();
    res.json(profiles.map((p) => ({ ...p, id: p.profileId })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/profiles', async (req, res) => {
  if (!isMongoConnected) {
    return res.status(503).json({ error: 'MongoDB is not connected. Configure MONGODB_URI in server/.env.' });
  }
  try {
    const { id, fullName, photoData } = req.body;
    const PROFILE_FIELDS = ['email', 'gender', 'heightCm', 'weightKg', 'chestInches', 'waistInches', 'hipInches', 'bodyType', 'categoryFaces'];
    const rest = {};
    for (const field of PROFILE_FIELDS) {
      if (req.body[field] !== undefined) rest[field] = req.body[field];
    }
    if (!fullName || typeof fullName !== 'string' || !fullName.trim()) {
      return res.status(400).json({ error: 'fullName is required.' });
    }
    if (photoData?.mimeType && !ALLOWED_MIME_TYPES.includes(photoData.mimeType)) {
      return res.status(400).json({ error: 'Unsupported image MIME type. Allowed: JPEG, PNG, WEBP.' });
    }

    const profileId = id || `profile_${Date.now()}`;
    const saved = await Profile.findOneAndUpdate(
      { profileId },
      { profileId, fullName: fullName.trim(), photoData, ...rest },
      { new: true, upsert: true, runValidators: true }
    ).lean();

    res.json({ ...saved, id: saved.profileId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/profiles/:id', async (req, res) => {
  if (!isMongoConnected) {
    return res.status(503).json({ error: 'MongoDB is not connected.' });
  }
  try {
    const profileId = req.params.id;
    await Profile.findOneAndDelete({ profileId });
    await GeneratedTryOn.deleteMany({ profileId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tryon/history/:profileId', async (req, res) => {
  if (!isMongoConnected) {
    return res.status(503).json({ error: 'MongoDB is not connected.' });
  }
  try {
    await GeneratedTryOn.deleteMany({ profileId: req.params.profileId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete try-on history.' });
  }
});

app.get('/api/tryon/history/:profileId', async (req, res) => {
  if (!isMongoConnected) {
    return res.status(503).json({ error: 'MongoDB is not connected.' });
  }
  try {
    const items = await GeneratedTryOn.find({ profileId: req.params.profileId }).lean();
    const map = {};
    items.forEach((entry) => {
      map[entry.productId] = entry.dataUrl;
    });
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= NANOBANANA API IMAGE/TASK HELPERS =================
const NANOBANANA_API_BASE = 'https://api.nanobananaapi.ai/api/v1/nanobanana';
const TEMP_IMAGE_TTL_MS = 10 * 60 * 1000;
const MAX_PROVIDER_IMAGE_BYTES = 30 * 1024 * 1024;
const temporaryImages = new Map();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of temporaryImages.entries()) {
    if (entry.expiresAt <= now) temporaryImages.delete(token);
  }
}, 60 * 1000);
cleanupTimer.unref?.();

function httpError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getNanoBananaConfig() {
  const apiKey = process.env.NANOBANANA_API_KEY?.trim();
  if (!apiKey) {
    throw httpError('NANOBANANA_API_KEY is missing from server/.env. Add your NanoBananaAPI key and restart the backend.', 503);
  }

  const rawBaseUrl = process.env.NANOBANANA_PUBLIC_BASE_URL?.trim();
  if (!rawBaseUrl) {
    throw httpError('NANOBANANA_PUBLIC_BASE_URL is missing.', 503);
  }

  let publicBaseUrl;
  try {
    const parsed = new URL(rawBaseUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('invalid public URL');
    publicBaseUrl = parsed.origin;
  } catch {
    throw httpError('NANOBANANA_PUBLIC_BASE_URL must be a valid public HTTPS URL without credentials or a path.', 503);
  }

  const callbackUrl = process.env.NANOBANANA_CALLBACK_URL?.trim() || `${publicBaseUrl}/api/tryon/nanobanana/callback`;
  try {
    const parsedCallback = new URL(callbackUrl);
    if (parsedCallback.protocol !== 'https:' || parsedCallback.username || parsedCallback.password) throw new Error('invalid callback URL');
  } catch {
    throw httpError('NANOBANANA_CALLBACK_URL must be a valid public HTTPS URL.', 503);
  }

  return { apiKey, publicBaseUrl, callbackUrl };
}

function decodeBase64Image(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw httpError(`${label} is required.`, 400);
  const payload = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  if (!/^[A-Za-z0-9+/\s]*={0,2}$/.test(payload)) throw httpError(`${label} is not valid base64 image data.`, 400);
  const buffer = Buffer.from(payload.replace(/\s/g, ''), 'base64');
  if (!buffer.length) throw httpError(`${label} is empty.`, 400);
  return buffer;
}

function createTemporaryImageUrl(buffer, mimeType, publicBaseUrl, label = 'image') {
  const token = randomBytes(32).toString('hex');
  temporaryImages.set(token, { buffer, mimeType, label, fetchCount: 0, expiresAt: Date.now() + TEMP_IMAGE_TTL_MS });
  return { token, url: `${publicBaseUrl}/api/tryon/temp-image/${token}` };
}

app.get('/api/tryon/temp-image/:token', (req, res) => {
  const token = req.params.token;
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(404).end();
  const entry = temporaryImages.get(token);
  if (!entry || entry.expiresAt <= Date.now()) {
    temporaryImages.delete(token);
    return res.status(404).end();
  }
  entry.fetchCount += 1;
  console.log(`[tryon] provider fetched "${entry.label}" (${entry.buffer.length} bytes, fetch #${entry.fetchCount})`);
  res.set({
    'Content-Type': entry.mimeType,
    'Content-Length': String(entry.buffer.length),
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff'
  });
  return res.status(200).send(entry.buffer);
});

app.post('/api/tryon/nanobanana/callback', (req, res) => res.status(200).json({ ok: true }));

async function requestNanoBananaJson(url, options, timeoutMs = 45000) {
  const isPost = String(options?.method || 'GET').toUpperCase() === 'POST';
  const maxAttempts = isPost ? 1 : 3;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let response;
    try {
      response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        lastError = httpError('NanoBananaAPI request timed out.', 504);
      } else {
        lastError = httpError(`Could not reach NanoBananaAPI: ${error?.message || 'network error'}`, 502);
      }
      if (attempt < maxAttempts) { await new Promise((r) => setTimeout(r, 1500 * attempt)); continue; }
      throw lastError;
    }
    const rawText = await response.text().catch(() => '');
    let body = {};
    try { body = rawText ? JSON.parse(rawText) : {}; } catch { body = {}; }
    const providerCode = Number(body?.code);
    const failed = !response.ok || (body?.code !== undefined && body?.code !== null && providerCode !== 200);
    if (!failed) return body;

    const where = `${isPost ? 'POST' : 'GET'} ${new URL(url).pathname}`;
    console.error(`[tryon] NanoBanana ${where} -> HTTP ${response.status}, attempt ${attempt}/${maxAttempts}`);
    if (response.status === 401 || response.status === 403 || providerCode === 401) {
      throw httpError('NanoBananaAPI rejected the API key.', 502);
    }
    if (response.status === 429 || providerCode === 429) {
      throw httpError('NanoBananaAPI rate limit reached.', 429);
    }
    lastError = httpError(`${body?.msg || 'NanoBananaAPI request failed'}`, 502);
    const transient = [502, 503, 504].includes(response.status);
    if (transient && attempt < maxAttempts) { await new Promise((r) => setTimeout(r, 1500 * attempt)); continue; }
    throw lastError;
  }
  throw lastError;
}

async function submitAndWaitForNanoBanana({ prompt, images, imageSize = '1:1' }) {
  const { apiKey, publicBaseUrl, callbackUrl } = getNanoBananaConfig();
  const temporaryTokens = [];
  try {
    console.log(`[tryon] sending ${images.length} image(s) to NanoBanana`);
    const imageUrls = images.map(({ buffer, mimeType, label }) => {
      const item = createTemporaryImageUrl(buffer, mimeType || 'image/jpeg', publicBaseUrl, label);
      temporaryTokens.push(item.token);
      return item.url;
    });

    const submitted = await requestNanoBananaJson(`${NANOBANANA_API_BASE}/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt,
        type: 'IMAGETOIAMGE',
        numImages: 1,
        imageUrls,
        image_size: imageSize,
        callBackUrl: callbackUrl
      })
    });

    const taskId = submitted?.data?.taskId || submitted?.taskId;
    if (Number(submitted?.code) !== 200 || !taskId) {
      throw httpError(submitted?.msg || 'NanoBananaAPI did not return a valid task ID.', 502);
    }

    const deadline = Date.now() + 5 * 60 * 1000;
    let resultImageUrl = '';
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const taskResponse = await requestNanoBananaJson(
        `${NANOBANANA_API_BASE}/record-info?taskId=${encodeURIComponent(taskId)}`,
        { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` } },
        20000
      );
      const task = taskResponse?.data?.data?.successFlag !== undefined
        ? taskResponse.data.data
        : taskResponse?.data?.successFlag !== undefined
          ? taskResponse.data
          : taskResponse;
      const flag = Number(task?.successFlag ?? task?.data?.successFlag);

      if (flag === 1) {
        resultImageUrl = task?.response?.resultImageUrl || task?.data?.response?.resultImageUrl || '';
        if (!resultImageUrl) throw httpError('NanoBananaAPI returned no result image URL.', 502);
        break;
      }
      if (flag === 2 || flag === 3) {
        throw httpError(task?.errorMessage || task?.msg || 'NanoBananaAPI image generation failed.', 502);
      }
    }

    if (!resultImageUrl) throw httpError('NanoBananaAPI generation timed out.', 504);

    let resultUrl;
    try {
      resultUrl = new URL(resultImageUrl);
      if (resultUrl.protocol !== 'https:') throw new Error('not https');
    } catch {
      throw httpError('NanoBananaAPI returned an invalid result image URL.', 502);
    }

    let imageResponse;
    try {
      imageResponse = await fetch(resultUrl, { signal: AbortSignal.timeout(45000) });
    } catch (error) {
      throw httpError(`Could not download NanoBananaAPI result image: ${error?.message || 'network error'}`, 502);
    }
    if (!imageResponse.ok) throw httpError(`Could not download generated image (HTTP ${imageResponse.status}).`, 502);
    const contentLength = Number(imageResponse.headers.get('content-length') || 0);
    if (contentLength > MAX_PROVIDER_IMAGE_BYTES) throw httpError('Generated image exceeds size limit.', 502);
    
    const chunks = [];
    let downloadedBytes = 0;
    if (!imageResponse.body) throw httpError('Generated image response was empty.', 502);
    const reader = imageResponse.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloadedBytes += value.byteLength;
      if (downloadedBytes > MAX_PROVIDER_IMAGE_BYTES) {
        await reader.cancel().catch(() => {});
        throw httpError('Generated image exceeds size limit.', 502);
      }
      chunks.push(Buffer.from(value));
    }
    if (!downloadedBytes) throw httpError('Generated image is empty.', 502);
    const resultBuffer = Buffer.concat(chunks, downloadedBytes);
    const mimeType = (imageResponse.headers.get('content-type') || '').split(';')[0].trim();
    if (!mimeType.startsWith('image/')) throw httpError('Result URL did not return an image.', 502);

    const debug = {
      taskId,
      imagesSent: temporaryTokens.map((t, i) => {
        const e = temporaryImages.get(t);
        return { order: i + 1, label: e?.label, bytes: e?.buffer.length, fetchedByProvider: e?.fetchCount || 0 };
      }),
      resultImageUrl
    };
    console.log('[tryon] done', JSON.stringify(debug));
    return { buffer: resultBuffer, mimeType, debug };
  } finally {
    for (const token of temporaryTokens) temporaryImages.delete(token);
  }
}

const CATALOG_ASPECT_W = 3;
const CATALOG_ASPECT_H = 4;
function fitToCatalogFrame(buffer, width) {
  const height = Math.round((width * CATALOG_ASPECT_H) / CATALOG_ASPECT_W);
  return sharp(buffer).rotate().resize(width, height, { fit: 'cover', position: 'top' });
}

// ================= BATCH VIRTUAL TRY-ON ENDPOINT =================
app.post('/api/tryon/generate-batch', async (req, res) => {
  try {
    const { profileId, userFaceBase64, userFaceMimeType, products, promptText } = req.body;
    if (!userFaceBase64 || typeof userFaceBase64 !== 'string') {
      return res.status(400).json({ error: 'userFaceBase64 is required.' });
    }
    if (!promptText || typeof promptText !== 'string') {
      return res.status(400).json({ error: 'promptText is required.' });
    }
    if (!Array.isArray(products) || products.length === 0 || products.length > 4) {
      return res.status(400).json({ error: 'products must be an array of 1-4 items.' });
    }
    const faceMime = userFaceMimeType || 'image/jpeg';
    if (!ALLOWED_MIME_TYPES.includes(faceMime)) {
      return res.status(400).json({ error: `Invalid face image MIME type.` });
    }
    const faceInput = decodeBase64Image(userFaceBase64, 'userFaceBase64');
    const faceBuffer = await sharp(faceInput).rotate().resize({ width: 1024, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();

    const productMap = [];
    const catalogBuffers = [];
    const cellW0 = 480;
    const cellH0 = (cellW0 * CATALOG_ASPECT_H) / CATALOG_ASPECT_W;
    for (let index = 0; index < products.length; index += 1) {
      const product = products[index];
      if (!product || !Number.isSafeInteger(Number(product.productId)) || Number(product.productId) < 1) {
        return res.status(400).json({ error: 'Each product must have a positive integer productId.' });
      }
      const original = decodeBase64Image(product.catalogImageBase64, `catalogImageBase64 for product ${product.productId}`);
      const normalized = await fitToCatalogFrame(original, cellW0).jpeg({ quality: 90 }).toBuffer();
      catalogBuffers.push(normalized);
      productMap.push({ productId: Number(product.productId), index });
    }

    const singleProduct = catalogBuffers.length === 1;
    const composite = singleProduct
      ? catalogBuffers[0]
      : await sharp({
          create: { width: cellW0 * 2, height: cellH0 * 2, channels: 3, background: { r: 255, g: 255, b: 255 } }
        })
          .composite(catalogBuffers.map((buffer, index) => ({
            input: buffer,
            left: (index % 2) * cellW0,
            top: Math.floor(index / 2) * cellH0
          })))
          .jpeg({ quality: 90 })
          .toBuffer();

    const generated = await submitAndWaitForNanoBanana({
      prompt: promptText,
      imageSize: '3:4',
      images: [
        { buffer: composite, mimeType: 'image/jpeg', label: singleProduct ? 'catalog-photo' : 'catalog-grid' },
        { buffer: faceBuffer, mimeType: 'image/jpeg', label: 'user-face' }
      ]
    });

    const generatedMeta = await sharp(generated.buffer).metadata();
    const { width, height } = generatedMeta;
    if (!width || !height || width < 2 || height < 2) {
      return res.status(422).json({ error: 'Generated image has invalid dimensions.' });
    }
    const expectedRatio = CATALOG_ASPECT_W / CATALOG_ASPECT_H;
    if (Math.abs(width / height - expectedRatio) / expectedRatio > 0.15) {
      return res.status(422).json({ error: 'Generated image aspect ratio is unexpected.' });
    }

    const cellW = singleProduct ? width : Math.floor(width / 2);
    const cellH = singleProduct ? height : Math.floor(height / 2);

    const results = await Promise.all(productMap.map(async ({ productId, index }) => {
      const cell = singleProduct
        ? generated.buffer
        : await sharp(generated.buffer)
            .extract({ left: (index % 2) * cellW, top: Math.floor(index / 2) * cellH, width: cellW, height: cellH })
            .toBuffer();
      const cropped = await fitToCatalogFrame(cell, Math.min(cellW, 768)).jpeg({ quality: 90 }).toBuffer();
      const dataUrl = `data:image/jpeg;base64,${cropped.toString('base64')}`;
      if (isMongoConnected && profileId) {
        await GeneratedTryOn.findOneAndUpdate(
          { profileId: String(profileId), productId },
          { profileId: String(profileId), productId, dataUrl },
          { upsert: true, new: true }
        );
      }
      return { productId, dataUrl };
    }));

    return res.json({ results, debug: generated.debug });
  } catch (error) {
    console.error('Batch try-on error:', error?.message || 'Unknown error');
    return res.status(error?.statusCode || 500).json({ error: error?.message || 'Batch try-on generation failed.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✓ MyntraAI Backend Server listening on http://localhost:${PORT}`);
});
