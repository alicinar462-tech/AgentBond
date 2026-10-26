# AgentBond — Refund Politikası Ürün Kararı Kaydı

**Belge türü:** Ürün kararı kaydı (açık karar — yanıt bekleniyor)
**Tarih:** 20 Ekim 2026
**Hazırlayan:** Arc Studio (kaynak incelemesi)
**Kaynaklar:**
- `contracts/AgentBondEscrow.sol` — implementasyon ve NatSpec
- `contracts/test/AgentBondEscrow.t.sol` — test H-6 ve ilgili testler
- `docs/mvp-closure-report.md` — Bölüm 3 "Geri Ödeme Kuralları"
- `docs/refund-policy-review.md` — teknik ve ekonomik inceleme raporu

---

## 1. Mevcut Davranış

`AgentBondEscrow.requestRefund()` fonksiyonu şu koşullarda çalışır:

- Çağıran `msg.sender` görevin `employer`'ı olmalıdır.
- Görev `Funded` veya `Submitted` durumunda olmalıdır.
- `block.timestamp >= task.deadline` koşulu sağlanmalıdır.

Bu üç koşul sağlandığında employer tam `task.amount` USDC'yi geri alır. Görev durumu kalıcı olarak `Refunded`'a geçer. Provider bakiyesi değişmez — provider sıfır alır.

**`Submitted` durumu `Funded` durumuyla özdeş muamele görür.** Kontrat kodu bu iki durumu tek bir koşulda (`state != TaskState.Funded && state != TaskState.Submitted`) ele alır; aralarında hiçbir fark gözetmez. Provider'ın `submitWork()` işlemini deadline öncesinde yapmış olması `requestRefund()` için ne ek bir engel ne de ek bir koşul oluşturur.

**Kaynak:** `AgentBondEscrow.sol` satır 253–275 (implementasyon), satır 14 (`@notice`), satır 244–249 (`@dev` provider note).

---

## 2. Bu Kararın MVP'deki Durumu

Bu davranış testnet geliştirme sürecinde bilinçli bir ürün kararı olarak onaylanmış ve üç ayrı yerde açıkça belgelenmiştir:

**Sözleşme `@notice` (satır 14):**
> "After the deadline the employer may request a refund regardless of whether work was submitted."

**Sözleşme `@dev` provider note (satır 244–249):**
> "Provider note: the employer retains refund rights after the deadline even when work has been submitted but not yet approved. Providers must treat the deadline as a hard commitment and negotiate any extension before it passes."

**`docs/mvp-closure-report.md`, Bölüm 3 (satır 94):**
> "Provider son tarihten önce iş teslim etse bile employer iade alabilir. **Bu onaylı ürün kararıdır, bug değildir.**"

Aynı raporda "Bilinen Tasarım Sınırlamaları" tablosunda (satır 123):
> "İkili onay (arbitrasyon yok) — Employer onaylamayı reddedebilir; provider ödemeyi zorlayamaz — Hayır — v2 özelliği"

Bu kararı yazılı olarak onaylayan kişi veya tarih mevcut belgelerden tespit edilememiştir. Kayıt, davranışın teknik açıdan bilinçli ve belgelenmiş olduğunu göstermekte; ancak kararın kim tarafından ve ne zaman resmi olarak onaylandığına dair imzalı bir iz bulunmamaktadır.

---

## 3. Provider Açısından Ekonomik Sonuç

Mevcut tasarımda sağlayıcının ekonomik konumu şöyledir:

- Provider, `submitWork()` çağrısını deadline öncesinde tamamlayabilir. Bu işlem blockchain'de `WorkSubmitted` event ile zaman damgalı olarak kanıtlanır.
- Ancak bu kanıt, kontrat tarafından refund engelleyici olarak kullanılmaz.
- `approveWork()` yalnızca employer tarafından çağrılabilir. Provider bu geçişi tetikleyemez.
- Employer deadline'a kadar `approveWork()` çağırmazsa ve deadline geçerse, employer `requestRefund()` ile tüm USDC'yi geri alabilir.
- Bu senaryoda provider hiçbir ödeme almaz; teslim ettiğinin blockchain kanıtı olsa dahi.

Bu sonuç kasıtsız bir boşluk değildir. Kontrat NatSpec'i provider'a açıkça şunu söyler: "Providers must treat the deadline as a hard commitment." Deadline, iş teslim son tarihi değil; ödeme penceresi sona eriş tarihidir.

---

## 4. Testlerin Geçmesi Ne Anlama Gelir, Ne Anlama Gelmez

`contracts/test/AgentBondEscrow.t.sol` içindeki `test_H6_refund_fromSubmitted` testi bu davranışı doğrudan sınar:

```solidity
// Test H-6: requestRefund from Submitted state
assertEq(token.balanceOf(employer), empBefore + AMOUNT,
    "employer should be refunded even after submission");
```

Bu testin geçmesi şunu kanıtlar: **implementasyon, belgelenen davranışı doğru uyguluyuştur.**

Bu testin geçmesi şunu kanıtlamaz: **bu davranışın gerçek değer içeren bir mainnet ortamında ekonomik olarak kabul edilebilir olduğu.**

Doğruluk (kodun tasarıma uygun çalışması) ile kabul edilebilirlik (tasarımın kullanıcılar için adil veya uygun olması) birbirinden farklı sorulardır. Testler birinci soruyu yanıtlar; ikinci soruyu yanıtlamaz.

---

## 5. Mainnet Öncesi Cevaplanması Gereken Soru

Aşağıdaki soru bu belge hazırlandığı tarih itibarıyla yanıtsız kalmaktadır:

> **"Gerçek değer içeren bir mainnet ortamında, sağlayıcının deadline öncesinde iş teslim etmiş olmasından bağımsız olarak, employer'ın deadline sonrasında her zaman tüm USDC'yi geri alabileceği bir sistem kabul edilebilir mi?"**

Bu soru şu nedenle kritiktir: mevcut kontrat immutable'dır. Mainnet'e deploy edildikten sonra `requestRefund()` davranışı değiştirilemez. Bir provider mainnet'te bu senaryoyla karşılaşırsa başvurabileceği onchain mekanizma yoktur.

---

## 6. Kararın Kapsamı

Bu sorunun yanıtına bağlı olarak iki yol açıktır:

### Yol A — Mevcut Politika Kabul Edilir

Mevcut `requestRefund()` implementasyonu değişmeden mainnet'e gider. Aşağıdaki ek adımlar uygulanır:

- Kullanıcı dokümantasyonu provider riskini açıkça belirtir: deadline sonrasında employer refund hakkına sahiptir, teslim zamanına bakılmaksızın.
- Frontend'de provider'a deadline yaklaşırken veya deadline geçmişken görsel uyarı gösterilmesi önerilir (`docs/mvp-closure-report.md` R-6).
- B-2 bağımsız güvenlik denetiminin kapsamı mevcut implementasyonu içerir; tasarım değişikliği denetim kapsamına girmez.

### Yol B — Mevcut Politika Revize Edilir

`Submitted` durumundan refund engellenirse veya farklı bir mekanizma eklenmesi gerekirse:

- Kontrat yeniden tasarlanır ve yeniden yazılır.
- Test paketi yeniden düzenlenir (H-6 dahil diğer etkilenen testler).
- B-2 bağımsız güvenlik denetiminin kapsamı yeni tasarımı kapsar; bu denetim yeni implementasyon tamamlandıktan sonra başlayabilir.
- Tasarım değişikliğine bağlı olarak `Submitted` durumda kilitli fonların çözüm mekanizması (örn. zaman bazlı otomatik serbest bırakma veya arbitratör rolü) da tasarım kapsamına girer.

**Bu kararın B-2 bağımsız güvenlik denetimi başlamadan önce alınması gerekir.** Denetim kapsamı seçilen yola göre farklılaşır.

---

## Belgelerde Desteklenmeyen Noktalar

Bu karar kaydı yalnızca mevcut belgelerden doğrulanabilen bilgileri içermektedir. Aşağıdaki noktalar mevcut belgelerden tespit edilememiştir ve bu belgede yer almamıştır:

- Politikayı onaylayan kişinin adı veya onay tarihi.
- Politikanın hangi kullanım senaryosu veya hedef kullanıcı profili için optimize edildiği.
- Provider'ın gerçek mainnet kullanımında bu riski nasıl yöneteceğine dair önerilmiş bir süreç.
- Alternatif tasarım seçeneklerinin (Alternatif A, B, C — bkz. `docs/refund-policy-review.md` Bölüm 5) değerlendirilip değerlendirilmediği ve neden reddedildiği.
