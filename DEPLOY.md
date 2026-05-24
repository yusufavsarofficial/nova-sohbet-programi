# Kaplumbağa - Canlı Yayına Alma Rehberi

Bu rehber, uygulamayı internette aktif kullanıma açmak için adım adım talimatları içerir.

## Mimari

- **Frontend (React + Vite)** → Netlify (statik)
- **Backend (Node.js + Socket.io)** → Render.com (web servisi)
- **Veritabanı (PostgreSQL)** → Render.com (managed Postgres)

---

## 1) Backend'i Render.com'a Deploy Et

### A. Repoyu GitHub'a Yükle

```powershell
git add .
git commit -m "production ready"
git push origin main
```

### B. Render.com'da "Blueprint" oluştur

1. https://render.com → "Sign in with GitHub"
2. **New +** → **Blueprint**
3. Repoyu seç → `render.yaml` otomatik algılanır
4. **Apply** → Hem PostgreSQL hem API otomatik kurulur
5. ~5 dakika bekle. Logs'ta `Kaplumbağa API çalışıyor` görmelisin
6. URL örneği: `https://nova-sohbet-api.onrender.com`

### C. Sağlık Kontrolü

Tarayıcıda aç:
```
https://nova-sohbet-api.onrender.com/health
```
Cevap: `{"ok":true,"app":"Kaplumbağa","db":"postgres"}`

### Önemli Env'ler (Render otomatik ayarlar)

| Anahtar | Değer |
|---|---|
| `DATABASE_URL` | Postgres bağlantısı (otomatik) |
| `JWT_SECRET` | Otomatik üretilir |
| `REQUIRE_REGISTRATION_KEY` | `0` (canlıda açık kayıt) |
| `REGISTRATION_KEY` | Sadece `REQUIRE_REGISTRATION_KEY=1` ise kullanılır |
| `CORS_ORIGIN` | `*` (sonra Netlify URL'ne kısıtla) |

---

## 2) Frontend'i Netlify'a Deploy Et

İki seçenek:

### Seçenek A — Otomatik (önerilen)
Cascade'e "Netlify'a deploy et" dedin, ben hallediyorum.

### Seçenek B — Manuel
1. https://app.netlify.com → **Add new site** → **Import from Git**
2. Repoyu seç
3. Build command: `npm run build`
4. Publish directory: `dist`
5. **Environment variables**:
   - `VITE_API_URL` = `https://nova-sohbet-api.onrender.com`
6. Deploy

---

## 3) Bağlantıyı Tamamla

Frontend açıldığında:
- **Ayarlar (⚙️) → Sunucu URL** kısmına Render URL'ini gir → "Sunucuyu yeniden bağla"

Veya Netlify env var'ı `VITE_API_URL` olarak ayarla, redeploy et.

---

## 4) Güvenlik İyileştirmeleri (Production)

- **CORS_ORIGIN**: `https://senin-site.netlify.app` olarak kısıtla
- **Kapalı beta**: Gerekirse `REQUIRE_REGISTRATION_KEY=1` ve güçlü bir `REGISTRATION_KEY` kullan
- **HTTPS**: Hem Netlify hem Render otomatik HTTPS sağlar (WebRTC, mikrofon, kamera, bildirimler için zorunlu)
- **Custom domain** (opsiyonel): Netlify ve Render'da domain ekleyebilirsin

---

## 5) Sorun Giderme

| Sorun | Çözüm |
|---|---|
| `CORS hatası` | Render'da `CORS_ORIGIN` = Netlify URL ekle |
| Yeni kullanıcı kayıt olamıyor | `REQUIRE_REGISTRATION_KEY` değerinin canlıda `0` olduğundan emin ol |
| `Mikrofon/kamera çalışmıyor` | Site mutlaka HTTPS olmalı |
| `Render uyuyor (cold start)` | Free plan 15 dk inaktif sonra uyur. İlk istek 30sn sürebilir. Ücretli plan ile çözülür |
| `Socket bağlanmıyor` | Render API URL'inde HTTPS, Netlify env `VITE_API_URL` doğru mu kontrol et |

---

## 6) Yerel Geliştirme

```powershell
# Terminal 1
npm run api

# Terminal 2  
npm run dev
```

`http://127.0.0.1:5173` → `http://127.0.0.1:4000`
