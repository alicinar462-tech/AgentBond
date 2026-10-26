# AgentBond — Kabul Edilen MVP Riskleri

**Belge türü:** Risk kaydı  
**Tarih:** 20 Ekim 2026  
**Kapsam:** `AgentBondEscrow.sol` B politikası sürümü (Arc Testnet; mainnet deploy bağımsız güvenlik denetimi tamamlanmadan yapılmayacak)

---

## Önemli Not

Bu belgede listelenen riskler, bağımsız bir güvenlik denetiminin yerini **tutmaz**. Her risk MVP kapsamında bilinçli olarak kabul edilmiştir. Mainnet deploy öncesinde bağımsız profesyonel denetim zorunludur.

---

## R-1: USDC Blocklist Nedeniyle Kalıcı Fon Kilitlenmesi

**Kategori:** Operasyonel risk (USDC protokol seviyesi)  
**Karar:** Kabul edildi — kurtarma mekanizması eklenmeyecek (MVP)

### Teknik Açıklama

`AgentBondEscrow` tüm ödemeleri doğrudan hedef adrese gönderir (push-payment modeli). Kontrat, aşağıdaki transfer noktalarında `usdc.safeTransfer(recipient, amount)` çağırır:

| Fonksiyon | Transfer alıcısı |
|---|---|
| `approveWork()` | `task.provider` |
| `claimPayment()` | `task.provider` |
| `requestRefund()` | `task.employer` |

Circle, USDC kontratında belirli adreslere yapılan transferleri engelleyebilir. Bu mekanizma standart Circle USDC implementasyonunun bir parçasıdır.

### Kilitlenme Koşulları

**Senaryo A — Provider adresi blocklist'te:**

1. Görev `Submitted` durumunda.
2. Provider adresi USDC blocklist'e alındı.
3. `approveWork()` çağrısı `safeTransfer(provider, amount)` üzerinde revert eder.
4. `claimPayment()` çağrısı da aynı şekilde revert eder.
5. `reviewWindow` (5 gün) boyunca employer `requestRefund()` ile geri alabilir.
6. `reviewWindow` dolduktan sonra `requestRefund()` `ReviewWindowExpired` hatası verir.

**Sonuç:** `reviewWindow` içinde employer refund yapmazsa **fonlar kalıcı olarak kilitlenir.** Kontrat bu durumu çözemez; admin escape hatch yoktur.

**Senaryo B — Employer adresi blocklist'te:**

1. Employer `requestRefund()` çağırır.
2. `safeTransfer(employer, amount)` revert eder.
3. Provider `reviewWindow` dolunca `claimPayment()` çağırabilir — provider bu senaryodan korunmuştur.

**Sonuç:** Employer refund alamaz ancak provider ödemeyi alabilir. Fon kilitlenmesi oluşmaz.

**Senaryo C — Her iki adres de blocklist'te:**

Hem provider hem employer blocklist'teyse tüm payout yolları revert eder.

**Sonuç:** Fonlar kalıcı olarak kilitlenir.

### Azaltma Önlemleri (Uygulanan)

- **`reviewWindow` süresi boyunca employer refund hakkı aktiftir.** Provider blocklist'e alınmadan önce employer `reviewWindow` (5 gün) boyunca `requestRefund()` çağırarak fonları kurtarabilir.
- **`reviewWindow` parametresi deploy sırasında yapılandırılabilir.** Daha uzun bir pencere (maksimum 30 gün), employer'ın müdahale etme olasılığını artırır.

### Kullanıcı Rehberi

**Provider olarak:**
- Ödemenizin alındığı adresin Circle'ın USDC blocklist politikasına uygunluğundan emin olun.
- AI agent olarak çalışıyorsanız `reviewWindow` bitiş zamanını (submissionTime + 432000 saniye) izleyen bir mekanizma kurun. Bu süre dolmadan `claimPayment()` çağrısını yapın.
- `reviewWindow` dolduğunda `claimPayment()` başarısız olursa adres blocklist durumunuzu kontrol edin.

**Employer olarak:**
- `reviewWindow` (5 gün) sona ermeden önce işi inceleyin: `approveWork()` veya `requestRefund()` çağırın.
- Provider adresinin blocklist'te olduğunu düşünüyorsanız `reviewWindow` içinde `requestRefund()` ile fonları kurtarabilirsiniz.
- `reviewWindow` bittikten sonra refund hakkınız sona erer.

**Her iki taraf için:**
- Kontratın admin escape hatch'i yoktur. Fon kilitlenmesi oluşursa onchain müdahale imkânı yoktur.
- Bu kısıtlamayı kabul etmiyorsanız platformu kullanmayın.

---

## R-2: İki Tarafın Hareketsizliğiyle Fon Kilitlenmesi

**Kategori:** Operasyonel risk  
**Karar:** Kabul edildi

Hem provider hem employer `reviewWindow` boyunca ve sonrasında hareketsiz kalırsa:

- Employer `reviewWindow` içinde refund yapmadı.
- Provider `reviewWindow` sonrasında `claimPayment()` yapmadı (örneğin private key kaybı, agent çökmesi).

**Sonuç:** Fonlar `Submitted` durumunda kalıcı olarak kilitlenir. Kurtarma mekanizması yoktur.

Bu risk tüm kurtarma mekanizmasız escrow sözleşmelerinde var olan temel bir risk sınıfıdır ve MVP tasarımının bilerek yaptığı bir tercihtir.

---

## R-3: block.timestamp Manipülasyonu

**Kategori:** Teknik risk (zaman bağımlılığı)  
**Karar:** Kabul edildi

Kontrat, `submitWork()` zamanlaması (`submissionTime`), deadline kontrolü ve `reviewWindow` hesaplaması için `block.timestamp` kullanır. Arc Testnet ve Arc Mainnet'te validator'lar timestamp'ı birkaç saniye ileri veya geri manipüle edebilir.

Bu manipülasyon `reviewWindow` sınırında birkaç saniyelik kayma oluşturabilir. Pratikte bu, yalnızca sınırda olan işlemleri etkiler ve saldırganın validator olmasını gerektirir. Sınırda olmayan işlemler etkilenmez.

Bu risk fonksiyon bazlı `nonReentrant` ve CEI korumaları ile azaltılmıştır; ek önlem gerekmemektedir.

---

## R-4: İkili Onay Gerekliliği (Arbitrasyon Yok)

**Kategori:** Tasarım kısıtlaması  
**Karar:** Kabul edildi — v2 özelliği

`approveWork()` yalnızca employer tarafından çağrılabilir. Provider onayı zorlayamaz; tek seçeneği `reviewWindow` dolunca `claimPayment()` çağırmaktır. Employer bu süre içinde onaylamayı veya refund talep etmeyi reddederse:

- Employer `approveWork()` çağırmazsa provider `reviewWindow` sonrasında `claimPayment()` ile ödemeyi alır.
- Employer `requestRefund()` çağırırsa (pencere içinde) provider ödeme alamaz; itiraz mekanizması yoktur.

Arbitrasyon veya itiraz mekanizması MVP kapsamı dışındadır.

---

## Özet Tablo

| Risk | Kilitlenme Kalıcı mı? | Employer Etkileniyor mu? | Provider Etkileniyor mu? | Çözüm |
|---|---|---|---|---|
| R-1A: Provider blocklist | Evet (reviewWindow geçtikten sonra) | reviewWindow içinde refund alabilir | Ödeme alamaz | reviewWindow içinde employer müdahalesi |
| R-1B: Employer blocklist | Hayır | Refund alamaz | claimPayment çalışır | Provider korunuyor |
| R-1C: Her ikisi blocklist | Evet | Refund alamaz | Ödeme alamaz | Yok |
| R-2: İki taraf hareketsiz | Evet | — | — | Yok |
| R-3: Timestamp manipülasyonu | Hayır | Sınırdaki işlemler | Sınırdaki işlemler | Pratikte düşük etki |
| R-4: Arbitrasyon yok | Hayır | — | Employer reddi riski | v2 özelliği |
