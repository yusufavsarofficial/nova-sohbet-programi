# Kaplumbağa

WhatsApp tarzı modern sohbet arayüzü olan React ve Electron uygulaması.

## Çalıştırma

```powershell
npm install
npm run dev
```

Tarayıcıda gösterilen yerel adresi açın.

## API Sunucusu

Gerçek kullanıcı, kayıt, giriş, kişi, sohbet ve mesaj API’si için:

```powershell
npm run api
```

API varsayılan olarak `http://127.0.0.1:4000` adresinde çalışır.

## Ortam Ayarları

`.env.example` dosyasını `.env` olarak kopyalayıp `JWT_SECRET` değerini uzun ve gizli bir değerle değiştirin.

## Giriş

Login ekranına herhangi bir ad ve telefon girerek demo sohbete geçebilirsiniz.

## Production Notları

- HTTPS zorunlu kullanılmalıdır.
- `JWT_SECRET` güçlü ve gizli olmalıdır.
- Gerçek SMS/OTP için Twilio, Firebase veya benzeri servis bağlanmalıdır.
- Büyük ölçek için JSON dosya yerine PostgreSQL veya SQLite tabanlı veritabanı kullanılmalıdır.
- Görüntülü arama için WebRTC TURN/STUN sunucusu gerekir.
