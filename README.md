# Kaplumbağa

React, Electron, Render API, Netlify yayın ve Android APK hedefleri olan modern sohbet uygulaması.

## Çalıştırma

```powershell
npm install
npm run dev
```

Tarayıcıda gösterilen yerel adresi açın. Yerelde API kullanacaksanız ayrı bir terminalde `npm run api` çalıştırın.

## API Sunucusu

Gerçek kullanıcı, kayıt, giriş, kişi, sohbet, grup, dosya ve mesaj API’si için:

```powershell
npm run api
```

API varsayılan olarak `http://127.0.0.1:4000` adresinde çalışır.

## Ortam Ayarları

`.env.example` dosyasını `.env` olarak kopyalayıp `JWT_SECRET` değerini uzun ve gizli bir değerle değiştirin.

## Giriş

İlk kayıt için `REGISTRATION_KEY` gerekir. Varsayılan geliştirme anahtarı `123456789` değeridir; canlıda bu değeri ortam değişkeniyle değiştirin.

## Production Notları

- HTTPS zorunlu kullanılmalıdır.
- `JWT_SECRET` güçlü ve gizli olmalıdır.
- Gerçek SMS/OTP için Twilio, Firebase veya benzeri servis bağlanmalıdır.
- Büyük ölçek için JSON dosya yerine PostgreSQL veya SQLite tabanlı veritabanı kullanılmalıdır.
- Görüntülü arama için WebRTC TURN/STUN sunucusu gerekir.
