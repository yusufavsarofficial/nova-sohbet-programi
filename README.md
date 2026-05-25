# Kaplumbağa

Kaplumbağa; React/Vite frontend, Node.js/Express + Socket.IO backend, Netlify frontend yayını, Render backend yayını ve Capacitor Android APK hedefi olan sohbet uygulamasıdır.

## Lokal Çalıştırma

Windows PowerShell üzerinde:

```powershell
npm install
```

Backend API:

```powershell
npm run api
```

Varsayılan backend adresi:

```text
http://127.0.0.1:4000
```

Health kontrolü:

```powershell
Invoke-RestMethod http://127.0.0.1:4000/health
```

Frontend:

```powershell
npm run dev
```

Varsayılan frontend adresi:

```text
http://localhost:5173
```

Production build:

```powershell
npm run build
```

## Veri Modları

Backend `DATABASE_URL` varsa PostgreSQL kullanır. `DATABASE_URL` yoksa lokal geliştirme için JSON dosya moduna düşer.

| Mod | Kullanım | Not |
|---|---|---|
| JSON dosya | Lokal geliştirme | Veriler `data/kaplumbaga.json` dosyasına yazılır. Production için önerilmez. |
| PostgreSQL | Production | Render PostgreSQL veya benzeri managed veritabanı önerilir. |

## Environment Değişkenleri

| Değişken | Örnek | Açıklama |
|---|---|---|
| `NODE_ENV` | `development` / `production` | Production güvenlik kontrollerini belirler. |
| `HOST` | `127.0.0.1` | Lokal API host değeri. Render için `0.0.0.0`. |
| `PORT` | `4000` | API portu. |
| `JWT_SECRET` | uzun rastgele değer | Production’da default değerle çalışmaz. |
| `CORS_ORIGIN` | `http://127.0.0.1:5173` | Production’da `*` olmamalıdır. |
| `DATABASE_URL` | PostgreSQL URL | Varsa PostgreSQL modu açılır. |
| `DATA_DIR` | `./data` | JSON dosya modu veri klasörü. |
| `UPLOAD_DIR` | `./uploads` | Dosya yükleme klasörü. |
| `REQUIRE_REGISTRATION_KEY` | `0` / `1` | Kayıtta anahtar zorunluluğu. |
| `REGISTRATION_KEY` | gizli değer | Kapalı kayıt anahtarı. |
| `VITE_API_URL` | `http://127.0.0.1:4000` | Frontend’in bağlanacağı API adresi. |
| `VITE_TURN_URL` | `turns:turn.example.com:5349` | WebRTC için opsiyonel TURN sunucusu. Virgülle birden fazla URL verilebilir. |
| `VITE_TURN_USERNAME` | kullanıcı adı | TURN kimlik bilgisi. |
| `VITE_TURN_CREDENTIAL` | parola | TURN kimlik bilgisi. |
| `KAPLUMBAGA_KEYSTORE_PATH` | `C:\secure\kaplumbaga-release.jks` | Android release imzalama keystore yolu. |
| `KAPLUMBAGA_KEYSTORE_PASSWORD` | gizli değer | Android release store parolası. |
| `KAPLUMBAGA_KEY_ALIAS` | `kaplumbaga` | Android release key alias değeri. |
| `KAPLUMBAGA_KEY_PASSWORD` | gizli değer | Android release key parolası. |

## API URL Ayarı

Lokal geliştirmede frontend varsayılan olarak `http://127.0.0.1:4000` adresine istek atar.

Canlı yayında Netlify ortam değişkenlerinde şunu ayarlayın:

```text
VITE_API_URL=https://render-backend-adresin.onrender.com
```

Uygulama içindeki sunucu URL ayarı hatalı, eski veya `0.0.0.0` gibi geçersiz bir adres olursa güvenli varsayılana döner.

## Deploy Checklist

- Render üzerinde backend servisini kur.
- Production için `JWT_SECRET` değerini güçlü ve gizli yap.
- Production için `CORS_ORIGIN` değerini Netlify domainine sabitle.
- Production için PostgreSQL `DATABASE_URL` kullan.
- Netlify üzerinde `VITE_API_URL` değerini Render backend URL’si yap.
- Netlify build command: `npm run build`
- Netlify publish directory: `dist`
- Render health endpointini kontrol et: `/health`
- Dosya yükleme için Render diskinin kalıcı olmadığını unutma; production’da obje depolama planla.

## Android APK

Web build ve Capacitor sync:

```powershell
npm run android:sync
```

Debug APK üretimi:

```powershell
cd android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
.\gradlew.bat assembleDebug
```

Üretilen debug APK:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

Release APK/AAB için Android signing keystore gerekir. Keystore dosyası ve parolaları repoya commit edilmemelidir.

Release keystore üretimi örneği:

```powershell
keytool -genkeypair -v -keystore "$env:USERPROFILE\kaplumbaga-release.jks" -alias kaplumbaga -keyalg RSA -keysize 2048 -validity 10000
```

İmzalı release APK üretimi:

```powershell
cd android
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
$env:KAPLUMBAGA_KEYSTORE_PATH="$env:USERPROFILE\kaplumbaga-release.jks"
$env:KAPLUMBAGA_KEYSTORE_PASSWORD="gizli-store-parolasi"
$env:KAPLUMBAGA_KEY_ALIAS="kaplumbaga"
$env:KAPLUMBAGA_KEY_PASSWORD="gizli-key-parolasi"
.\gradlew.bat assembleRelease
```

Keystore env değişkenleri yoksa Gradle `app-release-unsigned.apk` üretir. Env değişkenleri varsa release build imzalı olur.

## Bilinen Kısıtlar / Yapılacaklar

- Render free plan uykuya geçebilir; ilk istek gecikebilir.
- Upload dosyaları şu an lokal/Render diskine yazılır; production’da kalıcı obje depolama gerekir.
- WebRTC arama STUN ile çalışır; production için `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` ayarlanmalıdır.
- Netlify Function dosyası legacy/opsiyonel fallback olarak durur; ana canlı backend Render Node.js servisidir.
- Gerçek SMS/OTP doğrulaması bağlı değildir.
