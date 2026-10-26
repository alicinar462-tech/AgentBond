# AgentBond — Refund Politikası Ekonomik ve Teknik İnceleme Raporu

**Tarih:** 20 Ekim 2026  
**Kapsam:** `requestRefund()` implementasyonu, ilgili testler, NatSpec belgeleri, MVP kapanış raporu  
**Yöntem:** Salt okunur kaynak incelemesi — hiçbir dosya değiştirilmedi

---

## 1. Mevcut Davranışın Teknik Özeti

### `requestRefund()` — Tam Koşul Analizi

**Dosya:** `contracts/AgentBondEscrow.sol`, satır 253–275

```solidity
function requestRefund(uint256 taskId) external nonReentrant {
    Task storage task = _requireExists(taskId);
    if (msg.sender != task.employer) revert NotEmployer(taskId);

    TaskState state = task.state;
    if (state != TaskState.Funded && state != TaskState.Submitted) {
        revert InvalidState(taskId, state);
    }
    if (block.timestamp < task.deadline) {
        revert DeadlineNotReached(taskId, task.deadline, block.timestamp);
    }

    // ...
    task.state = TaskState.Refunded;
    usdc.safeTransfer(employer, amount);
}
```

**Soru 1 — Hangi durumlarda çalışıyor?**

| Görev Durumu | Refund Mümkün mü? |
|---|---|
| `Created` | **HAYIR** — `InvalidState` fırlatılır |
| `Funded` | **EVET** — `block.timestamp >= deadline` koşuluyla |
| `Submitted` | **EVET** — `block.timestamp >= deadline` koşuluyla |
| `Completed` | **HAYIR** — `InvalidState` fırlatılır |
| `Refunded` | **HAYIR** — `InvalidState` fırlatılır |

**Soru 2 — `Funded` ve `Submitted` için koşullar aynı mı?**

[DOĞRULANDI] Evet. Kod satır 258'de `state != TaskState.Funded && state != TaskState.Submitted` şeklinde her iki durumu da tek bir koşulla kontrol ediyor. İki durum için farklı bir zaman eşiği, kooling-off süresi veya ek guard bulunmuyor. `Submitted` durumu `Funded` ile tamamen eşdeğer muamele görüyor.

**Soru 3 — `submitWork()` önceden yapılmış olması refund'u engelliyor mu?**

[DOĞRULANDI] **HAYIR.** Kontrat kodu bu iki işlemi bağımsız olarak değerlendiriyor. `submitWork()` sonrası durum `Submitted` oluyor; ancak bu durum `requestRefund()` koşulunda `Funded` ile özdeş ele alınıyor. Engelleyici bir mekanizma yok.

**Soru 4 — Refund sonrası durum ve bakiye değişimi:**

| Değişken | Önceki Değer | Sonraki Değer |
|---|---|---|
| `task.state` | `Funded` veya `Submitted` | `Refunded` |
| `escrow USDC bakiyesi` | `task.amount` | `escrow - task.amount` |
| `employer USDC bakiyesi` | önceki değer | `önceki + task.amount` |
| `provider USDC bakiyesi` | değişmez | değişmez |

`Refunded` terminal durum — sonrasında hiçbir işlem yapılamaz.

---

## 2. İlgili Kod ve Test Referansları

### Sözleşme Kodu Referansları

| Konum | İçerik |
|---|---|
| `AgentBondEscrow.sol` satır 14 (`@notice`) | "After the deadline the employer may request a refund **regardless of whether work was submitted**." |
| `AgentBondEscrow.sol` satır 21 (`@dev` lifecycle) | `requestRefund() → Refunded (employer, Funded\|Submitted → Refunded, >= deadline)` |
| `AgentBondEscrow.sol` satır 244–249 (`@dev` provider note) | "Provider note: the employer retains refund rights after the deadline even when work has been submitted but not yet approved. Providers must treat the deadline as a hard commitment and negotiate any extension before it passes." |
| `AgentBondEscrow.sol` satır 258–260 | `if (state != TaskState.Funded && state != TaskState.Submitted) revert InvalidState(...)` |

### Test Referansları

**Soru 5 — İlgili unit testler:**

| Test | Dosya/Satır | Doğrulanan Koşul |
|---|---|---|
| `test_H5_refund_fromFunded` | Satır 184–198 | `Funded` durumdan refund — deadline'a warp edildi, employer tam miktarı geri aldı |
| `test_H6_refund_fromSubmitted` | Satır 201–215 | `Submitted` durumdan refund — iş teslim edilmesine rağmen employer iade aldı; `assertEq(token.balanceOf(employer), empBefore + AMOUNT, "employer should be refunded even after submission")` |
| `test_R9_refund_beforeDeadline` | Satır 415–427 | Deadline öncesi refund `DeadlineNotReached` fırlatıyor |
| `test_S9_refund_onCreated` | Satır 552–564 | `Created` durumda refund `InvalidState` fırlatıyor |
| `test_S10_refund_onCompleted` | Satır 567–580 | `Completed` durumda refund `InvalidState` fırlatıyor |
| `test_S11_refund_alreadyRefunded` | Satır 583–596 | Çift refund `InvalidState` fırlatıyor |
| `testFuzz_F3_refundWithAmount` | Satır 954–972 | 256 rastgele miktar ile `Funded → Refunded` muhasebesi |
| Invariant handler `requestRefund` | Satır 1058–1068 | `Funded\|Submitted` + deadline geçmiş koşulunda refund, `expectedEscrowBalance` düşürülüyor |

H-6 özellikle kritik: assert mesajı **"employer should be refunded even after submission"** — bu davranış yanlışlıkla değil, bilinçli olarak test edilmiş ve assertion mesajına yazılmış.

### MVP Kapanış Raporu Referansı

**Soru 6 — `docs/mvp-closure-report.md`, Bölüm 3 "Geri Ödeme Kuralları" (satır 92–98):**

> "Employer, son tarih geçtikten sonra (`block.timestamp >= deadline`) Funded veya Submitted görevlerde iade talep edebilir."  
> "**Kritik:** Provider son tarihten önce iş teslim etse bile employer iade alabilir. Bu onaylı ürün kararıdır, bug değildir."  
> "Durum: Doğrulandı — Tasarım gereği, **Kaygı gerektirmez**"

Aynı raporda "Bilinen Tasarım Sınırlamaları" tablosunda (satır 119–129):

> "İkili onay (arbitrasyon yok) — Employer onaylamayı reddedebilir; provider ödemeyi zorlayamaz — Hayır — v2 özelliği"

---

## 3. İşveren ve Sağlayıcı Açısından Riskler

### 3a. Kod ve Testlerin Gösterdiği Kesin Gerçekler

[DOĞRULANDI]

1. Provider, deadline öncesinde `submitWork()` çağırsa bile, employer deadline sonrası `requestRefund()` çağırabilir ve tam miktarı geri alır.
2. Provider'ın `Submitted` → `Completed` geçişini tetikleyebileceği hiçbir mekanizma yoktur — yalnızca employer `approveWork()` çağırabilir.
3. Kontrat, `submitWork()` zamanını kayıt altında tutar (state `Submitted` olarak güncellenir) ama bu bilgi `requestRefund()` için hiçbir önkoşul oluşturmuyor.
4. `Submitted` durumdan refund'un provider bakiyesine hiçbir etkisi yoktur — provider sıfır alır.
5. Teslim zamanı (ne zaman `submitWork()` çağrıldığı) blockchain'de `WorkSubmitted` event ile kanıtlanabilir durumdadır ama kontrat bu kanıtı refund engelleyici olarak kullanmıyor.

### 3b. Çıkarımlar (Koddan Destekli ama Dolaylı)

[DOĞRULANDI — kısmi]

- Sağlayıcı açısından **deadline, gerçek bir teslim son tarihi değil, ödeme penceresi sona eriş tarihidir.** Sağlayıcı deadline'a kadar çalışıp işi teslim etse bile, employer onaylamazsa ve deadline geçerse, sağlayıcı hiçbir şey alamaz.
- İşveren açısından deadline, onay için maksimum bekleme süresidir — deadline sonrası her zaman tüm parayı geri alma hakkı vardır.
- Kontrat açıkça "Providers must treat the deadline as a hard commitment" (satır 248) ifadesini kullanıyor. Bu ekonomik beklentiyi açıklıyor ama enforce etmiyor.

### 3c. Kanıtlanmamış Varsayımlar

[KANIT YETERSİZ]

- Employer'ın `approveWork()` çağırmayacağı senaryolarda (kasıtlı veya ihmal) provider'ın başvurabileceği herhangi bir çözüm mekanizmasının varlığı.
- Provider'ın makul sürede teslim etmesi durumunda employer'ın rasyonel olarak `approveWork()` yerine `requestRefund()` seçmeyeceği varsayımı — bu ekonomik beklenti, kodda değil kullanıcı davranışında.
- İşin kalitesini değerlendirme mekanizmasının gerekliliği — kontrat bunu ölçmüyor.

---

## 4. Tasarım Riski Değerlendirmesi

### Ana Ağ Öncesi Alınması Gereken Karar

**[TASARIM RİSKİ]**

| Risk | Kod Referansı | Pratik Etki |
|---|---|---|
| Teslim edilmiş işin refund'u engellemesi | `requestRefund()` satır 258 — `Submitted` filtre yok | Sağlayıcı, deadline öncesi teslim edip ödeme almayabilir; bu bilgi Solidity testlerinde (H-6) açıkça doğrulanmış |
| Employer inaction riski | `approveWork()` employer-only | Employer onaylamazsa, deadline geçerse, provider hiçbir şey alamaz; kontrat bu davranışı engelleyecek mekanizma içermiyor |
| Asimetrik müzakere gücü | Deadline sabit (`createTask` sonrası değiştirilemez) | Provider deadline'ı kabul ederek sözleşmeye giriyor; ama deadline uzatma veya uyuşmazlık çözüm mekanizması yok |

Bu tasarım **kasıtlıdır** — hem NatSpec (satır 244–249), hem MVP raporu (satır 94), hem de H-6 test assertion mesajında açıkça belgelenmiştir. Bu gerçekleri tespit etti; onaylanması başka bir sorudur.

---

## 5. Alternatif Tasarım Seçenekleri

**Not:** Aşağıdaki alternatifler yalnızca değerlendirme amaçlıdır; mevcut kontrat değiştirilmedi.

### Alternatif A — `Submitted` Durumundan Refund'u Engelleme

**[ALTERNATİF]**

```solidity
// requestRefund() içinde Submitted kontrolü:
if (state == TaskState.Submitted) revert WorkAlreadySubmitted(taskId);
```

| Boyut | Değerlendirme |
|---|---|
| Avantaj | Provider teslim etmişse parasını alamaz riskini ortadan kaldırır |
| Maliyet | `Submitted` durumda kilitli USDC: employer onaylamazsa, provider teslim etmişse, fonlar süresiz kilitli kalır |
| Yeni risk | Employer inaction lock — yeni `ProviderCanForceRelease` mekanizması gerektirir |
| MVP etkisi | Kontrat yeniden yazılmalı, yeni test seti, yeni audit kapsamı |

### Alternatif B — Teslim Sonrası Zaman Penceresi

**[ALTERNATİF]**

Provider `submitWork()` çağırdıktan sonra employer için N günlük onay/itiraz penceresi; pencere geçmişse ödeme otomatik serbest bırakılır.

| Boyut | Değerlendirme |
|---|---|
| Avantaj | Provider teslim ettikten sonra ilave koruma; employer'a değerlendirme süresi |
| Maliyet | `approveWork()` pull pattern → push pattern'e geçiş; block.timestamp manipülasyon riski artar; "push" transferin kimin başlatabileceği yeni erişim kontrolü sorusu |
| MVP etkisi | Önemli ölçüde karmaşık kontrat; v2 kapsamı |

### Alternatif C — Üçüncü Taraf Arbitratör Rolü

**[ALTERNATİF]**

`createTask()` sırasında isteğe bağlı `arbitrator` adresi belirleme; uyuşmazlık durumunda arbitratör `Submitted` → `Completed` veya `Submitted` → `Refunded` geçişini tetikleyebilir.

| Boyut | Değerlendirme |
|---|---|
| Avantaj | Uyuşmazlık çözüm mekanizması; employer/provider bağımlılığı azalır |
| Maliyet | Arbitratör güven sorunu (key management, collusion); `arbitrator == address(0)` durumu yönetimi; audit kapsamı önemli ölçüde genişler |
| MVP etkisi | v2 kapsamı — MVP kapanış raporunda P-3 olarak listelenmiş |

### Mevcut Tasarım (Seçenek D)

**[DOĞRULANDI — Bilinçli Karar]**

Deadline sonrası her iki durumdan refund: basit, tahmin edilebilir, audit kapsamı dar. Provider riski kullanım kılavuzuna ve sosyal sözleşmeye yıkılıyor. Kod NatSpec ve MVP raporu bunu açıkça belgeliyor.

---

## 6. Sonuç

### Teknik Özet

- `requestRefund()`, `Funded` ve `Submitted` durumlarını özdeş olarak işliyor; `submitWork()` çağrılmış olması refund'u etkilemiyor.
- Bu davranış sözleşme NatSpec'inde, MVP kapanış raporunda ve H-6 test assertion mesajında üç ayrı yerde açıkça belgelenmiş.
- Test H-6 bu davranışı bir bug olarak değil, doğrulanmış ürün kuralı olarak kanıtlıyor.

### Ana Ağ Öncesi Alınması Gereken Karar

Mevcut tasarım kasıtlı ve belgelenmiştir. Mainnet öncesi şu sorunun cevaplanması gerekiyor:

**"Gerçek değer içeren bir mainnet ortamında, sağlayıcının teslim zamanına bakılmaksızın employer'ın her zaman tüm USDC'yi geri alabileceği bir sistem kabul edilebilir mi?"**

Bu sorunun yanıtı üretim kullanımına ve hedef kullanıcı profiline bağlıdır:

- Cevap **EVET** ise: Mevcut tasarım değişmeden mainnet'e gidebilir. Kullanıcı dokümantasyonu provider riskini açıkça belirtmelidir.
- Cevap **HAYIR** ise: En az Alternatif A değerlendirilmeli; bu kapsam değişikliği yeni sözleşme, test ve audit döngüsü gerektirir.

Bu kararın B-2 (bağımsız güvenlik denetimi) öncesinde alınması önerilir — denetim kapsamı tasarım tercihine göre farklılaşır.
