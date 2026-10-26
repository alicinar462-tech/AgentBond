# AgentBond — Arc Microgrants Başvuru Paketi

**Program:** Arc Microgrants: Built with Arc Studio (DoraHacks)
**Başvuru linki:** https://dorahacks.io/hackathon/arc-microgrants-2/detail
**Resmi son tarih:** 1 Kasım 2026
**İç hedef:** 27 Ekim 2026
**Ödül:** 8 × 500 USDC ($4,000 havuz)

---

## Başvuru Kontrol Listesi

| # | Gereksinim | Durum | Notlar |
|---|---|---|---|
| 1 | Arc Studio proje URL | HAZIR (siz tamamlarsınız) | Tarayıcı adres çubuğunda — `https://studio.arc.io/app/…` |
| 2 | Çalışan uygulama public URL | **EKSİK** | Netlify/HF/Vercel deploy gerekiyor |
| 3 | Arc Mainnet kontrat adresi | **EKSİK — BLOKER** | Deploy yapılmadı |
| 4 | Arc Mainnet USDC tx hash + explorer.arc.io linki | **EKSİK — BLOKER** | Mainnet tx yok |
| 5 | Public GitHub repo URL | **EKSİK** | Push yapılmadı |
| 6 | Video walkthrough | **EKSİK** | Henüz çekilmedi |
| 7 | Proje tanımı | HAZIR | Aşağıda |
| 8 | Builder profil URL (GitHub/X/Farcaster) | Sizin onaylamanız gerekiyor | |

---

## Hazır Materyaller

### Proje Tanımı (başvuruya kopyalanabilir)

AgentBond is an escrow-based USDC task platform for humans and AI agents on Arc. Employers create tasks, fund them with USDC, and release payment to providers after reviewing submitted work. Built with B-policy: after submitting work, providers automatically claim payment via claimPayment() once the employer's review window expires — no trust required. Built entirely in Arc Studio: Solidity contract (364 lines), 81 Solidity tests (unit/fuzz/invariant), 88 frontend tests, and a full React/wagmi app. Arc's USDC-as-gas model means both deployment and transactions use a single token.

### Testnet Kanıtı (başvuruda kullanılamaz — sadece kayıt amaçlı)

| Kontrat | Adres | Tx | Sonuç |
|---|---|---|---|
| v1 (A-policy) | 0x49B6c8B5bdDD283428fA7122B4DBa06cEC5957CC | 0x2573c50f… | Arc Testnet |
| v2-test 1-gün | 0x9c291d4e676ecf3ee4794bc21c34a4fef2ab84c5 | 0xf213b886 (kısa) | Arc Testnet |
| v2-test 3-gün | 0x48f859a5fce7e0677470d25cec8e5acd833b2cad | 0x9df02278… | Arc Testnet |
| T-7 claimPayment | — | 0x32ef687f… | Arc Testnet, block 69171182 |
| T-7b claimPayment | — | 0x1f338800… | Arc Testnet, block 69171182 |

### Video Walkthrough Taslağı

1. Arc Studio oturumunu aç — kontrat editörü, Solidity kaynak kodu, test çıktısı göster
2. Arc Testnet preview: görev oluşturma, USDC onayı, fundTask
3. submitWork ve approveWork akışı
4. claimPayment akışı (reviewWindow sonrası)
5. Arc Mainnet deploy txini explorer.arc.io'da göster (deploy sonrası)
6. Mainnet gerçek USDC hareketini gösteren txleri göster

---

## Değerlendirme Kriterleri

| Kriter | Ağırlık | AgentBond'un Konumu |
|---|---|---|
| Arc Mainnet'te gerçek USDC (kontrat adresi + tx hash) | %30 | Mainnet deploy sonrası tam |
| Arc Studio kullanımı (kontrat, test, uygulama) | %25 | Tam — kontrat, 81+88 test, React app hepsi Arc Studio'da |
| Çalışan ürün | %25 | Public URL deploy sonrası tam |
| Daha ileri gitme potansiyeli | %20 | AI agent payments, escrow, claimPayment — program hedefiyle örtüşüyor |

---

## Mainnet Hazırlık Özeti

Kontrat ve testler hazır. Mainnet için yapılması gerekenler proje sahibi tarafından:

1. Bağımsız güvenlik denetimi (B-2) — tek gerçek teknik bloker
2. Mainnet deploy: `forge create` ile kendi wallet'ınızdan
3. En az 1 mainnet USDC txini gönderin
4. GitHub push, public URL deploy, video

Tarih: 2026-10-26
